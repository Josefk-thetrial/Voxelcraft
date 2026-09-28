import { EARTH_RADIUS, GEO_SEA_Y, BEDROCK_TOP_Y } from './geology';
import { withVerticalRenderOrigin } from './renderOrigin';
import { GRAPHICS, getGraphicsQuality } from './graphics';
import * as THREE from 'three';
import { ChunkManager } from './ChunkManager';
import { TerrainGenerator } from './chunk';
import { createWorldSettings, worldSettingsFromSave, type WorldSettings } from './worldSettings';
import { Player, type MoveMode } from './Player';
import { BLOCKS, BlockId, isReplaceable, isSolid } from './blocks';
import {
  ALL_CREATIVE_ITEM_IDS,
  DEFAULT_HOTBAR_IDS,
  HOTBAR_SIZE,
  Inventory,
  RECIPES,
  getItemMeta,
} from './inventory';
import { raycastVoxels, type VoxelHit } from './raycast';
import { buildItemGeometry } from './mesher';
import { createSimpleAtlasMaterial } from './voxelMaterial';
import { SurvivalStats } from './SurvivalStats';
import { DayNightCycle, type DayPhase } from './DayNightCycle';
import { TorchLighting } from './TorchLighting';
import { MobManager, MobKind } from './mobs';
import { SoundFX } from './sound';
import { readSave, writeSave, type SaveData } from './save';
import { BIOME_NAMES, type Biome } from './biomes';
import { createPlayerModel, animatePlayerModel, type PlayerModelParts } from './PlayerModel';

export interface GameOptions {
  autoload?: boolean;
  gameMode?: 'survival' | 'creative';
  world?: WorldSettings;
}

export interface HudState {
  fps: number;
  seed: number;
  seedText: string;
  generatorVersion: number;
  geology: ReturnType<ChunkManager['geologicalInfo']>;
  x: number;
  y: number;
  z: number;
  mode: MoveMode;
  chunks: number;
  pending: number;
  selectedSlot: number;
  selectedBlock: string;
  targetBlock: string | null;
  hotbarItemIds: number[];
  hotbarCounts: number[];
  health: number;
  hunger: number;
  air: number;
  underwater: boolean;
  clock: string;
  dayPhase: DayPhase;
  grounded: boolean;
  crouching: boolean;
  biome: string;
  pigs: number;
  zombies: number;
  gameMode: 'survival' | 'creative';
}

export interface GameCallbacks {
  onHud(state: HudState): void;
  onLockChange(locked: boolean): void;
  onCraftingChange(open: boolean): void;
  onSaveResult(ok: boolean): void;
}

interface Drop {
  mesh: THREE.Mesh;
  id: number;
  vel: THREE.Vector3;
  timer: number;
}

interface Cloud {
  ox: number;
  oy: number;
  oz: number;
  sx: number;
  sz: number;
  speed: number;
}

export class Game {
  private readonly world: WorldSettings;
  private container: HTMLDivElement;
  private cb: GameCallbacks;

  private graphics = GRAPHICS[getGraphicsQuality()];
  private renderer!: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private player = new Player();
  private chunks!: ChunkManager;
  private dayNight!: DayNightCycle;
  private torchLighting!: TorchLighting;
  private underwater = false;
  private survival = new SurvivalStats();
  private inventory = new Inventory();
  private mobs!: MobManager;
  private sfx = new SoundFX();
  private spawn = new THREE.Vector3();
  private groanTimer = 3;

  private selectionOutline!: THREE.LineSegments;
  private currentHit: VoxelHit | null = null;
  private lookDir = new THREE.Vector3();

  private selectedSlot = 0;
  private hotbarIds = [...DEFAULT_HOTBAR_IDS];
  private craftingOpen = false;
  private gameMode: 'survival' | 'creative' = 'survival';
  private lastSpaceTime = 0;

  private cloudMesh!: THREE.InstancedMesh;
  private clouds: Cloud[] = [];
  private cloudDummy = new THREE.Object3D();

  private handMat = createSimpleAtlasMaterial();
  private handMesh!: THREE.Mesh;
  private drops: Drop[] = [];
  private interactCooldown = 0;
  private swingTimer = 0;
  private mouseLeft = false;
  private mouseRight = false;

  // Modelo do jogador e câmera de terceira pessoa
  private playerModel!: PlayerModelParts;
  private walkPhase = { value: 0 };
  private viewMode: 'first' | 'thirdBack' | 'thirdFront' = 'first';
  private thirdPersonCam = new THREE.PerspectiveCamera(75, 1, 0.1, 500);

