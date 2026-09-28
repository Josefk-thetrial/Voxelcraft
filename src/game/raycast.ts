// Raycasting voxel DDA (Amanatides & Woo): percorre somente as celulas
// atravessadas pelo raio, sem testar os triangulos de todas as malhas.
import * as THREE from 'three';
import { BlockId } from './blocks';

export interface VoxelHit {
  block: THREE.Vector3;
  adjacent: THREE.Vector3;
  normal: THREE.Vector3;
  distance: number;
  blockId: number;
}

export type BlockReader = (x: number, y: number, z: number) => number;

function firstBoundary(origin: number, cell: number, direction: number, step: number): number {
  if (step === 0) return Number.POSITIVE_INFINITY;
  const boundary = step > 0 ? cell + 1 : cell;
  return (boundary - origin) / direction;
}

/** Retorna o primeiro bloco nao vazio alcancado pelo centro da camera. */
export function raycastVoxels(
  origin: THREE.Vector3,
  direction: THREE.Vector3,
  read: BlockReader,
  maxDistance = 6,
): VoxelHit | null {
  const dir = direction.clone().normalize();
  let x = Math.floor(origin.x);
  let y = Math.floor(origin.y);
  let z = Math.floor(origin.z);

  const stepX = Math.sign(dir.x);
  const stepY = Math.sign(dir.y);
  const stepZ = Math.sign(dir.z);
  const deltaX = stepX === 0 ? Infinity : Math.abs(1 / dir.x);
  const deltaY = stepY === 0 ? Infinity : Math.abs(1 / dir.y);
  const deltaZ = stepZ === 0 ? Infinity : Math.abs(1 / dir.z);
  let maxX = firstBoundary(origin.x, x, dir.x, stepX);
  let maxY = firstBoundary(origin.y, y, dir.y, stepY);
  let maxZ = firstBoundary(origin.z, z, dir.z, stepZ);
  let distance = 0;
  const normal = new THREE.Vector3();

  while (distance <= maxDistance) {
    const id = read(x, y, z);
    if (id !== BlockId.Air) {
      const block = new THREE.Vector3(x, y, z);
      return {
        block,
        adjacent: block.clone().add(normal),
        normal: normal.clone(),
        distance,
        blockId: id,
      };
    }

    if (maxX <= maxY && maxX <= maxZ) {
      x += stepX;
      distance = maxX;
      maxX += deltaX;
      normal.set(-stepX, 0, 0);
    } else if (maxY <= maxZ) {
      y += stepY;
      distance = maxY;
      maxY += deltaY;
      normal.set(0, -stepY, 0);
    } else {
      z += stepZ;
      distance = maxZ;
      maxZ += deltaZ;
      normal.set(0, 0, -stepZ);
    }
  }

  return null;
}