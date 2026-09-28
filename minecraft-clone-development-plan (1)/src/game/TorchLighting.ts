import * as THREE from 'three';
import type { ChunkManager } from './ChunkManager';

const LIGHT_COUNT = 6;

/** Reutiliza seis PointLights para as tochas mais proximas do jogador. */
export class TorchLighting {
  private lights: THREE.PointLight[] = [];
  private refreshTimer = 0;
  private elapsed = 0;

  constructor(scene: THREE.Scene) {
    for (let i = 0; i < LIGHT_COUNT; i++) {
      const light = new THREE.PointLight(0xffa13b, 0, 13, 1.7);
      light.visible = false;
      scene.add(light);
      this.lights.push(light);
    }
  }

  update(dt: number, player: THREE.Vector3, chunks: ChunkManager): void {
    this.elapsed += dt;
    this.refreshTimer -= dt;
    if (this.refreshTimer <= 0) {
      this.refreshTimer = 0.2;
      const torches = chunks.getNearbyTorches(player, 24, LIGHT_COUNT);
      for (let i = 0; i < this.lights.length; i++) {
        const light = this.lights[i];
        const torch = torches[i];
        light.visible = Boolean(torch);
        if (torch) light.position.copy(torch);
      }
    }

    // Pequena oscilacao deterministica simula chama sem criar objetos novos.
    for (let i = 0; i < this.lights.length; i++) {
      if (this.lights[i].visible) {
        this.lights[i].intensity = 2.5 + Math.sin(this.elapsed * 9 + i * 2.17) * 0.22;
      }
    }
  }

  dispose(scene: THREE.Scene): void {
    for (const light of this.lights) scene.remove(light);
  }
}