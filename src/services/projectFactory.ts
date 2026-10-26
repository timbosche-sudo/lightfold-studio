import type { Project, ProjectContent } from '../types/project';
import { defaultCollarParams } from '../geometry/collar/collar';
import { BAMBU_P1S } from '../geometry/presets';
import { defaultShadeDesign } from '../geometry/generators/registry';

export function uid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function defaultContent(): ProjectContent {
  return {
    collar: defaultCollarParams(),
    collarLocked: false,
    calibration: {
      testClearances: [0.2, 0.4, 0.6],
      fitTest: { height: 10, includeShoulder: true, idNotches: true },
      selectedClearance: null,
      notes: '',
    },
    fabrication: {
      printer: { ...BAMBU_P1S },
      materialPreset: 'pla-0.4',
      collarOrientation: 'inverted',
      exportHistory: [],
    },
    shade: defaultShadeDesign(),
    lighting: null,
    wledPresetId: null,
  };
}

export function newProject(name = 'Untitled Shade'): Project {
  const now = new Date().toISOString();
  return {
    schemaVersion: 1,
    id: uid(),
    name,
    createdAt: now,
    updatedAt: now,
    units: 'in',
    revisions: [],
    physicalTagId: null,
    ...defaultContent(),
  };
}

export function contentOf(p: Project): ProjectContent {
  return {
    collar: structuredClone(p.collar),
    collarLocked: p.collarLocked,
    calibration: structuredClone(p.calibration),
    fabrication: structuredClone(p.fabrication),
    shade: structuredClone(p.shade),
    lighting: p.lighting,
    wledPresetId: p.wledPresetId,
  };
}

/**
 * Accept a project from JSON (import or storage), filling any fields missing
 * from older or partial files with defaults. Throws on unusable input.
 */
export function normalizeProject(raw: unknown): Project {
  if (!raw || typeof raw !== 'object') throw new Error('Not a project file.');
  const r = raw as Partial<Project>;
  if (r.schemaVersion !== 1) throw new Error(`Unsupported project schema version: ${String(r.schemaVersion)}.`);
  const base = newProject(typeof r.name === 'string' ? r.name : 'Imported Shade');
  const d = defaultContent();
  const collar = { ...d.collar, ...(r.collar ?? {}) };
  collar.retentionLip = { ...d.collar.retentionLip, ...(r.collar?.retentionLip ?? {}) };
  collar.alignmentKey = { ...d.collar.alignmentKey, ...(r.collar?.alignmentKey ?? {}) };
  collar.magnetPockets = { ...d.collar.magnetPockets, ...(r.collar?.magnetPockets ?? {}) };
  for (const [k, v] of Object.entries({ ...collar, ...(r.shade?.cylinder ?? {}) })) {
    if (typeof v === 'number' && !Number.isFinite(v)) throw new Error(`Invalid value for ${k}.`);
  }
  return {
    ...base,
    id: typeof r.id === 'string' ? r.id : base.id,
    createdAt: r.createdAt ?? base.createdAt,
    updatedAt: r.updatedAt ?? base.updatedAt,
    units: r.units === 'mm' ? 'mm' : 'in',
    revisions: Array.isArray(r.revisions)
      ? r.revisions.map((rev) => ({
          ...rev,
          content: { ...rev.content, shade: rev.content?.shade ? { ...d.shade, ...rev.content.shade, cylinder: { ...d.shade.cylinder, ...rev.content.shade.cylinder } } : defaultShadeDesign() },
        }))
      : [],
    physicalTagId: r.physicalTagId ?? null,
    collar,
    collarLocked: !!r.collarLocked,
    calibration: {
      ...d.calibration,
      ...(r.calibration ?? {}),
      fitTest: { ...d.calibration.fitTest, ...(r.calibration?.fitTest ?? {}) },
    },
    fabrication: {
      ...d.fabrication,
      ...(r.fabrication ?? {}),
      printer: { ...d.fabrication.printer, ...(r.fabrication?.printer ?? {}) },
      exportHistory: r.fabrication?.exportHistory ?? [],
    },
    // Phase 1 projects stored `shade: null`; they receive the default shade.
    shade: {
      family: 'cylinder',
      cylinder: { ...d.shade.cylinder, ...(r.shade?.cylinder ?? {}) },
    },
    lighting: null,
    wledPresetId: r.wledPresetId ?? null,
  };
}
