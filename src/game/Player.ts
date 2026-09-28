import * as THREE from 'three';
import { BlockId, isSolid } from './blocks';
import type { WorldReader } from './ChunkManager';
import { CHUNK_Y } from './chunk';

export type MoveMode = 'walk' | 'fly';
export type GameMode = 'survival' | 'creative';

export interface PlayerFrameState {
  distanceMoved: number;
  sprinting: boolean;
  crouching: boolean;
  landedFallDistance: number;
  grounded: boolean;
  inWater: boolean;
  underwater: boolean;
}

const EYE_HEIGHT = 1.62;
const CROUCH_EYE_HEIGHT = 1.28;
const BODY_HEIGHT = 1.8;
const HALF_WIDTH = 0.3;
const WALK_SPEED = 4.3;
const CROUCH_MULT = 0.42;
const SPRINT_MULT = 1.65;
const FLY_SPEED = 11;
const FLY_SPRINT_MULT = 2.2;
const GRAVITY = 25;
const WATER_SINK_SPEED = -1.4;
const PHYSICS_STEP = 1 / 120;
const JUMP_SPEED = 8.2;
const SMOOTH_WALK = 14;
const SMOOTH_FLY = 9;
const SENSITIVITY = 0.0024;
const PITCH_LIMIT = Math.PI / 2 - 0.0001;
const EPS = 0.0001;

function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

export class Player {
  readonly camera = new THREE.PerspectiveCamera(75, 1, 0.1, 500);
  readonly position = new THREE.Vector3(0.5, 30, 0.5);
  readonly keys = new Set<string>();

  yaw = 0.6;
  pitch = -0.05;
  mode: MoveMode = 'walk';
  grounded = false;
  crouching = false;

  private velocity = new THREE.Vector3();
  private jumpQueued = false;
  private fallDistance = 0;
  private accumulator = 0;
  private eyeHeight = EYE_HEIGHT;

  constructor() {
    this.camera.rotation.order = 'YXZ';
  }

  look(deltaX: number, deltaY: number): void {
    this.yaw -= deltaX * SENSITIVITY;
    this.pitch = clamp(this.pitch - deltaY * SENSITIVITY, -PITCH_LIMIT, PITCH_LIMIT);
  }

  queueJump(): void {
    this.jumpQueued = true;
  }

  toggleFly(): void {
    this.mode = this.mode === 'fly' ? 'walk' : 'fly';
    this.velocity.set(0, 0, 0);
    this.grounded = false;
    this.fallDistance = 0;
  }

  respawn(x: number, y: number, z: number): void {
    this.position.set(x, y, z);
    this.accumulator = 0;
    this.jumpQueued = false;
    this.velocity.set(0, 0, 0);
    this.fallDistance = 0;
    this.grounded = false;
  }

  /** Empurrão horizontal (ataque de zumbi, dano com kickback). */
  addImpulse(x: number, y: number, z: number): void {
    this.velocity.x += x;
    this.velocity.y += y;
    this.velocity.z += z;
  }

  /** Restaura posição/olhar vindos de um save. */
  setState(
    x: number,
    y: number,
    z: number,
    yaw: number,
    pitch: number,
    mode: MoveMode,
  ): void {
    this.respawn(x, y, z);
    this.yaw = yaw;
    this.pitch = pitch;
    this.mode = mode;
  }

  intersectsBlock(x: number, y: number, z: number): boolean {
    return (
      this.position.x + HALF_WIDTH > x &&
      this.position.x - HALF_WIDTH < x + 1 &&
      this.position.y + BODY_HEIGHT > y &&
      this.position.y < y + 1 &&
      this.position.z + HALF_WIDTH > z &&
      this.position.z - HALF_WIDTH < z + 1
    );
  }

  private collidesAt(position: THREE.Vector3, world: WorldReader): boolean {
    const minX = Math.floor(position.x - HALF_WIDTH + EPS);
    const maxX = Math.floor(position.x + HALF_WIDTH - EPS);
    const minY = Math.floor(position.y + EPS);
    const maxY = Math.floor(position.y + BODY_HEIGHT - EPS);
    const minZ = Math.floor(position.z - HALF_WIDTH + EPS);
    const maxZ = Math.floor(position.z + HALF_WIDTH - EPS);

    for (let y = minY; y <= maxY; y++) {
      for (let z = minZ; z <= maxZ; z++) {
        for (let x = minX; x <= maxX; x++) {
          if (world.isLoadedAt && !world.isLoadedAt(x, z)) return true;
          if (isSolid(world.getBlock(x, y, z))) return true;
        }
      }
    }
    return false;
  }

  /** Move um eixo e encontra por busca binaria o ponto exato antes da colisao. */
  private moveAxis(axis: 'x' | 'y' | 'z', amount: number, world: WorldReader): boolean {
    if (Math.abs(amount) < 1e-8) return false;
    // Sweep in small segments: endpoint-only collision can pass through a
    // one-block floor/wall during a long frame, fast flight or knockback.
    const segments = Math.ceil(Math.abs(amount) / 0.25);
    const delta = amount / segments;
    for (let step = 0; step < segments; step++) {
      const start = this.position[axis];
      this.position[axis] = start + delta;
      if (!this.collidesAt(this.position, world)) continue;
      let safe = start;
      let blocked = start + delta;
      for (let i = 0; i < 10; i++) {
        const middle = (safe + blocked) * 0.5;
        this.position[axis] = middle;
        if (this.collidesAt(this.position, world)) blocked = middle;
        else safe = middle;
      }
      this.position[axis] = safe;
      this.velocity[axis] = 0;
      return true;
    }
    return false;
  }

