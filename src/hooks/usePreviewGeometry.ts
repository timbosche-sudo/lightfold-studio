import { useEffect, useRef } from 'react';
import { useProjectStore } from '../state/projectStore';
import { useViewStore } from '../state/viewStore';
import { useGeometryStore } from '../state/geometryStore';
import { geometryClient } from '../services/geometryClient';
import type { BuildJob, BuildResult, PartJob } from '../geometry/buildPart';

/** Delay before a draft is requested (coalesces bursts of input events). */
const DRAFT_DELAY_MS = 16;
/** Pause after the last edit before the full, validated build runs. */
const FULL_DELAY_MS = { assembly: 260, other: 60 };

/**
 * Keeps the viewport mesh in sync with the parameters.
 * Assemblies show an instant draft while editing, then the fused, validated
 * solid once editing pauses. Results are only accepted if they are newer than
 * what is shown (a draft never replaces a full build of the same state).
 */
export function usePreviewGeometry(): void {
  const collar = useProjectStore((s) => s.project.collar);
  const shade = useProjectStore((s) => s.project.shade);
  const calibration = useProjectStore((s) => s.project.calibration);
  const fabrication = useProjectStore((s) => s.project.fabrication);
  const part = useViewStore((s) => s.part);
  const fitTestIndex = useViewStore((s) => s.fitTestIndex);
  const setGeom = useGeometryStore((s) => s.set);
  const version = useRef(0);
  const shown = useRef({ version: -1, draft: false });

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
    const v = ++version.current;
    const accept = (result: BuildResult | null) => {
      if (!result) return;
      const s = shown.current;
      const draft = !!result.draft;
      if (v > s.version || (v === s.version && s.draft && !draft)) {
        shown.current = { version: v, draft };
        setGeom({ result, building: draft || v !== version.current, error: null });
      }
    };
    const fail = (e: Error) => setGeom({ building: false, error: e.message });
    setGeom({ building: true });
    const timers: ReturnType<typeof setTimeout>[] = [];
    if (job.part === 'assembly') {
      timers.push(setTimeout(() => geometryClient.buildCoalesced('interactive', 'draft', { ...req, draft: true }).then(accept, fail), DRAFT_DELAY_MS));
    }
    timers.push(
      setTimeout(
        () => geometryClient.buildCoalesced('full', 'preview', req).then(accept, fail),
        job.part === 'assembly' ? FULL_DELAY_MS.assembly : FULL_DELAY_MS.other,
      ),
    );
    return () => timers.forEach(clearTimeout);
  }, [collar, shade, calibration.testClearances, calibration.fitTest, fabrication.printer, fabrication.materialPreset, part, fitTestIndex, setGeom]);
}
