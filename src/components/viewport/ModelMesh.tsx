import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { Html } from '@react-three/drei';
import { useGeometryStore } from '../../state/geometryStore';
import { useViewStore } from '../../state/viewStore';
import { indexedGeometry, meshToGeometry } from './meshToGeometry';

export function ModelMesh({ dark }: { dark: boolean }) {
  const result = useGeometryStore((s) => s.result);
  const shading = useViewStore((s) => s.shading);
  const section = useViewStore((s) => s.section);
  const sectionOffset = useViewStore((s) => s.sectionOffset);
  const showBounds = useViewStore((s) => s.showBounds);

  const geometry = useMemo(() => (result ? meshToGeometry(result.mesh) : null), [result]);
  const wireGeometry = useMemo(() => (result && shading === 'wireframe' ? indexedGeometry(result.mesh) : null), [result, shading]);
  useEffect(() => () => geometry?.dispose(), [geometry]);
  useEffect(() => () => wireGeometry?.dispose(), [wireGeometry]);

  const clipping = useMemo(
    // Keeps y >= offset, so the default front view looks straight at the cut face.
    () => (section ? [new THREE.Plane(new THREE.Vector3(0, 1, 0), -sectionOffset)] : []),
    [section, sectionOffset],
  );

  const problemLines = useMemo(() => {
    if (!result || result.report.problemEdges.length === 0) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(result.report.problemEdges, 3));
    return g;
  }, [result]);
  useEffect(() => () => problemLines?.dispose(), [problemLines]);

  const problemPoints = useMemo(() => {
    if (!result || result.report.problemPoints.length === 0) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(result.report.problemPoints, 3));
    return g;
  }, [result]);
  useEffect(() => () => problemPoints?.dispose(), [problemPoints]);

  if (!geometry || !result) return null;
  const clay = dark ? '#cfc9bf' : '#d8d2c8';
  const b = result.report.stats.bounds;
  const size = result.report.stats.size;

  return (
    <group>
      {shading === 'normals' ? (
        <mesh geometry={geometry}>
          <meshNormalMaterial clippingPlanes={clipping} side={THREE.DoubleSide} />
        </mesh>
      ) : shading === 'wireframe' && wireGeometry ? (
        <mesh geometry={wireGeometry}>
          <meshBasicMaterial color={dark ? '#9fb4c8' : '#3d5266'} wireframe clippingPlanes={clipping} />
        </mesh>
      ) : (
        <>
          <mesh geometry={geometry} castShadow receiveShadow>
            <meshStandardMaterial
              color={shading === 'inspection' ? '#9aa3ab' : clay}
              roughness={0.78}
              metalness={0}
              clippingPlanes={clipping}
              side={THREE.FrontSide}
              transparent={shading === 'inspection'}
              opacity={shading === 'inspection' ? 0.55 : 1}
              polygonOffset
              polygonOffsetFactor={1}
            />
          </mesh>
          {section ? (
            // Back faces exposed by the section plane read as the cut solid.
            <mesh geometry={geometry}>
              <meshBasicMaterial color="#c2553d" side={THREE.BackSide} clippingPlanes={clipping} />
            </mesh>
          ) : null}
        </>
      )}
      {shading === 'inspection' && problemLines ? (
        <lineSegments geometry={problemLines}>
          <lineBasicMaterial color="#ff3b30" depthTest={false} />
        </lineSegments>
      ) : null}
      {shading === 'inspection' && problemPoints ? (
        <points geometry={problemPoints}>
          <pointsMaterial color="#ff9f0a" size={8} sizeAttenuation={false} depthTest={false} />
        </points>
      ) : null}
      {showBounds ? (
        <group>
          <box3Helper args={[new THREE.Box3(new THREE.Vector3(...b.min), new THREE.Vector3(...b.max)), dark ? 0x7d8794 : 0x5a6470]} />
          <Html position={[(b.min[0] + b.max[0]) / 2, b.min[1], b.min[2]]} center className="dim-label">
            X {size[0].toFixed(2)}
          </Html>
          <Html position={[b.max[0], (b.min[1] + b.max[1]) / 2, b.min[2]]} center className="dim-label">
            Y {size[1].toFixed(2)}
          </Html>
          <Html position={[b.max[0], b.min[1], (b.min[2] + b.max[2]) / 2]} center className="dim-label">
            Z {size[2].toFixed(2)}
          </Html>
        </group>
      ) : null}
    </group>
  );
}
