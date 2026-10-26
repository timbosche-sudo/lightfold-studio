import { LengthField, NumberField, Segmented } from '../../components/controls/controls';
import type { ControlSpec } from '../../geometry/generators/types';

/** Renders a family's declarative controls. Values are the family's own parameter object. */
export function FamilyControls({ controls, values, invalid, onChange }: {
  controls: ControlSpec[];
  values: Record<string, unknown>;
  invalid: (key: string) => boolean;
  onChange: (key: string, value: number | string) => void;
}) {
  return (
    <>
      {controls.map((c) => {
        const v = values[c.key];
        switch (c.kind) {
          case 'length':
            return <LengthField key={c.key} label={c.label} value={v as number} min={c.min} max={c.max} step={c.step} hint={c.hint} invalid={invalid(c.key)} onChange={(x) => onChange(c.key, x)} />;
          case 'angle':
            return <NumberField key={c.key} label={c.label} value={v as number} min={c.min} max={c.max} step={c.step} suffix="°" hint={c.hint} onChange={(x) => onChange(c.key, x)} />;
          case 'number':
            return (
              <NumberField
                key={c.key}
                label={c.label}
                value={v as number}
                min={c.min}
                max={c.max}
                step={c.step}
                integer={c.integer}
                scale={c.percent ? 100 : 1}
                suffix={c.percent ? '%' : c.suffix}
                hint={c.hint}
                onChange={(x) => onChange(c.key, x)}
              />
            );
          case 'choice':
            return (
              <div className="field" key={c.key}>
                <div className="field-head"><label>{c.label}</label></div>
                <Segmented value={v as string} label={c.label} options={c.options} onChange={(x) => onChange(c.key, x)} />
              </div>
            );
          case 'seed':
            return (
              <div className="field seed-field" key={c.key}>
                <div className="field-head">
                  <label>{c.label}</label>
                  <div className="seed-row">
                    <span className="seed-value">#{String(v)}</span>
                    <button type="button" className="btn small" onClick={() => onChange(c.key, Math.max(0, (v as number) - 1))} aria-label="Previous seed">‹</button>
                    <button type="button" className="btn small" onClick={() => onChange(c.key, (v as number) + 1)} aria-label="Next seed">›</button>
                    <button type="button" className="btn small" onClick={() => onChange(c.key, Math.floor(Math.random() * 100000))}>New seed</button>
                  </div>
                </div>
                <div className="field-foot"><span /><span className="hint">The same seed always rebuilds the same form</span></div>
              </div>
            );
        }
      })}
    </>
  );
}

/** Random values inside the central part of each control's range ("Vary"). */
export function varyParams(controls: ControlSpec[], current: Record<string, unknown>, spread = 0.7): Record<string, number | string> {
  const out: Record<string, number | string> = {};
  for (const c of controls) {
    if (c.kind === 'seed') out[c.key] = Math.floor(Math.random() * 100000);
    else if (c.kind === 'choice') out[c.key] = current[c.key] as string;
    else {
      const span = (c.max - c.min) * spread;
      const lo = c.min + (c.max - c.min - span) / 2;
      let v = lo + Math.random() * span;
      if (c.kind === 'number' && c.integer) v = Math.round(v);
      else v = Math.round(v / c.step) * c.step;
      out[c.key] = Number(v.toFixed(4));
    }
  }
  return out;
}
