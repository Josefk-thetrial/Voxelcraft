// ============================================================
// mobs.ts — Mobs com IA simples (Fase 5)
// ------------------------------------------------------------
// PORCO (passivo): vaga em círculos, pausa para "pastar"; foge
// quando atingido. ZUMBI (hostil): vaga devagar, mas persegue o
// jogador a menos de 18 blocos, dá dano ao tocar e é destruído
// pela luz do dia. Ambos têm física voxel simplificada (gravidade
// + colisão AABB, pulo automático ao bater num muro).
// Modelos: grupos de BoxGeometry com animação de pernas por seno.
// ============================================================
import * as THREE from 'three';
import { BlockId, isSolid } from './blocks';
import type { ChunkManager } from './ChunkManager';
import { SEA_LEVEL } from './chunk';

export enum MobKind {
  Pig = 'pig',
  Zombie = 'zombie',
}

const GRAVITY = 22;
const EPS = 0.001;

interface MobPart {
  mesh: THREE.Mesh;
  baseY: number;
  leg?: boolean;
  side?: number; // -1 ou +1, para defasar o passo
}

export class Mob {
  kind: MobKind;
  pos: THREE.Vector3;
  yaw = Math.random() * Math.PI * 2;
  velY = 0;
  hp: number;
  grounded = false;
  dead = false;

  // IA
  private stateTimer = Math.random() * 2;
  private moving = false;
  private fleeTimer = 0;
  private attackCooldown = 0;
  private walkPhase = Math.random() * 10;
  flashTimer = 0;

  readonly group = new THREE.Group();
  private parts: MobPart[] = [];
  private bodyWidth: number;
  private bodyHeight: number;
  speed: number;

  constructor(kind: MobKind, pos: THREE.Vector3) {
    this.kind = kind;
    this.pos = pos.clone();
    this.hp = kind === MobKind.Pig ? 5 : 12;
    this.bodyWidth = kind === MobKind.Pig ? 0.78 : 0.56;
    this.bodyHeight = kind === MobKind.Pig ? 0.95 : 1.8;
    this.speed = kind === MobKind.Pig ? 1.3 : 1.05;
    this.buildModel();
    this.group.position.copy(pos);
  }