  private disposed = false;
  private lastTime = -1;
  private fpsFrames = 0;
  private fpsElapsed = 0;
  private currentFps = 0;
  private hudElapsed = 0;

  constructor(container: HTMLDivElement, cb: GameCallbacks, options: GameOptions = {}) {
    this.container = container;
    this.cb = cb;
    const saved = options.autoload ? readSave() : null;
    if (options.autoload && !saved) throw new Error('Não foi possível ler este save ou a versão do gerador não é suportada. O arquivo salvo foi preservado.');
    this.world = saved ? worldSettingsFromSave(saved) : options.world ?? createWorldSettings();
    // Resolve the seed/version and spawn BEFORE constructing any chunks/GPU resources.
    const initial = saved ? saved.player : new TerrainGenerator(this.world.seed, this.world.generatorVersion).findSpawn();

    this.initRenderer();
    this.initScene();
    this.initWorld(saved, initial);
    this.initSelectionOutline();
    this.initHand();
    this.initClouds();
    this.initEvents();

    this.mobs = new MobManager(this.scene);
    this.initPlayerModel();

    if (saved) {
      this.applySave(saved, true);
    } else if (options?.gameMode) {
      this.gameMode = options.gameMode as 'survival' | 'creative';
    }

    this.emitHud();
    this.renderer.setAnimationLoop(this.tick);
  }

  private initRenderer(): void {
    this.renderer = new THREE.WebGLRenderer({ antialias: this.graphics.antialias, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, this.graphics.pixelRatio));
    this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
    this.renderer.shadowMap.enabled = this.graphics.shadows;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.domElement.style.display = 'block';
    this.container.appendChild(this.renderer.domElement);

    this.player.camera.aspect = this.container.clientWidth / this.container.clientHeight;
    this.player.camera.updateProjectionMatrix();
  }

  private initScene(): void {
    const fog = new THREE.Fog(0xc8e0ef, 34, 96);
    this.scene.fog = fog;
    this.dayNight = new DayNightCycle(this.scene, fog, this.graphics.shadowSize);
    this.torchLighting = new TorchLighting(this.scene);
  }

  private initWorld(saved: SaveData | null, initial: { x: number; z: number }): void {
    this.chunks = new ChunkManager(this.scene, this.world.seed, this.graphics.radius, this.world.generatorVersion);
    if (saved) this.chunks.applyEdits(saved.edits);
    this.chunks.forceSpawnArea(initial.x, initial.z, saved?.player.y ?? this.chunks.supportHeightAt(initial.x, initial.z));
    if (saved) this.player.position.set(saved.player.x, saved.player.y, saved.player.z);
    else this.player.position.copy(this.chunks.safeSpawnNear(initial.x, initial.z));
    this.player.grounded = !saved;
    this.spawn.copy(this.player.position);
  }

  private initSelectionOutline(): void {
    const box = new THREE.BoxGeometry(1.008, 1.008, 1.008);
    const edges = new THREE.EdgesGeometry(box);
    box.dispose();
    this.selectionOutline = new THREE.LineSegments(
      edges,
      new THREE.LineBasicMaterial({ color: 0x111111, transparent: true, opacity: 0.92, depthTest: false }),
    );
    this.selectionOutline.renderOrder = 1000;
    this.selectionOutline.visible = false;
    this.scene.add(this.selectionOutline);
  }

  private updateSelection(): void {
    this.player.camera.getWorldDirection(this.lookDir);
    this.currentHit = raycastVoxels(
      this.player.camera.position,
      this.lookDir,
      (x, y, z) => this.chunks.getBlock(x, y, z),
      6,
    );
    if (!this.currentHit) {
      this.selectionOutline.visible = false;
      return;
    }
    const b = this.currentHit.block;
    this.selectionOutline.position.set(b.x + 0.5, b.y + 0.5, b.z + 0.5);
    this.selectionOutline.visible = true;
  }

  private initPlayerModel(): void {
    this.playerModel = createPlayerModel();
    this.playerModel.group.visible = false; // invisível em primeira pessoa
    this.scene.add(this.playerModel.group);
    this.thirdPersonCam.rotation.order = 'YXZ';
  }

  private initHand(): void {
    this.handMesh = new THREE.Mesh(new THREE.BufferGeometry(), this.handMat);
    this.handMesh.renderOrder = 999;
    this.handMesh.frustumCulled = false;
    this.handMesh.visible = false;
    this.player.camera.add(this.handMesh);
    this.scene.add(this.player.camera);
    this.refreshHandGeo();
  }

