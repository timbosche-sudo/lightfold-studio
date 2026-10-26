import { useEffect } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { OrbitControls, OrthographicCamera, PerspectiveCamera } from '@react-three/drei';
import * as THREE from 'three';
import { useViewStore } from '../../state/viewStore';
import { useGeometryStore } from '../../state/geometryStore';
import { useProjectStore } from '../../state/projectStore';
import { ModelMesh } from './ModelMesh';
import { BaseGhost } from './BaseGhost';
import { CameraRig } from './CameraRig';
import { ViewToolbar } from './ViewToolbar';
import { ViewportHud } from './ViewportHud';

THREE.Object3D.DEFAULT_UP.set(0, 0, 1);

/**
 * The canvas renders on demand (saves battery on iPad). Mounting/unmounting
 * scene objects does not always schedule a frame, so request one whenever
 * view settings, geometry or project dimensions change.
 */
function Invalidator() {
  const invalidate = useThree((s) => s.invalidate);
  const view = useViewStore();
  const result = useGeometryStore((s) => s.result);
  const collar = useProjectStore((s) => s.project.collar);
  useEffect(() => {
    invalidate();
  }, [view, result, collar, invalidate]);
  return null;
}

export function Viewport() {
  const orthographic = useViewStore((s) => s.orthographic);
  const showGrid = useViewStore((s) => s.showGrid);
  const showBase = useViewStore((s) => s.showBase);
  const theme = useViewStore((s) => s.theme);
  const result = useGeometryStore((s) => s.result);
  const dark = theme === 'dark';
  const gridSize = result ? Math.max(200, Math.ceil(Math.max(...result.report.stats.size) / 50) * 100) : 200;

  return (
    <div className="viewport">
      <Canvas
        frameloop="demand"
        dpr={[1, 2]}
        gl={{ antialias: true }}
        onCreated={({ gl }) => {
          gl.localClippingEnabled = true;
        }}
      >
        <color attach="background" args={[dark ? '#16181b' : '#eceae6']} />
        {orthographic ? (
          <OrthographicCamera makeDefault position={[150, -180, 140]} zoom={3} near={0.1} far={5000} />
        ) : (
          <PerspectiveCamera makeDefault position={[150, -180, 140]} fov={35} near={1} far={5000} />
        )}
        <OrbitControls makeDefault enableDamping={false} screenSpacePanning />
        <CameraRig />
        <Invalidator />
        <hemisphereLight args={[dark ? '#d6dbe3' : '#ffffff', dark ? '#2a2620' : '#b7ad9f', 1.1]} />
        <directionalLight position={[120, -160, 260]} intensity={1.6} />
        <directionalLight position={[-150, 120, 80]} intensity={0.45} />
        {showGrid ? (
          <gridHelper args={[gridSize, gridSize / 10, dark ? '#3a3f46' : '#c4c0b8', dark ? '#25282d' : '#dad6cf']} rotation={[Math.PI / 2, 0, 0]} />
        ) : null}
        <axesHelper args={[12]} />
        <ModelMesh dark={dark} />
        {showBase ? <BaseGhost dark={dark} /> : null}
      </Canvas>
      <ViewportHud />
      <ViewToolbar />
    </div>
  );
}