  // ----------------------------------------------------------
  // Modelo: caixas com cores planas (estilo low-poly Minecraft)
  // ----------------------------------------------------------
  private box(w: number, h: number, d: number, x: number, y: number, z: number, color: number, opts: Partial<MobPart> = {}): void {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(w, h, d),
      new THREE.MeshLambertMaterial({ color }),
    );
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    this.group.add(mesh);
    this.parts.push({ mesh, baseY: y, ...opts });
  }

  private buildModel(): void {
    if (this.kind === MobKind.Pig) {
      this.box(0.62, 0.6, 1.0, 0, 0.72, -0.08, 0xf0a7b3); // corpo rosa
      this.box(0.56, 0.56, 0.56, 0, 0.86, 0.62, 0xf2b3be); // cabeça
      this.box(0.2, 0.16, 0.1, 0, 0.74, 0.9, 0xe58796); // focinho
      // 4 patas: dianteiras esquerda/direita, traseiras esquerda/direita
      // side = +1 ou -1 define a fase de animação (patas opostas se movem em sentido contrário)
      this.box(0.2, 0.45, 0.2, -0.19, 0.22,  0.30, 0xe79aa6, { leg: true, side:  1 }); // dianteira esq
      this.box(0.2, 0.45, 0.2,  0.19, 0.22,  0.30, 0xe79aa6, { leg: true, side: -1 }); // dianteira dir
      this.box(0.2, 0.45, 0.2, -0.19, 0.22, -0.30, 0xe79aa6, { leg: true, side: -1 }); // traseira esq
      this.box(0.2, 0.45, 0.2,  0.19, 0.22, -0.30, 0xe79aa6, { leg: true, side:  1 }); // traseira dir
    } else {
      this.box(0.5, 0.72, 0.28, 0, 1.05, 0, 0x2f8f77); // torso (camisa turquesa)
      this.box(0.5, 0.25, 0.3, 0, 0.62, 0, 0x5b3f8f); // calça roxa
      this.box(0.52, 0.52, 0.52, 0, 1.66, 0, 0x4f9b5e); // cabeça zumbi
      // Braços levantados na frente (estilo clássico de zumbi)
      this.box(0.2, 0.62, 0.2, -0.36, 1.14, 0.28, 0x4f9b5e);
      this.box(0.2, 0.62, 0.2, 0.36, 1.14, 0.28, 0x4f9b5e);
      for (const sx of [-1, 1] as const) {
        this.box(0.22, 0.55, 0.24, sx * 0.12, 0.28, 0, 0x4a6b3f, { leg: true, side: sx });
      }
    }
  }

  /** Flash vermelho de dano (materiais são únicos por mob). */
  private setFlash(on: boolean): void {
    for (const part of this.parts) {
      const mat = part.mesh.material as THREE.MeshLambertMaterial;
      mat.emissive.setHex(on ? 0x8f1a1a : 0x000000);
    }
  }

  // ----------------------------------------------------------
  // Física voxel simplificada (mesma ideia do Player, sem input)
  // ----------------------------------------------------------
  private collidesAt(pos: THREE.Vector3, world: ChunkManager): boolean {
    const hw = this.bodyWidth / 2;
    const minX = Math.floor(pos.x - hw + EPS);
    const maxX = Math.floor(pos.x + hw - EPS);
    const minY = Math.floor(pos.y + EPS);
    const maxY = Math.floor(pos.y + this.bodyHeight - EPS);
    const minZ = Math.floor(pos.z - hw + EPS);
    const maxZ = Math.floor(pos.z + hw - EPS);
    for (let y = minY; y <= maxY; y++) {
      for (let z = minZ; z <= maxZ; z++) {
        for (let x = minX; x <= maxX; x++) {
          if (isSolid(world.getBlock(x, y, z))) return true;
        }
      }
    }
    return false;
  }

  private moveAxis(axis: 'x' | 'z', amount: number, world: ChunkManager): boolean {
    if (Math.abs(amount) < 1e-8) return true;
    this.pos[axis] += amount;
    if (!this.collidesAt(this.pos, world)) return true;
    this.pos[axis] -= amount;
    return false;
  }

  /** Avança na direção yaw com pulo automático ao bater no bloco. */
  private moveForward(dt: number, speed: number, world: ChunkManager): void {
    const dx = -Math.sin(this.yaw) * speed * dt;
    const dz = -Math.cos(this.yaw) * speed * dt;
    const okX = this.moveAxis('x', dx, world);
    const okZ = this.moveAxis('z', dz, world);
    if ((!okX || !okZ) && this.grounded) {
      this.velY = 7.4; // sobe um bloco, como no Minecraft
      this.grounded = false;
    }
  }

  damage(amount: number, knockDir: THREE.Vector3): void {
    this.hp -= amount;
    this.flashTimer = 0.25;
    this.fleeTimer = this.kind === MobKind.Pig ? 3.2 : 0;
    if (this.hp <= 0) this.dead = true;
    // recuo no plano XZ
    this.pos.x += knockDir.x * 0.35;
    this.pos.z += knockDir.z * 0.35;
    this.velY = 4;
    this.grounded = false;
  }

  update(dt: number, player: THREE.Vector3, world: ChunkManager, hurt: (amount: number, dir: THREE.Vector3) => void): boolean {
    this.stateTimer -= dt;
    this.attackCooldown -= dt;
    if (this.flashTimer > 0) {
      this.flashTimer -= dt;
      this.setFlash(this.flashTimer > 0.1);
    }

    const toPlayerX = player.x - this.pos.x;
    const toPlayerZ = player.z - this.pos.z;
    const distXZ = Math.hypot(toPlayerX, toPlayerZ);

    // ---------- comportamento ----------
    let speed = 0;
    if (this.kind === MobKind.Pig) {
      if (this.fleeTimer > 0) {
        this.fleeTimer -= dt;
        this.yaw = Math.atan2(-toPlayerX, -toPlayerZ) + Math.PI; // foge do jogador
        speed = 3.4;
      } else if (this.stateTimer <= 0) {
        this.moving = !this.moving && Math.random() < 0.65;
        if (this.moving) this.yaw += (Math.random() - 0.5) * 2.4;
        this.stateTimer = this.moving ? 1.6 + Math.random() * 2.6 : 1 + Math.random() * 2;
      }
      if (this.fleeTimer <= 0) speed = this.moving ? this.speed : 0;
    } else {
      // ZUMBI: persegue próximo, senão vaga
      if (distXZ < 18) {
        this.yaw = Math.atan2(-toPlayerX, -toPlayerZ);
        speed = 2.1;
        if (distXZ < 1.25 && Math.abs(player.y - this.pos.y) < 2 && this.attackCooldown <= 0) {
          this.attackCooldown = 1.1;
          const dir = new THREE.Vector3(toPlayerX, 0, toPlayerZ).normalize();
          hurt(2, dir);
        }
      } else if (this.stateTimer <= 0) {
        this.moving = Math.random() < 0.7;
        if (this.moving) this.yaw += (Math.random() - 0.5) * 2;
        this.stateTimer = 2 + Math.random() * 3;
      }
      if (distXZ >= 18) speed = this.moving ? this.speed : 0;
    }

    if (speed > 0) this.moveForward(dt, speed, world);

    // ---------- gravidade ----------
    this.velY -= GRAVITY * dt;
    this.velY = Math.max(this.velY, -40);
    const newY = this.pos.y + this.velY * dt;
    const testPos = this.pos.clone();
    testPos.y = newY;
    if (this.collidesAt(testPos, world)) {
      if (this.velY < 0) this.grounded = true;
      this.velY = 0;
    } else {
      this.pos.y = newY;
      this.grounded = false;
    }
    // se caiu no vazio de um chunk não carregado, despawna
    if (this.pos.y < -30) this.dead = true;

    // ---------- apresentação ----------
    this.group.position.copy(this.pos);
    // Os modelos foram construídos olhando para +Z, mas a lógica de movimento
    // considera frente em -Z quando yaw=0. Rotacionamos +PI para alinhar.
    this.group.rotation.y = this.yaw + Math.PI;
    this.walkPhase += speed * dt * 3.4;
    for (const part of this.parts) {
      if (part.leg && part.side !== undefined) {
        part.mesh.rotation.x = Math.sin(this.walkPhase + part.side * Math.PI * 0.5) * (speed > 0 ? 0.55 : 0);
      }
    }
    return !this.dead;
  }

  dispose(): void {
    this.group.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        obj.geometry.dispose();
        (obj.material as THREE.Material).dispose();
      }
    });
  }
}

