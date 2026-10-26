import { useViewStore, type ShadingMode, type ViewportPart } from '../../state/viewStore';
import { useGeometryStore } from '../../state/geometryStore';

const SHADING: { value: ShadingMode; label: string }[] = [
  { value: 'clay', label: 'Clay' },
  { value: 'wireframe', label: 'Wire' },
  { value: 'normals', label: 'Normals' },
  { value: 'inspection', label: 'Inspect' },
];

const PARTS: { value: ViewportPart; label: string }[] = [
  { value: 'assembly', label: 'Lampshade' },
  { value: 'collar', label: 'Collar' },
  { value: 'fit-test', label: 'Fit ring' },
];

export function ViewToolbar() {
  const v = useViewStore();
  const size = useGeometryStore((s) => s.result?.report.stats.size);
  const cutRange = Math.ceil(((size ? Math.max(size[0], size[1]) : 120) / 2) * 1.05);
  return (
    <div className="view-toolbar" role="toolbar" aria-label="View controls">
      <div className="tool-group">
        {PARTS.map((p) => (
          <button key={p.value} type="button" className={v.part === p.value ? 'active' : ''} onClick={() => v.showPart(p.value)}>
            {p.label}
          </button>
        ))}
      </div>
      <div className="tool-group">
        <button type="button" onClick={() => v.requestView('iso')}>Fit</button>
        <button type="button" onClick={() => v.requestView('top')}>Top</button>
        <button type="button" onClick={() => v.requestView('front')}>Front</button>
        <button type="button" onClick={() => v.requestView('side')}>Side</button>
        <button type="button" className={v.orthographic ? 'active' : ''} onClick={() => v.set({ orthographic: !v.orthographic })}>
          {v.orthographic ? 'Ortho' : 'Persp'}
        </button>
      </div>
      <div className="tool-group">
        {SHADING.map((s) => (
          <button key={s.value} type="button" className={v.shading === s.value ? 'active' : ''} onClick={() => v.set({ shading: s.value })}>
            {s.label}
          </button>
        ))}
      </div>
      <div className="tool-group">
        <button type="button" className={v.section ? 'active' : ''} onClick={() => v.set({ section: !v.section })}>Section</button>
        <button type="button" className={v.showBounds ? 'active' : ''} onClick={() => v.set({ showBounds: !v.showBounds })}>Bounds</button>
        <button type="button" className={v.showBase ? 'active' : ''} onClick={() => v.set({ showBase: !v.showBase })}>Base</button>
        <button type="button" className={v.showGrid ? 'active' : ''} onClick={() => v.set({ showGrid: !v.showGrid })}>Grid</button>
        <button type="button" className={v.showDimensions ? 'active' : ''} onClick={() => v.set({ showDimensions: !v.showDimensions })}>Dims</button>
      </div>
      {v.section ? (
        <div className="tool-group section-slider">
          <label>
            Cut
            <input type="range" min={-cutRange} max={cutRange} step={0.5} value={v.sectionOffset} onChange={(e) => v.set({ sectionOffset: Number(e.target.value) })} />
          </label>
        </div>
      ) : null}
    </div>
  );
}
