import { useViewStore, type ShadingMode } from '../../state/viewStore';

const SHADING: { value: ShadingMode; label: string }[] = [
  { value: 'clay', label: 'Clay' },
  { value: 'wireframe', label: 'Wire' },
  { value: 'normals', label: 'Normals' },
  { value: 'inspection', label: 'Inspect' },
];

export function ViewToolbar() {
  const v = useViewStore();
  return (
    <div className="view-toolbar" role="toolbar" aria-label="View controls">
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
            <input type="range" min={-60} max={60} step={0.5} value={v.sectionOffset} onChange={(e) => v.set({ sectionOffset: Number(e.target.value) })} />
          </label>
        </div>
      ) : null}
    </div>
  );
}
