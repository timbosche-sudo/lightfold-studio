import { useMemo } from 'react';
import type { ShadeDesign, ShadeFamilyId } from '../../types/project';
import { shadeFor } from '../../geometry/generators/registry';
import type { ShadeContext } from '../../geometry/generators/types';

const SECTION_US = [0.35, 0.7, 1];

/**
 * Tiny live drawing of a family: side silhouette (left) and top-view sections
 * at three heights (right), computed from the real generator.
 */
export function FamilySketch({ design, family, ctx, width = 76, height = 52 }: { design: ShadeDesign; family: ShadeFamilyId; ctx: ShadeContext; width?: number; height?: number }) {
  const paths = useMemo(() => {
    try {
      const { generator, params } = shadeFor(design, family);
      const { sections, silhouette } = generator.sketch(params, ctx, SECTION_US);
      const rMax = Math.max(params.maxDiameter / 2, ctx.attachment.radius);
      const side = Math.min(height / params.height, (width * 0.4) / (2 * rMax)) * 0.9;
      const sx = width * 0.22;
      const sil = silhouette.map(([x, z], i) => `${i ? 'L' : 'M'}${(sx + x * side).toFixed(1)},${(height - 3 - z * side).toFixed(1)}`).join(' ') + ' Z';
      const top = Math.min(width * 0.52, height) / (2 * rMax) * 0.92;
      const cx = width * 0.72;
      const cy = height / 2;
      const secs = sections.map((poly) => poly.map(([x, y], i) => `${i ? 'L' : 'M'}${(cx + x * top).toFixed(1)},${(cy - y * top).toFixed(1)}`).join(' ') + ' Z');
      return { sil, secs };
    } catch {
      return null;
    }
  }, [design, family, ctx, width, height]);
  if (!paths) return <svg width={width} height={height} aria-hidden />;
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden className="family-sketch">
      <path d={paths.sil} className="sk-sil" />
      {paths.secs.map((d, i) => (
        <path key={i} d={d} className="sk-sec" style={{ opacity: 0.35 + (0.65 * (i + 1)) / paths.secs.length }} />
      ))}
    </svg>
  );
}
