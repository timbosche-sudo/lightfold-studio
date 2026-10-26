import { zipSync, strToU8 } from 'fflate';
import type { BuildJob, BuildResult, PartJob } from '../geometry/buildPart';
import { writeBinaryStl } from '../geometry/export/stl';
import { geometryClient } from './geometryClient';
import { downloadBlob, slugify, type DownloadHandle } from './download';
import type { Project } from '../types/project';
import { deriveCollarDimensions } from '../geometry/collar/collar';

export interface ExportOutcome {
  ok: boolean;
  filename?: string;
  result?: BuildResult;
  download?: DownloadHandle;
  message: string;
}

function jobFor(project: Project, job: PartJob): BuildJob {
  return {
    job,
    quality: 'fabrication',
    orientation: project.fabrication.collarOrientation,
    printer: project.fabrication.printer,
    materialPreset: project.fabrication.materialPreset,
  };
}

const fmt = (n: number) => n.toFixed(2).replace(/\.?0+$/, '');

export function assemblyFilename(project: Project, diagnostic: boolean): string {
  return `LightFold_${slugify(project.name)}_Assembly${diagnostic ? '_DIAGNOSTIC' : ''}.stl`;
}

export function collarFilename(project: Project, diagnostic: boolean): string {
  return `LightFold_${slugify(project.name)}_Collar${diagnostic ? '_DIAGNOSTIC' : ''}.stl`;
}

export function fitTestFilename(project: Project, clearance: number, height: number, label: number, diagnostic: boolean): string {
  return `LightFold_${slugify(project.name)}_FitTest${String(label).padStart(2, '0')}_C${fmt(clearance)}mm_H${fmt(height)}mm${diagnostic ? '_DIAGNOSTIC' : ''}.stl`;
}

function header(project: Project, what: string): string {
  return `LightFold Studio | ${project.name} | ${what} | mm`;
}

/**
 * Complete printable lampshade: shade fused to the collar as one solid,
 * oriented as installed (collar on the build plate).
 */
export async function exportAssembly(project: Project, diagnostic: boolean): Promise<ExportOutcome> {
  const result = await geometryClient.build(jobFor(project, { part: 'assembly', collar: project.collar, shade: project.shade }));
  if (result.report.fatal && !diagnostic) {
    return { ok: false, result, message: 'Export blocked: the lampshade has fatal geometry errors. See the validation report.' };
  }
  const filename = assemblyFilename(project, diagnostic && result.report.fatal);
  const download = downloadBlob(writeBinaryStl(result.mesh, header(project, 'Shade + collar')), filename, 'model/stl');
  return { ok: true, filename, result, download, message: `Exported ${filename}` };
}

/**
 * Build at fabrication quality, validate, and download. Fatal validation errors
 * block export unless `diagnostic` is set (then the filename says so).
 */
export async function exportCollar(project: Project, diagnostic: boolean): Promise<ExportOutcome> {
  const result = await geometryClient.build(jobFor(project, { part: 'collar', collar: project.collar }));
  if (result.report.fatal && !diagnostic) {
    return { ok: false, result, message: 'Export blocked: the collar has fatal geometry errors. See the validation report.' };
  }
  const filename = collarFilename(project, diagnostic && result.report.fatal);
  const download = downloadBlob(writeBinaryStl(result.mesh, header(project, 'Collar')), filename, 'model/stl');
  return { ok: true, filename, result, download, message: `Exported ${filename}` };
}

export async function exportFitTest(project: Project, index: number, diagnostic: boolean): Promise<ExportOutcome> {
  const { testClearances, fitTest } = project.calibration;
  const clearance = testClearances[index];
  const result = await geometryClient.build(jobFor(project, { part: 'fit-test', collar: project.collar, fitTest, clearance, label: index + 1 }));
  if (result.report.fatal && !diagnostic) {
    return { ok: false, result, message: `Export blocked: fit-test ring #${index + 1} has fatal geometry errors.` };
  }
  const filename = fitTestFilename(project, clearance, fitTest.height, index + 1, diagnostic && result.report.fatal);
  const download = downloadBlob(writeBinaryStl(result.mesh, header(project, `Fit test C${fmt(clearance)}`)), filename, 'model/stl');
  return { ok: true, filename, result, download, message: `Exported ${filename}` };
}

/** All fit-test rings plus a manifest in one ZIP (one download for Safari). */
export async function exportFitTestSet(project: Project): Promise<ExportOutcome> {
  const { testClearances, fitTest } = project.calibration;
  const files: Record<string, Uint8Array> = {};
  const manifestParts: unknown[] = [];
  for (let i = 0; i < testClearances.length; i++) {
    const clearance = testClearances[i];
    const result = await geometryClient.build(jobFor(project, { part: 'fit-test', collar: project.collar, fitTest, clearance, label: i + 1 }));
    if (result.report.fatal) {
      return { ok: false, result, message: `Export blocked: fit-test ring #${i + 1} (clearance ${clearance} mm) has fatal geometry errors.` };
    }
    const filename = fitTestFilename(project, clearance, fitTest.height, i + 1, false);
    files[filename] = new Uint8Array(writeBinaryStl(result.mesh, header(project, `Fit test C${fmt(clearance)}`)));
    const d = deriveCollarDimensions({ ...project.collar, fitClearance: clearance });
    manifestParts.push({
      file: filename,
      ring: i + 1,
      idNotches: fitTest.idNotches ? i + 1 : 0,
      diametralClearanceMm: clearance,
      insertionOuterDiameterMm: Number(d.insertionOuterDiameter.toFixed(4)),
      testHeightMm: fitTest.height,
      includesShoulder: fitTest.includeShoulder,
      triangles: result.report.stats.triangles,
      volumeMm3: Number(result.report.stats.volume.toFixed(2)),
    });
  }
  const manifest = {
    generator: 'LightFold Studio',
    project: project.name,
    projectId: project.id,
    createdAt: new Date().toISOString(),
    units: 'mm',
    baseInteriorDiameterMm: project.collar.baseInteriorDiameter,
    orientation: project.fabrication.collarOrientation,
    note: 'Trial clearances, not manufacturing guarantees. Verify each STL in Bambu Studio before printing.',
    parts: manifestParts,
  };
  files['manifest.json'] = strToU8(JSON.stringify(manifest, null, 2));
  const zip = zipSync(files, { level: 6 });
  const filename = `LightFold_${slugify(project.name)}_FitTestSet.zip`;
  const download = downloadBlob(zip, filename, 'application/zip');
  return { ok: true, filename, download, message: `Exported ${filename} (${testClearances.length} rings + manifest)` };
}

export function exportProjectJson(project: Project): string {
  const filename = `LightFold_${slugify(project.name)}.lightfold.json`;
  downloadBlob(JSON.stringify(project, null, 2), filename, 'application/json');
  return filename;
}