  private refreshHandGeo(): void {
    const id = this.hotbarIds[this.selectedSlot];
    this.handMesh.geometry.dispose();
    const geo = buildItemGeometry(id);
    if (geo) {
      this.handMesh.geometry = geo;
      this.handMesh.visible = true;
    } else {
      this.handMesh.visible = false;
    }
  }

  private spawnDrop(wx: number, wy: number, wz: number, id: number): void {
    const geo = buildItemGeometry(id);
    if (!geo) return;
    const mesh = new THREE.Mesh(geo, this.handMat.clone());
    mesh.scale.setScalar(0.25);
    mesh.position.set(wx + 0.5, wy + 0.7, wz + 0.5);
    this.scene.add(mesh);
    this.drops.push({
      mesh,
      id,
      timer: 0,
      vel: new THREE.Vector3((Math.random() - 0.5) * 3, 2 + Math.random(), (Math.random() - 0.5) * 3),
    });
  }

  private updateDrops(dt: number): void {
    const p = this.player.position;
    for (let i = this.drops.length - 1; i >= 0; i--) {
      const d = this.drops[i];
      d.timer += dt;
      d.vel.y -= 22 * dt;
      d.mesh.position.addScaledVector(d.vel, dt);
      d.mesh.rotation.y += dt * 2;

      const gy = this.chunks.supportHeightAt(d.mesh.position.x, d.mesh.position.z, d.mesh.position.y);
      if (Number.isFinite(gy) && d.mesh.position.y < gy + 0.125) {
        d.mesh.position.y = gy + 0.125;
        d.vel.set(d.vel.x * 0.5, 0, d.vel.z * 0.5);
      }

      if (d.timer > 0.4 && d.mesh.position.distanceTo(p) < 1.8) {
        this.inventory.add(d.id);
        this.sfx.pop();
        this.scene.remove(d.mesh);
        d.mesh.geometry.dispose();
        (d.mesh.material as THREE.Material).dispose();
        this.drops.splice(i, 1);
        this.emitHud();
        continue;
      }

      if (d.timer > 300) {
        this.scene.remove(d.mesh);
        d.mesh.geometry.dispose();
        (d.mesh.material as THREE.Material).dispose();
        this.drops.splice(i, 1);
      }
    }
  }

  private doBreak(): void {
    this.player.camera.getWorldDirection(this.lookDir);
    const mobHit = this.mobs.raycast(this.player.camera.position, this.lookDir, 4.5);
    if (mobHit && (!this.currentHit || mobHit.t < this.currentHit.distance + 0.5)) {
      this.mobs.attack(mobHit.mob, this.lookDir);
      this.sfx.attackHit();
      if (mobHit.mob.dead) this.sfx.mobDeath();
      return;
    }

    const hit = this.currentHit;
    if (!hit || hit.blockId === BlockId.Bedrock) return;

    if (this.chunks.setBlock(hit.block.x, hit.block.y, hit.block.z, BlockId.Air)) {
      this.sfx.breakBlock();
      this.survival.addActionExhaustion(0.06);
      if (this.gameMode === 'survival') {
        if (ALL_CREATIVE_ITEM_IDS.includes(hit.blockId)) {
          this.spawnDrop(hit.block.x, hit.block.y, hit.block.z, hit.blockId);
        }
      } else {
        this.inventory.add(hit.blockId);
      }
      this.currentHit = null;
      this.selectionOutline.visible = false;
      this.emitHud();
    }
  }

  private doPlace(): void {
    const hit = this.currentHit;
    if (!hit) return;
    if (hit.blockId === BlockId.CraftingTable) {
      this.openCrafting();
      return;
    }
    if (hit.normal.lengthSq() === 0) return;

    const { x, y, z } = hit.adjacent;
    const existing = this.chunks.getBlock(x, y, z);
    const selId = this.hotbarIds[this.selectedSlot];

    if (this.gameMode === 'survival' && this.inventory.count(selId) <= 0) return;
    if (!isReplaceable(existing)) return;
    if (isSolid(selId) && this.player.intersectsBlock(x, y, z)) return;
    if (selId === BlockId.Torch && !isSolid(this.chunks.getBlock(x, y - 1, z))) return;

    if (this.chunks.setBlock(x, y, z, selId)) {
      this.sfx.placeBlock();
      this.survival.addActionExhaustion(0.03);
      if (this.gameMode === 'survival') this.inventory.consume(selId);
      this.emitHud();
    }
  }