  private isInWater(world: WorldReader): boolean {
    const x = Math.floor(this.position.x);
    const z = Math.floor(this.position.z);
    return (
      world.getBlock(x, Math.floor(this.position.y + 0.2), z) === BlockId.Water ||
      world.getBlock(x, Math.floor(this.position.y + 1.2), z) === BlockId.Water
    );
  }

  update(dt: number, world: WorldReader): PlayerFrameState {
    const previousX = this.position.x, previousZ = this.position.z;
    let landedFallDistance = 0;
    let sprinting = false;
    this.accumulator += clamp(dt, 0, 0.1);
    // Bounded fixed steps make gravity/jump height independent of render FPS.
    while (dt > 0 && this.accumulator + 1e-10 >= PHYSICS_STEP) {
      const frame = this.step(PHYSICS_STEP, world);
      landedFallDistance += frame.landedFallDistance;
      sprinting = frame.sprinting;
      this.accumulator = Math.max(0, this.accumulator - PHYSICS_STEP);
    }
    const targetEye = this.crouching ? CROUCH_EYE_HEIGHT : EYE_HEIGHT;
    this.eyeHeight += (targetEye - this.eyeHeight) * (1 - Math.exp(-18 * Math.min(dt, 0.1)));
    this.camera.position.set(this.position.x, this.position.y + this.eyeHeight, this.position.z);
    this.camera.rotation.set(this.pitch, this.yaw, 0);
    return {
      distanceMoved: this.mode === 'walk' ? Math.hypot(this.position.x - previousX, this.position.z - previousZ) : 0,
      sprinting, crouching: this.crouching, landedFallDistance, grounded: this.grounded,
      inWater: this.isInWater(world),
      underwater: world.getBlock(Math.floor(this.camera.position.x), Math.floor(this.camera.position.y), Math.floor(this.camera.position.z)) === BlockId.Water,
    };
  }

  private step(dt: number, world: WorldReader): { sprinting: boolean; landedFallDistance: number } {
    const previousY = this.position.y;
    const k = this.keys;
    const fwd = (k.has('KeyW') ? 1 : 0) - (k.has('KeyS') ? 1 : 0);
    const str = (k.has('KeyD') ? 1 : 0) - (k.has('KeyA') ? 1 : 0);
    const sin = Math.sin(this.yaw);
    const cos = Math.cos(this.yaw);
    let dx = -sin * fwd + cos * str;
    let dz = -cos * fwd - sin * str;
    const inputLength = Math.hypot(dx, dz);
    if (inputLength > 0) {
      dx /= inputLength;
      dz /= inputLength;
    }

    const shift = k.has('ShiftLeft') || k.has('ShiftRight');
    const ctrl = k.has('ControlLeft') || k.has('ControlRight');
    const inWater = this.isInWater(world);
    const crouching = this.mode === 'walk' && shift && !inWater;
    this.crouching = crouching;
    const sprinting = this.mode === 'walk' && ctrl && inputLength > 0 && !crouching;
    let landedFallDistance = 0;

    if (this.mode === 'fly') {
      const boost = ctrl ? FLY_SPRINT_MULT : 1;
      const up = (k.has('Space') ? 1 : 0) - (shift ? 1 : 0);
      const speed = FLY_SPEED * boost;
      const smooth = 1 - Math.exp(-SMOOTH_FLY * dt);
      this.velocity.x += (dx * speed - this.velocity.x) * smooth;
      this.velocity.y += (up * speed - this.velocity.y) * smooth;
      this.velocity.z += (dz * speed - this.velocity.z) * smooth;

      // voar COM colisão, movendo por eixo como no modo andar
      this.moveAxis('x', this.velocity.x * dt, world);
      this.moveAxis('y', this.velocity.y * dt, world);
      this.moveAxis('z', this.velocity.z * dt, world);

      this.position.y = clamp(this.position.y, 1, CHUNK_Y + 46);
      this.grounded = false;
      this.jumpQueued = false;
    } else {
      const speed = WALK_SPEED * (crouching ? CROUCH_MULT : sprinting ? SPRINT_MULT : 1) * (inWater ? 0.55 : 1);
      const smooth = 1 - Math.exp(-SMOOTH_WALK * dt);
      this.velocity.x += (dx * speed - this.velocity.x) * smooth;
      this.velocity.z += (dz * speed - this.velocity.z) * smooth;

      if (this.jumpQueued && this.grounded && !inWater) {
        this.velocity.y = JUMP_SPEED;
        this.grounded = false;
      }
      this.jumpQueued = false;

      if (inWater) {
        // Held controls, not key-repeat jumps: Space ascends, Shift dives.
        const target = k.has('Space') ? 3.2 : shift ? -3 : WATER_SINK_SPEED;
        this.velocity.y += (target - this.velocity.y) * (1 - Math.exp(-5 * dt));
        this.fallDistance = 0;
      } else {
        this.velocity.y = Math.max(this.velocity.y - GRAVITY * dt, -50);
      }

      this.moveAxis('x', this.velocity.x * dt, world);
      this.moveAxis('z', this.velocity.z * dt, world);

      const falling = this.velocity.y < 0;
      const verticalSpeed = this.velocity.y;
      const hitVertical = this.moveAxis('y', verticalSpeed * dt, world);
      this.grounded = hitVertical && falling;

      const touchingWater = inWater || this.isInWater(world);
      if (touchingWater) this.fallDistance = 0;
      if (falling && !touchingWater) {
        this.fallDistance += Math.max(0, previousY - this.position.y);
      }
      if (this.grounded) {
        landedFallDistance = this.fallDistance;
        this.fallDistance = 0;
      } else if (inWater) {
        this.fallDistance = 0;
      }
    }

    return { sprinting, landedFallDistance };
  }
}
