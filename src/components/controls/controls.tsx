import { useEffect, useId, useState, type ReactNode } from 'react';
import { useProjectStore } from '../../state/projectStore';
import { formatInputValue, fromDisplay, inchFraction, mmToIn, parseLength, toDisplay } from '../../utils/units';

interface LengthFieldProps {
  label: string;
  /** Value in millimetres. */
  value: number;
  onChange: (mm: number) => void;
  min: number;
  max: number;
  /** Slider step in millimetres. */
  step?: number;
  disabled?: boolean;
  hint?: ReactNode;
  invalid?: boolean;
}

/**
 * Slider plus precise numeric entry for a length. Stores millimetres; displays
 * and accepts the current display units (or any typed suffix: mm, in, ", cm,
 * and fractions such as 3 15/16).
 */
export function LengthField({ label, value, onChange, min, max, step = 0.05, disabled, hint, invalid }: LengthFieldProps) {
  const units = useProjectStore((s) => s.project.units);
  const id = useId();
  const [draft, setDraft] = useState(formatInputValue(value, units));
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!editing) setDraft(formatInputValue(value, units));
  }, [value, units, editing]);

  const commit = () => {
    setEditing(false);
    const mm = parseLength(draft, units);
    if (mm === null) {
      setError(true);
      setDraft(formatInputValue(value, units));
      return;
    }
    setError(false);
    onChange(mm);
  };

  const frac = units === 'in' ? inchFraction(mmToIn(value)) : null;
  const sliderStep = units === 'in' ? fromDisplay(1 / 128, 'in') : step;
  const clampedSlider = Math.min(max, Math.max(min, value));

  return (
    <div className={`field ${disabled ? 'is-disabled' : ''} ${invalid ? 'is-invalid' : ''}`}>
      <div className="field-head">
        <label htmlFor={id}>{label}</label>
        <div className="field-input">
          <input
            id={id}
            type="text"
            inputMode="decimal"
            value={draft}
            disabled={disabled}
            aria-invalid={error || invalid}
            onFocus={(e) => {
              setEditing(true);
              e.currentTarget.select();
            }}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') e.currentTarget.blur();
              if (e.key === 'Escape') {
                setDraft(formatInputValue(value, units));
                setEditing(false);
              }
            }}
          />
          <span className="unit">{units === 'mm' ? 'mm' : 'in'}</span>
        </div>
      </div>
      <input
        className="slider"
        type="range"
        min={min}
        max={max}
        step={sliderStep}
        value={clampedSlider}
        disabled={disabled}
        aria-label={`${label} slider`}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      <div className="field-foot">
        <span>
          {units === 'in' ? `${toDisplay(value, 'mm').toFixed(4)} mm` : `${toDisplay(value, 'in').toFixed(4)}"`}
          {frac ? ` · ${frac}` : ''}
        </span>
        {hint ? <span className="hint">{hint}</span> : null}
      </div>
    </div>
  );
}

interface NumberFieldProps {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step?: number;
  integer?: boolean;
  suffix?: string;
  disabled?: boolean;
  /** Display multiplier (e.g. 100 to show a 0–1 value as a percentage). */
  scale?: number;
  hint?: ReactNode;
}

export function NumberField({ label, value, onChange, min, max, step = 1, integer, suffix, disabled, scale = 1, hint }: NumberFieldProps) {
  const id = useId();
  const show = (v: number) => String(Math.round(v * scale * 1000) / 1000);
  const [draft, setDraft] = useState(show(value));
  const [editing, setEditing] = useState(false);
  useEffect(() => {
    if (!editing) setDraft(show(value));
  }, [value, editing, scale]);
  const commit = () => {
    setEditing(false);
    let v = Number(draft) / scale;
    if (!Number.isFinite(v)) return setDraft(show(value));
    if (integer) v = Math.round(v);
    v = Math.min(max, Math.max(min, v));
    setDraft(show(v));
    onChange(v);
  };
  return (
    <div className={`field ${disabled ? 'is-disabled' : ''}`}>
      <div className="field-head">
        <label htmlFor={id}>{label}</label>
        <div className="field-input">
          <input
            id={id}
            type="text"
            inputMode={integer ? 'numeric' : 'decimal'}
            value={draft}
            disabled={disabled}
            onFocus={(e) => {
              setEditing(true);
              e.currentTarget.select();
            }}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
          />
          {suffix ? <span className="unit">{suffix}</span> : null}
        </div>
      </div>
      <input
        className="slider"
        type="range"
        min={min}
        max={max}
        step={step}
        value={Math.min(max, Math.max(min, value))}
        disabled={disabled}
        aria-label={`${label} slider`}
        onChange={(e) => onChange(integer ? Math.round(Number(e.target.value)) : Number(e.target.value))}
      />
      {hint ? (
        <div className="field-foot">
          <span />
          <span className="hint">{hint}</span>
        </div>
      ) : null}
    </div>
  );
}

export function Toggle({ label, checked, onChange, disabled, description }: { label: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean; description?: string }) {
  return (
    <label className={`toggle ${disabled ? 'is-disabled' : ''}`}>
      <span className="toggle-text">
        <span>{label}</span>
        {description ? <small>{description}</small> : null}
      </span>
      <input type="checkbox" role="switch" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span className="toggle-track" aria-hidden />
    </label>
  );
}

export function Segmented<T extends string>({ value, options, onChange, label }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; label?: string }) {
  return (
    <div className="segmented" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} type="button" role="radio" aria-checked={value === o.value} className={value === o.value ? 'active' : ''} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Section({ title, children, defaultOpen = true, aside }: { title: string; children: ReactNode; defaultOpen?: boolean; aside?: ReactNode }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className={`section ${open ? 'open' : ''}`}>
      <button type="button" className="section-head" onClick={() => setOpen(!open)} aria-expanded={open}>
        <span className="chev" aria-hidden>{open ? '▾' : '▸'}</span>
        <span className="section-title">{title}</span>
        {aside ? <span className="section-aside">{aside}</span> : null}
      </button>
      {open ? <div className="section-body">{children}</div> : null}
    </section>
  );
}

export function Readout({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="readout">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