  private doPickBlock(): void {
    if (!this.currentHit) return;
    this.assignCurrentSlot(this.currentHit.blockId);
  }

  chooseCreativeItem(id: number): void {
    this.assignCurrentSlot(id);
    if (this.gameMode === 'creative') {
      this.inventory.add(id, Math.max(0, 999 - this.inventory.count(id)));
    }
  }

  private assignCurrentSlot(id: number): void {
    this.hotbarIds[this.selectedSlot] = id;
    this.refreshHandGeo();
    this.emitHud();
  }

  private setSlot(slot: number): void {
    this.selectedSlot = ((slot % HOTBAR_SIZE) + HOTBAR_SIZE) % HOTBAR_SIZE;
    this.refreshHandGeo();
    this.emitHud();
  }

  private openCrafting(): void {
    if (this.craftingOpen) return;
    this.craftingOpen = true;
    this.player.keys.clear();
    this.mouseLeft = false;
    this.mouseRight = false;
    this.cb.onCraftingChange(true);
    if (document.pointerLockElement === this.renderer.domElement) document.exitPointerLock();
  }

  closeCrafting(resume = true): void {
    if (!this.craftingOpen) return;
    this.craftingOpen = false;
    this.cb.onCraftingChange(false);
    if (resume) this.lockPointer();
  }

  craft(recipeId: string): boolean {
    const recipe = RECIPES.find((item) => item.id === recipeId);
    if (!recipe || !this.inventory.craft(recipe)) return false;
    this.sfx.craft();
    this.emitHud();
    return true;
  }

  saveGame(): void {
    const p = this.player.position;
    const data: SaveData = {
      version: 1,
      seed: this.world.seed,
      seedText: this.world.seedText,
      generatorVersion: this.world.generatorVersion,
      spawn: { x: this.spawn.x, y: this.spawn.y, z: this.spawn.z },
      savedAt: Date.now(),
      player: {
        x: p.x,
        y: p.y,
        z: p.z,
        yaw: this.player.yaw,
        pitch: this.player.pitch,
        mode: this.player.mode,
      },
      gameMode: this.gameMode,
      stats: { health: this.survival.health, hunger: this.survival.hunger, air: this.survival.air },
      timeOfDay: this.dayNight.timeOfDay,
      selectedSlot: this.selectedSlot,
      hotbarIds: this.hotbarIds,
      inventory: this.inventory.entries(),
      edits: this.chunks.serializeEdits(),
    };
    this.cb.onSaveResult(writeSave(data));
  }

  private applySave(data: SaveData | null, editsAlreadyApplied = false): void {
    if (!data || data.seed !== this.world.seed || (data.generatorVersion ?? 1) !== this.world.generatorVersion) return;
    if (!editsAlreadyApplied) this.chunks.applyEdits(data.edits);
    this.player.setState(
      data.player.x,
      data.player.y,
      data.player.z,
      data.player.yaw,
      data.player.pitch,
      data.player.mode as MoveMode,
    );
    this.gameMode = data.gameMode || 'survival';
    this.survival.health = data.stats.health;
    this.survival.hunger = data.stats.hunger;
    this.survival.air = Number.isFinite(data.stats.air) ? Math.max(0, Math.min(15, data.stats.air!)) : 15;
    this.inventory.restore(data.inventory);
    this.dayNight.setTime(data.timeOfDay);
    this.selectedSlot = Math.max(0, Math.min(HOTBAR_SIZE - 1, data.selectedSlot));
    if (Array.isArray(data.hotbarIds) && data.hotbarIds.length > 0) {
      this.hotbarIds = data.hotbarIds.slice(0, HOTBAR_SIZE);
      while (this.hotbarIds.length < HOTBAR_SIZE) {
        this.hotbarIds.push(DEFAULT_HOTBAR_IDS[this.hotbarIds.length] ?? DEFAULT_HOTBAR_IDS[0]);
      }
    }
    const spawn = data.spawn ?? data.player;
    this.spawn.set(spawn.x, spawn.y, spawn.z);
    this.refreshHandGeo();
  }

