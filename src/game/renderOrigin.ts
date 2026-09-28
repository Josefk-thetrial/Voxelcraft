import type * as THREE from 'three';

/** Double-precision gameplay coordinates stay untouched between renders.
 * Only render transforms are rebased; a voxel never becomes a 6-million-unit
 * float32 vertex. Also restores static chunk matrices and handles F5 cameras.
 */
export function withVerticalRenderOrigin(scene: THREE.Scene, camera: THREE.Camera, render: () => void): void {
  const origin = Math.floor(camera.position.y / 256) * 256;
  if (Math.abs(origin) < 4096) { render(); return; }
  const externalCamera = camera.parent !== scene;
  const shift = (amount: number) => {
    for (const child of scene.children) {
      child.position.y += amount;
      if (!child.matrixAutoUpdate) child.updateMatrix();
    }
    if (externalCamera) camera.position.y += amount;
  };
  shift(-origin);
  try { render(); }
  finally {
    shift(origin);
    scene.updateMatrixWorld(true);
    if (externalCamera) camera.updateMatrixWorld(true);
  }
}