// ============================================================
// MobManager — spawn/despawn dinâmico e consulta por raio
// ============================================================

const MAX_MOBS = 10;
const SPAWN_MIN = 16;
const SPAWN_MAX = 26;
const DESPAWN_DIST = 48;

export class MobManager {
  mobs: Mob[] = [];
  private scene: THREE.Scene;
  private spawnTimer = 0;
  private seedRnd = Math.random;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
  }

  /** Mira de precisão: intersecta raio de uma esfera em volta do peito do mob. */
  raycast(origin: THREE.Vector3, dir: THREE.Vector3, maxDist: number): { mob: Mob; t: number } | null {
    let best: { mob: Mob; t: number } | null = null;
    const center = new THREE.Vector3();
    const oc = new THREE.Vector3();
    for (const mob of this.mobs) {
      center.set(mob.pos.x, mob.pos.y + mob['bodyHeight'] * 0.55, mob.pos.z);
      oc.subVectors(origin, center);
      const r = mob['bodyWidth'] * 0.85;
      const b = oc.dot(dir);
      const c = oc.dot(oc) - r * r;
      const disc = b * b - c;
      if (disc < 0) continue;
      const t = -b - Math.sqrt(disc);
      if (t > 0.01 && t < maxDist && (!best || t < best.t)) best = { mob, t };
    }
    return best;
  }

  attack(mob: Mob, dir: THREE.Vector3): void {
    mob.damage(2, dir);
  }

  update(
    dt: number,
    player: THREE.Vector3,
    chunks: ChunkManager,
    isNight: boolean,
    hurtPlayer: (amount: number, dir: THREE.Vector3) => void,
  ): void {
    // --------- atualiza todos e remove mortos/distantes ---------
    for (let i = this.mobs.length - 1; i >= 0; i--) {
      const mob = this.mobs[i];
      const dx = mob.pos.x - player.x;
      const dz = mob.pos.z - player.z;
      const dy = mob.pos.y - player.y;
      const far = dx * dx + dy * dy + dz * dz > DESPAWN_DIST * DESPAWN_DIST;
      const alive = !far && mob.update(dt, player, chunks, hurtPlayer);
      const burnZombie = mob.kind === MobKind.Zombie && !isNight; // dia queima zumbis
      if (!alive || far || burnZombie) {
        this.scene.remove(mob.group);
        mob.dispose();
        this.mobs.splice(i, 1);
      }
    }

    // --------- spawn orgânico (0,5–1,5 s entre tentativas) ---------
    if (chunks.minY < 0 && player.y < -32) return;
    this.spawnTimer -= dt;
    if (this.spawnTimer > 0 || this.mobs.length >= MAX_MOBS) return;
    this.spawnTimer = 0.5 + this.seedRnd();

    const angle = this.seedRnd() * Math.PI * 2;
    const dist = SPAWN_MIN + this.seedRnd() * (SPAWN_MAX - SPAWN_MIN);
    const x = Math.floor(player.x + Math.cos(angle) * dist);
    const z = Math.floor(player.z + Math.sin(angle) * dist);
    const groundY = chunks.supportHeightAt(x + 0.5, z + 0.5);
    if (groundY <= 0) return; // sem chão ou chunk não carregado

    // Não spawna dentro de bloco sólido nem em água
    const under = chunks.getBlock(x, groundY - 1, z);
    if (!isSolid(under) || under === BlockId.Water) return;
    if (chunks.getBlock(x, groundY, z) !== BlockId.Air) return;
    if (chunks.getBlock(x, groundY + 1, z) !== BlockId.Air) return;

    // À noite preferimos zumbis; de dia, porcos pastejam
    const kind =
      !isNight && this.seedRnd() < 0.7
        ? MobKind.Pig
        : isNight && this.seedRnd() < 0.75
          ? MobKind.Zombie
          : MobKind.Pig;
    if (!isNight && kind === MobKind.Zombie && groundY > SEA_LEVEL) return;

    const mob = new Mob(kind, new THREE.Vector3(x + 0.5, groundY + 0.02, z + 0.5));
    this.mobs.push(mob);
    this.scene.add(mob.group);
  }

  get counts(): { pigs: number; zombies: number } {
    let pigs = 0;
    let zombies = 0;
    for (const m of this.mobs) m.kind === MobKind.Pig ? pigs++ : zombies++;
    return { pigs, zombies };
  }

  dispose(): void {
    for (const mob of this.mobs) {
      this.scene.remove(mob.group);
      mob.dispose();
    }
    this.mobs.length = 0;
  }
}
