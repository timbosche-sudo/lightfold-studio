import { useEffect } from 'react';
import { useProjectStore } from '../state/projectStore';
import { useViewStore } from '../state/viewStore';
import { useGeometryStore } from '../state/geometryStore';
import { geometryClient } from '../services/geometryClient';
import type { BuildJob, PartJob } from '../geometry/buildPart';

const DEBOUNCE_MS = 70;

/** Rebuilds the preview mesh (in the worker) whenever relevant parameters change. */
export function usePreviewGeometry(): void {
  const collar = useProjectStore((s) => s.project.collar);
  const shade = useProjectStore((s) => s.project.shade);
  const calibration = useProjectStore((s) => s.project.calibration);
  const fabrication = useProjectStore((s) => s.project.fabrication);
  const part = useViewStore((s) => s.part);
  const fitTestIndex = useViewStore((s) => s.fitTestIndex);
  const setGeom = useGeometryStore((s) => s.set);

  useEffect(() => {
    let job: PartJob;
    if (part === 'fit-test' && calibration.testClearances.length > 0) {
      const i = Math.min(fitTestIndex, calibration.testClearances.length - 1);
      job = { part: 'fit-test', collar, fitTest: calibration.fitTest, clearance: calibration.testClearances[i], label: i + 1 };
    } else if (part === 'collar') {
      job = { part: 'collar', collar };
    } else {
      job = { part: 'assembly', collar, shade };
    }
    const req: BuildJob = {
      job,
      quality: 'preview',
      orientation: 'installed',
      printer: fabrication.printer,
      materialPreset: fabrication.materialPreset,
    };
    setGeom({ building: true });
    const timer = setTimeout(() => {
      geometryClient
        .buildLatest('preview', req)
        .then((result) => {
          if (result) setGeom({ result, building: false, error: null });
        })
        .catch((e: Error) => setGeom({ building: false, error: e.message }));
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [collar, shade, calibration.testClearances, calibration.fitTest, fabrication.printer, fabrication.materialPreset, part, fitTestIndex, setGeom]);
}