  private initClouds(): void {
    const COUNT = 28;
    this.cloudMesh = new THREE.InstancedMesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshLambertMaterial({ color: 0xffffff, transparent: true, opacity: 0.78 }),
      COUNT,
    );
    this.cloudMesh.frustumCulled = false;
    let seed = 42;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (let i = 0; i < COUNT; i++) {
      this.clouds.push({
        ox: -70 + rnd() * 140,
        oy: 66 + rnd() * 8,
        oz: -70 + rnd() * 140,
        sx: 5 + rnd() * 8,
        sz: 4 + rnd() * 5,
        speed: 0.7 + rnd() * 0.9,
      });
    }
    this.scene.add(this.cloudMesh);
  }

  private updateClouds(dt: number): void {
    const px = this.player.position.x;
    const pz = this.player.position.z;
    for (let i = 0; i < this.clouds.length; i++) {
      const c = this.clouds[i];
      c.ox += c.speed * dt;
      if (c.ox > 70) c.ox -= 140;
      this.cloudDummy.position.set(px + c.ox, c.oy, pz + c.oz);
      this.cloudDummy.scale.set(c.sx, 0.7, c.sz);
      this.cloudDummy.updateMatrix();
      this.cloudMesh.setMatrixAt(i, this.cloudDummy.matrix);
    }
    this.cloudMesh.instanceMatrix.needsUpdate = true;
  }

  private onResize = () => {
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    this.renderer.setSize(w, h);
    this.player.camera.aspect = w / h;
    this.player.camera.updateProjectionMatrix();
  };

  private onMouseMove = (e: MouseEvent) => {
    if (document.pointerLockElement === this.renderer.domElement) {
      if (this.viewMode === 'thirdFront') {
        // Inverte horizontalmente e verticalmente (espelho total) para que
        // movimentar o mouse "puxe" a câmera na direção certa.
        this.player.look(-e.movementX, -e.movementY);
      } else {
        this.player.look(e.movementX, e.movementY);
      }
    }
  };

  private onKeyDown = (e: KeyboardEvent) => {
    if (document.pointerLockElement === this.renderer.domElement && (e.code === 'Space' || e.code === 'Tab')) e.preventDefault();
    if (e.repeat) return;

    if (e.code === 'KeyE') {
      if (this.survival.dead) return;
      if (this.craftingOpen) this.closeCrafting();
      else if (document.pointerLockElement === this.renderer.domElement) this.openCrafting();
      return;
    }

    if (this.survival.dead) return;
    if (document.pointerLockElement !== this.renderer.domElement) return;

    this.player.keys.add(e.code);
    if (e.code === 'KeyF') this.player.toggleFly();
    if (e.code === 'Space') this.handleSpacePress();
    if (e.code === 'F5') {
      e.preventDefault();
      this.cycleViewMode();
    }
    if (/^Digit[1-9]$/.test(e.code)) this.setSlot(Number(e.code.slice(5)) - 1);
    if (/^Numpad[1-9]$/.test(e.code)) this.setSlot(Number(e.code.slice(6)) - 1);
  };

  private onKeyUp = (e: KeyboardEvent) => {
    this.player.keys.delete(e.code);
  };

  private onCanvasClick = () => {
    if (!this.survival.dead) this.lockPointer();
  };

  private onMouseDown = (e: MouseEvent) => {
    if (document.pointerLockElement !== this.renderer.domElement) return;
    e.preventDefault();
    this.sfx.unlock();
    if (e.button === 0) this.mouseLeft = true;
    if (e.button === 1) this.doPickBlock();
    if (e.button === 2) this.mouseRight = true;
  };

  private onMouseUp = (e: MouseEvent) => {
    if (e.button === 0) {
      this.mouseLeft = false;
      this.interactCooldown = 0;
    }
    if (e.button === 2) {
      this.mouseRight = false;
      this.interactCooldown = 0;
    }
  };

  private onWheel = (e: WheelEvent) => {
    if (document.pointerLockElement !== this.renderer.domElement || e.deltaY === 0) return;
    e.preventDefault();
    this.setSlot(this.selectedSlot + (e.deltaY > 0 ? 1 : -1));
  };

  private onPointerLockChange = () => {
    const locked = document.pointerLockElement === this.renderer.domElement;
    if (!locked) {
      this.player.keys.clear();
      this.mouseLeft = false;
      this.mouseRight = false;
    }
    this.cb.onLockChange(locked);
  };

  private onContextMenu = (e: Event) => e.preventDefault();

  private initEvents(): void {
    window.addEventListener('resize', this.onResize);
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    document.addEventListener('mousemove', this.onMouseMove);
    document.addEventListener('pointerlockchange', this.onPointerLockChange);
    this.renderer.domElement.addEventListener('click', this.onCanvasClick);
    this.renderer.domElement.addEventListener('mousedown', this.onMouseDown);
    this.renderer.domElement.addEventListener('mouseup', this.onMouseUp);
    this.renderer.domElement.addEventListener('wheel', this.onWheel, { passive: false });
    this.renderer.domElement.addEventListener('contextmenu', this.onContextMenu);
  }

  private cycleViewMode(): void {
    const modes: Array<'first' | 'thirdBack' | 'thirdFront'> = ['first', 'thirdBack', 'thirdFront'];
    const idx = modes.indexOf(this.viewMode);
    this.viewMode = modes[(idx + 1) % modes.length];
    this.playerModel.group.visible = this.viewMode !== 'first';
    this.handMesh.visible = this.viewMode === 'first';
  }

  private handleSpacePress(): void {
    const now = performance.now();
    if (now - this.lastSpaceTime < 300) {
      this.player.toggleFly();
    }
    this.lastSpaceTime = now;
    this.player.queueJump();
  }

  lockPointer(): void {
    if (this.craftingOpen || this.survival.dead) return;
    this.sfx.unlock();
    try {
      const result = this.renderer.domElement.requestPointerLock();
      if (result instanceof Promise) result.catch(() => {});
    } catch {
      /* noop */
    }
  }

  private tick = (time: number): void => {
    if (this.disposed) return;
    if (document.hidden) { this.lastTime = -1; return; }
    const realDt = this.lastTime < 0 ? 0.016 : Math.max(0, (time - this.lastTime) / 1000);
    const dt = Math.min(realDt, 0.1);
    this.lastTime = time;

    const locked = document.pointerLockElement === this.renderer.domElement;
    const active = locked && !this.craftingOpen && !this.survival.dead;
    const simDt = active ? dt : 0;

    const frame = this.player.update(simDt, this.chunks);
    this.underwater = frame.underwater;

    if (this.player.position.y < (this.world.generatorVersion === 3 ? BEDROCK_TOP_Y - 40 : -40) && !this.survival.dead && this.gameMode === 'survival') {
      this.survival.health = 0;
    }

    if (this.gameMode === 'creative') {
      this.survival.health = 20;
      this.survival.hunger = 20;
      this.survival.air = 15;
    } else if (!this.survival.dead) {
      this.survival.update(simDt, frame);
    }

    if (this.survival.dead && locked) {
      document.exitPointerLock();
    }

    this.chunks.update(this.player.position.x, this.player.position.z, this.player.position.y);

    if (active) this.updateSelection();
    else this.selectionOutline.visible = false;

    if (active) {
      this.interactCooldown = Math.max(0, this.interactCooldown - dt);
      if (this.interactCooldown === 0) {
        if (this.mouseLeft) {
          this.doBreak();
          this.interactCooldown = 0.25;
          this.swingTimer = 0.25;
        } else if (this.mouseRight) {
          this.doPlace();
          this.interactCooldown = 0.3;
          this.swingTimer = 0.25;
        }
      }
    }

    // Temporizador do swing (usado pela mão E pelo modelo em F5)
    this.swingTimer = Math.max(0, this.swingTimer - dt);

    if (active) {
    }

    this.handMesh.scale.setScalar(0.35);
    this.handMesh.position.set(0.42, -0.38, -0.6);
    this.handMesh.rotation.set(0.15, -0.4, 0.05);
    if (this.swingTimer > 0) {
      const swing = Math.sin((1 - this.swingTimer / 0.25) * Math.PI);
      this.handMesh.rotation.x += swing * 0.9;
      this.handMesh.position.y -= swing * 0.15;
    }
    if (this.viewMode === 'first') {
      this.handMesh.visible = active;
    }

    this.updateDrops(dt);
    this.cloudMesh.visible = this.player.position.y > -200;
    if (this.cloudMesh.visible) this.updateClouds(simDt);

    const p = this.player.position;

    // Atualiza modelo do jogador (posição e animação)
    const prevX: number = (this as any)._prevPosX != null ? (this as any)._prevPosX : p.x;
    const prevZ: number = (this as any)._prevPosZ != null ? (this as any)._prevPosZ : p.z;
    const walkSpeed = Math.hypot(p.x - prevX, p.z - prevZ) / Math.max(dt, 0.001);
    (this as any)._prevPosX = p.x;
    (this as any)._prevPosZ = p.z;

    // Modelo do jogador
    this.playerModel.group.position.set(p.x, p.y - (this.player.crouching ? 0.18 : 0), p.z);

    // O corpo base sempre acompanha o yaw do jogador (invertido 180° pq o modelo foi modelado de frente)
    this.playerModel.group.rotation.y = this.player.yaw + Math.PI;

    // Cabeça acompanha o pitch com limite visual humano
    const clampedPitch = Math.max(-1.05, Math.min(1.05, this.player.pitch));
    this.playerModel.head.rotation.x = -clampedPitch;

    animatePlayerModel(this.playerModel, walkSpeed, dt, this.walkPhase, {
      grounded: this.player.grounded,
      crouching: this.player.crouching,
      flying: this.player.mode === 'fly',
      attack: this.swingTimer > 0 ? Math.sin((1 - this.swingTimer / 0.25) * Math.PI) : 0,
    });
    this.dayNight.update(simDt, p);
    this.torchLighting.update(dt, p, this.chunks);

    this.mobs.update(simDt, p, this.chunks, this.dayNight.isNight, (amount, dir) => {
      if (this.gameMode === 'creative' || this.survival.dead) return;
      this.survival.damage(amount);
      this.player.addImpulse(dir.x * 4, 3, dir.z * 4);
      this.sfx.hurt();
    });

    this.groanTimer -= simDt;
    if (this.groanTimer <= 0) {
      this.groanTimer = 5 + Math.random() * 8;
      let nearest = Infinity;
      for (const mob of this.mobs.mobs) {
        if (mob.kind !== MobKind.Zombie) continue;
        const d = mob.pos.distanceTo(p);
        if (d < nearest) nearest = d;
      }
      if (nearest < 16) this.sfx.zombieGroan(0.3 * (1 - nearest / 16));
    }

    this.fpsFrames++;
    this.fpsElapsed += realDt;
    if (this.fpsElapsed >= 0.5) {
      this.currentFps = Math.round(this.fpsFrames / this.fpsElapsed);
      this.fpsFrames = 0;
      this.fpsElapsed = 0;
    }

    this.hudElapsed += dt;
    if (this.hudElapsed >= 0.15) {
      this.hudElapsed = 0;
      this.emitHud();
    }

    // Renderiza com a câmera correta baseada no modo de visualização
    let renderCam = this.player.camera;

    if (this.viewMode !== 'first') {
      const cam = this.thirdPersonCam;
      if (cam.aspect !== this.player.camera.aspect) {
        cam.aspect = this.player.camera.aspect; cam.updateProjectionMatrix();
      }

      const dist = 4;
      const yaw = this.player.yaw;
      const pitch = this.player.pitch;

      if (this.viewMode === 'thirdBack') {
        // Câmera atrás do jogador
        cam.position.set(
          p.x + Math.sin(yaw) * dist,
          p.y + 1.62 + Math.sin(-pitch) * dist * 0.5,
          p.z + Math.cos(yaw) * dist,
        );
        cam.lookAt(p.x, p.y + 1.2, p.z);
      } else {
        // Câmera de frente para o jogador
        // Na visão frontal (thirdFront), como invertemos o input do mouse,
        // o pitch do jogador está logicamente virado. Usamos o pitch para 
        // colocar a câmera na altura correta e fazer ela olhar para o rosto.
        cam.position.set(
          p.x - Math.sin(yaw) * dist,
          p.y + 1.62 + Math.sin(pitch) * dist * 0.5,
          p.z - Math.cos(yaw) * dist,
        );
        cam.lookAt(p.x, p.y + 1.2, p.z);
      }
      renderCam = cam;
    }

    const fog = this.scene.fog as THREE.Fog;
    const cameraBlock = this.chunks.getBlock(Math.floor(renderCam.position.x), Math.floor(renderCam.position.y), Math.floor(renderCam.position.z));
    const molten = cameraBlock === BlockId.MoltenCore;
    const submerged = cameraBlock === BlockId.Water || molten;
    if (submerged) fog.color.set(molten ? 0x9a431b : 0x17516e);
    const surfaceFar = this.world.generatorVersion >= 2 ? this.graphics.radius * 16 - 4 : this.graphics.radius * 16 + 16;
    fog.near = submerged ? 0.5 : Math.min(34, surfaceFar * 0.55);
    fog.far = submerged ? molten ? 4 : 16 : surfaceFar;
    withVerticalRenderOrigin(this.scene, renderCam, () => this.renderer.render(this.scene, renderCam));
  };

  private emitHud(): void {
    if (!this.chunks) return;
    const p = this.player.position;
    const geology = this.chunks.geologicalInfo(p.x, p.y, p.z);
    this.cb.onHud({
      fps: this.currentFps,
      seed: this.world.seed,
      seedText: this.world.seedText,
      generatorVersion: this.world.generatorVersion,
      geology,
      x: Math.round(p.x * 10) / 10,
      y: Math.round(p.y * 10) / 10,
      z: Math.round(p.z * 10) / 10,
      mode: this.player.mode,
      chunks: this.chunks.meshedCount(),
      pending: this.chunks.pendingMeshCount,
      selectedSlot: this.selectedSlot,
      selectedBlock: getItemMeta(this.hotbarIds[this.selectedSlot]).name,
      targetBlock: this.currentHit ? (BLOCKS[this.currentHit.blockId]?.name ?? null) : null,
      hotbarItemIds: this.hotbarIds,
      hotbarCounts: this.inventory.hotbarCounts(this.hotbarIds),
      health: this.survival.health,
      hunger: this.survival.hunger,
      air: this.survival.air,
      underwater: this.underwater,
      clock: this.dayNight.clock,
      dayPhase: this.dayNight.phase,
      grounded: this.player.grounded,
      crouching: this.player.crouching,
      biome: geology && geology.depth > 1000 ? geology.layer : BIOME_NAMES[this.chunks.biomeAt(p.x, p.z) as Biome] ?? '',
      pigs: this.mobs.counts.pigs,
      zombies: this.mobs.counts.zombies,
      gameMode: this.gameMode,
    });
  }

  /** Creative inspection shortcut, not a pre-generated shaft through Earth. */
  travelToDepth(depth: number): boolean {
    if (this.gameMode !== 'creative' || this.world.generatorVersion !== 3 || !Number.isFinite(depth)) return false;
    depth = Math.round(Math.max(0, Math.min(EARTH_RADIUS, depth)));
    const x = Math.floor(this.player.position.x), z = Math.floor(this.player.position.z);
    const y = Math.max(BEDROCK_TOP_Y, GEO_SEA_Y - depth);
    // A small observation chamber is explicitly recorded as normal save edits.
    for (let dy = 0; dy < 4; dy++) for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) {
      this.chunks.setBlock(x + dx, y + dy, z + dz, BlockId.Air);
    }
    this.chunks.forceSpawnArea(x + .5, z + .5, y);
    this.player.setState(x + .5, y, z + .5, this.player.yaw, 0, 'fly');
    this.currentHit = null; this.selectionOutline.visible = false;
    this.mouseLeft = this.mouseRight = false;
    this.emitHud();
    return true;
  }

  respawn(): void {
    this.survival.reset();
    if (this.world.generatorVersion === 3) this.chunks.forceSpawnArea(this.spawn.x, this.spawn.z, this.spawn.y);
    this.player.respawn(this.spawn.x, this.spawn.y + 2, this.spawn.z);
    this.mouseLeft = false;
    this.mouseRight = false;
    this.emitHud();
    window.setTimeout(() => this.lockPointer(), 80);
  }

  dispose(): void {
    this.disposed = true;
    this.renderer.setAnimationLoop(null);

    window.removeEventListener('resize', this.onResize);
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    document.removeEventListener('mousemove', this.onMouseMove);
    document.removeEventListener('pointerlockchange', this.onPointerLockChange);
    this.renderer.domElement.removeEventListener('click', this.onCanvasClick);
    this.renderer.domElement.removeEventListener('mousedown', this.onMouseDown);
    this.renderer.domElement.removeEventListener('mouseup', this.onMouseUp);
    this.renderer.domElement.removeEventListener('wheel', this.onWheel);
    this.renderer.domElement.removeEventListener('contextmenu', this.onContextMenu);

    if (document.pointerLockElement === this.renderer.domElement) document.exitPointerLock();

    this.mobs.dispose();
    this.chunks.dispose();
    this.dayNight.dispose();
    this.torchLighting.dispose(this.scene);

    for (const d of this.drops) {
      this.scene.remove(d.mesh);
      d.mesh.geometry.dispose();
      (d.mesh.material as THREE.Material).dispose();
    }

    this.scene.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        obj.geometry.dispose();
        const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
        mats.forEach((m) => m.dispose());
      }
    });

    this.selectionOutline.geometry.dispose();
    (this.selectionOutline.material as THREE.Material).dispose();
    this.playerModel.texture.dispose();
    this.playerModel.capeTexture?.dispose();
    this.handMat.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
