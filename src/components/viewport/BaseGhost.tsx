import { useMemo, useEffect } from 'react';
import * as THREE from 'three';
import { useProjectStore } from '../../state/projectStore';
import { useViewStore } from '../../state/viewStore';
import { deriveCollarDimensions } from '../../geometry/collar/collar';

const GHOST_DEPTH = 45;
const GHOST_WALL = 4;

/**
 * Reference-only rendering of the existing lamp base opening: interior
 * diameter from the project, rim at the shoulder contact plane. The rim
 * width and depth are illustrative — the app does not generate the base.
 */
export function BaseGhost({ dark }: { dark: boolean }) {
  const collar = useProjectStore((s) => s.project.collar);
  const fitTestHeight = useProjectStore((s) => s.project.calibration.fitTest.height);
  const part = useViewStore((s) => s.part);
  const section = useViewStore((s) => s.section);
  const sectionOffset = useViewStore((s) => s.sectionOffset);
  const clipping = useMemo(() => (section ? [new THREE.Plane(new THREE.Vector3(0, 1, 0), -sectionOffset)] : []), [section, sectionOffset]);
  const d = deriveCollarDimensions(collar);
  const rimZ = part === 'fit-test' ? fitTestHeight : d.rimContactZ;
  const rIn = collar.baseInteriorDiameter / 2;
  const rOut = Math.max(rIn + GHOST_WALL, d.shoulderOuterRadius + 1.5);

  const geometry = useMemo(() => {
    const pts = [
      new THREE.Vector2(rIn, rimZ - GHOST_DEPTH),
      new THREE.Vector2(rOut, rimZ - GHOST_DEPTH),
      new THREE.Vector2(rOut, rimZ),
      new THREE.Vector2(rIn, rimZ),
      new THREE.Vector2(rIn, rimZ - GHOST_DEPTH),
    ];
    return new THREE.LatheGeometry(pts, 96);
  }, [rIn, rOut, rimZ]);
  useEffect(() => () => geometry.dispose(), [geometry]);

  return (
    <mesh geometry={geometry} rotation={[Math.PI / 2, 0, 0]} renderOrder={2}>
      <meshStandardMaterial color={dark ? '#5d7186' : '#8aa0b5'} transparent opacity={0.18} depthWrite={false} side={THREE.DoubleSide} clippingPlanes={clipping} />
    </mesh>
  );
}
