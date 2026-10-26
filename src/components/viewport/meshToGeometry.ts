import * as THREE from 'three';
import { toCreasedNormals } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { MeshData } from '../../geometry/core/mesh';

/**
 * Build a renderable geometry from the fabrication mesh. Positions come
 * straight from the same MeshData that is exported; only normals are added
 * (split at creases so chamfers and shoulders read crisply).
 */
export function meshToGeometry(mesh: MeshData, creaseAngleDeg = 35): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(mesh.positions, 3));
  g.setIndex(new THREE.BufferAttribute(mesh.indices, 1));
  const creased = toCreasedNormals(g, THREE.MathUtils.degToRad(creaseAngleDeg));
  g.dispose();
  creased.computeBoundingBox();
  creased.computeBoundingSphere();
  return creased;
}

export function indexedGeometry(mesh: MeshData): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(mesh.positions, 3));
  g.setIndex(new THREE.BufferAttribute(mesh.indices, 1));
  g.computeBoundingSphere();
  return g;
}
