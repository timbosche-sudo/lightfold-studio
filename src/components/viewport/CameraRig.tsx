import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { useThree } from '@react-three/fiber';
import { useViewStore, type ViewPreset } from '../../state/viewStore';
import { useGeometryStore } from '../../state/geometryStore';
import { thumbnailCapture } from '../../state/geometryStore';

const DIRS: Record<ViewPreset, THREE.Vector3> = {
  iso: new THREE.Vector3(1, -1.25, 0.9).normalize(),
  top: new THREE.Vector3(0, -0.0001, 1).normalize(),
  front: new THREE.Vector3(0, -1, 0),
  side: new THREE.Vector3(1, 0, 0),
};

interface ControlsLike {
  target: THREE.Vector3;
  update: () => void;
}

/** Moves the camera to view presets and fits the model; registers thumbnail capture. */
export function CameraRig() {
  const { camera, controls, size, gl, scene, invalidate } = useThree();
  const request = useViewStore((s) => s.cameraRequest);
  const orthographic = useViewStore((s) => s.orthographic);
  const result = useGeometryStore((s) => s.result);
  const fittedOnce = useRef(false);

  const fit = (preset: ViewPreset) => {
    if (!result) return;
    const b = result.report.stats.bounds;
    const center = new THREE.Vector3((b.min[0] + b.max[0]) / 2, (b.min[1] + b.max[1]) / 2, (b.min[2] + b.max[2]) / 2);
    const radius = Math.max(new THREE.Vector3(...b.max).sub(new THREE.Vector3(...b.min)).length() / 2, 10);
    const dir = DIRS[preset];
    if (camera instanceof THREE.PerspectiveCamera) {
      const fov = THREE.MathUtils.degToRad(camera.fov);
      const aspectFov = Math.min(fov, 2 * Math.atan(Math.tan(fov / 2) * camera.aspect));
      const dist = (radius / Math.sin(aspectFov / 2)) * 1.25;
      camera.position.copy(center).addScaledVector(dir, dist);
      camera.near = dist / 100;
      camera.far = dist * 20;
    } else if (camera instanceof THREE.OrthographicCamera) {
      camera.position.copy(center).addScaledVector(dir, radius * 6);
      camera.zoom = Math.min(size.width, size.height) / (radius * 2.8);
      camera.near = 0.1;
      camera.far = radius * 20;
    }
    camera.up.set(0, 0, 1);
    camera.lookAt(center);
    // Shift the framing so the model sits above the toolbar overlay at the bottom of the viewport.
    camera.updateMatrixWorld();
    const screenUp = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 1).normalize();
    const target = center.clone().addScaledVector(screenUp, -radius * 0.16);
    camera.position.addScaledVector(screenUp, -radius * 0.16);
    camera.updateProjectionMatrix();
    const c = controls as unknown as ControlsLike | null;
    if (c) {
      c.target.copy(target);
      c.update();
    }
    invalidate();
  };

  useEffect(() => {
    if (request.n > 0) fit(request.preset);
  }, [request.n]);

  useEffect(() => {
    fit('iso');
  }, [orthographic, controls]);

  useEffect(() => {
    if (!result || !controls) return;
    if (!fittedOnce.current || useViewStore.getState().fitPending) {
      fittedOnce.current = true;
      useViewStore.getState().set({ fitPending: false });
      fit('iso');
    }
  }, [result, controls]);

  useEffect(() => {
    thumbnailCapture.capture = () => {
      gl.render(scene, camera);
      const src = gl.domElement;
      const scale = 256 / Math.max(src.width, src.height);
      const c = document.createElement('canvas');
      c.width = Math.round(src.width * scale);
      c.height = Math.round(src.height * scale);
      const ctx = c.getContext('2d');
      if (!ctx) return null;
      ctx.drawImage(src, 0, 0, c.width, c.height);
      return c.toDataURL('image/jpeg', 0.8);
    };
    return () => {
      thumbnailCapture.capture = null;
    };
  }, [gl, scene, camera]);

  return null;
}
