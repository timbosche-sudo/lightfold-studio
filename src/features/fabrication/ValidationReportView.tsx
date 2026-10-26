import type { ValidationReport } from '../../geometry/validation/validateMesh';
import { useProjectStore } from '../../state/projectStore';
import { formatLength } from '../../utils/units';

const ICON = { pass: '✓', warning: '!', error: '✕', skipped: '–' } as const;

export function ValidationReportView({ report, title }: { report: ValidationReport; title: string }) {
  const units = useProjectStore((s) => s.project.units);
  const s = report.stats;
  return (
    <div className="report">
      <div className={`report-head ${report.fatal ? 'error' : report.warningCount ? 'warning' : 'pass'}`}>
        <strong>{title}</strong>
        <span>{report.fatal ? 'Fatal errors — standard export blocked' : report.warningCount ? `${report.warningCount} warning(s)` : 'All checks passed'}</span>
      </div>
      <ul className="checks">
        {report.checks.map((c, i) => (
          <li key={`${c.id}-${i}`} className={c.status}>
            <span className="icon" aria-label={c.status}>{ICON[c.status]}</span>
            <span>
              <strong>{c.label}</strong>
              <small>{c.message}</small>
            </span>
          </li>
        ))}
      </ul>
      <dl className="stats">
        <dt>Triangles</dt><dd>{s.triangles.toLocaleString()}</dd>
        <dt>Vertices</dt><dd>{s.vertices.toLocaleString()}</dd>
        <dt>Volume</dt><dd>{(s.volume / 1000).toFixed(3)} cm³</dd>
        <dt>Surface</dt><dd>{(s.surfaceArea / 100).toFixed(1)} cm²</dd>
        <dt>Genus</dt><dd>{s.genus ?? '—'}</dd>
        <dt>Size</dt><dd>{s.size.map((v) => formatLength(v, units, units === 'mm' ? 2 : 3)).join(' × ')}</dd>
      </dl>
    </div>
  );
}
