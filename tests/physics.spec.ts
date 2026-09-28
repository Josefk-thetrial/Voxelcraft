import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => { await page.goto('/'); });

test('fixed-step jump and travel agree at 30, 60 and 144 FPS; pause keeps grounding', async ({ page }) => {
  const results = await page.evaluate(async () => {
    // @ts-expect-error Vite module
    const { Player } = await import('/src/game/Player.ts');
    // @ts-expect-error Vite module
    const { BlockId } = await import('/src/game/blocks.ts');
    const world = { getBlock: (_x: number, y: number) => y < 1 ? BlockId.Stone : BlockId.Air };
    return [30, 60, 144].map(fps => {
      const p = new Player(); p.respawn(0.5, 1, 0.5); p.grounded = true; p.queueJump(); p.keys.add('KeyW');
      let apex = 0, fall = 0;
      for (let i = 0; i < fps * 2; i++) {
        const f = p.update(1 / fps, world); apex = Math.max(apex, p.position.y); fall += f.landedFallDistance;
      }
      p.update(0, world);
      return { apex, fall, x: p.position.x, z: p.position.z, grounded: p.grounded };
    });
  });
  for (const r of results) {
    expect(r.apex).toBeGreaterThan(2.2); expect(r.apex).toBeLessThan(2.4);
    expect(r.grounded).toBe(true);
    expect(r.x).toBeCloseTo(results[0].x, 2);
    expect(r.z).toBeCloseTo(results[0].z, 2);
    expect(r.fall).toBeCloseTo(results[0].fall, 2);
  }
});

test('fast fall hits a one-block floor, reports damage once and water cancels impact damage', async ({ page }) => {
  const result = await page.evaluate(async () => {
    // @ts-expect-error Vite module
    const { Player } = await import('/src/game/Player.ts');
    // @ts-expect-error Vite module
    const { BlockId } = await import('/src/game/blocks.ts');
    return [false, true].map(water => {
      const p = new Player(); p.respawn(0.5, 80, 0.5);
      const world = { getBlock: (_x: number, y: number) => y === 0 ? BlockId.Stone : water && y > 0 && y < 8 ? BlockId.Water : BlockId.Air };
      let impacts = 0, distance = 0;
      for (let i = 0; i < 130; i++) {
        const f = p.update(0.1, world);
        if (f.landedFallDistance > 0) { impacts++; distance += f.landedFallDistance; }
      }
      return { y: p.position.y, impacts, distance };
    });
  });
  expect(result[0].y).toBeCloseTo(1, 2);
  expect(result[0].distance).toBeGreaterThan(78);
  expect(result[0].impacts).toBe(1);
  expect(result[1].y).toBeCloseTo(1, 2);
  expect(result[1].distance).toBe(0);
});

test('held swimming controls ascend/dive; water slows movement and eye immersion is distinct', async ({ page }) => {
  const result = await page.evaluate(async () => {
    // @ts-expect-error Vite module
    const { Player } = await import('/src/game/Player.ts');
    // @ts-expect-error Vite module
    const { BlockId } = await import('/src/game/blocks.ts');
    const world = { getBlock: (_x: number, y: number) => y < 1 ? BlockId.Stone : y < 12 ? BlockId.Water : BlockId.Air };
    const p = new Player(); p.respawn(0.5, 5, 0.5); p.keys.add('Space');
    for (let i = 0; i < 60; i++) p.update(1 / 60, world);
    const up = p.position.y;
    p.keys.clear(); p.keys.add('ShiftLeft');
    for (let i = 0; i < 90; i++) p.update(1 / 60, world);
    const down = p.position.y;
    p.respawn(0.5, 11, 0.5); p.keys.clear(); const surface = p.update(0, world);
    return { up, down, inWater: surface.inWater, underwater: surface.underwater };
  });
  expect(result.up).toBeGreaterThan(7); expect(result.down).toBeLessThan(result.up - 2);
  expect(result.inWater).toBe(true); expect(result.underwater).toBe(false);
});

test('flight cannot tunnel through a thin wall or enter unloaded terrain', async ({ page }) => {
  const result = await page.evaluate(async () => {
    // @ts-expect-error Vite module
    const { Player } = await import('/src/game/Player.ts');
    // @ts-expect-error Vite module
    const { BlockId } = await import('/src/game/blocks.ts');
    return [false, true].map(unloaded => {
      const p = new Player(); p.respawn(0.5, 5, 0.5); p.mode = 'fly'; p.yaw = 0;
      p.keys.add('KeyD'); p.keys.add('ControlLeft');
      const world = { getBlock: (x: number) => !unloaded && x === 2 ? BlockId.Stone : BlockId.Air, isLoadedAt: (x: number) => !unloaded || x < 2 };
      for (let i = 0; i < 20; i++) p.update(.1, world);
      return p.position.x;
    });
  });
  for (const x of result) { expect(x).toBeGreaterThan(1.6); expect(x).toBeLessThan(1.701); }
});

test('breath lasts 15 seconds, drowning damages, pause is safe and surfacing recovers', async ({ page }) => {
  const result = await page.evaluate(async () => {
    // @ts-expect-error Vite module
    const { SurvivalStats } = await import('/src/game/SurvivalStats.ts');
    const stats = new SurvivalStats();
    const frame = { underwater: true, distanceMoved: 0, sprinting: false, landedFallDistance: 0 };
    for (let i = 0; i < 150; i++) stats.update(.1, frame);
    const before = stats.health; stats.update(0, frame); const paused = stats.health;
    for (let i = 0; i < 21; i++) stats.update(.1, frame);
    const drowned = stats.health;
    for (let i = 0; i < 30; i++) stats.update(.1, { ...frame, underwater: false });
    return { before, paused, drowned, air: stats.air };
  });
  expect(result.before).toBe(20); expect(result.paused).toBe(20);
  expect(result.drowned).toBe(16); expect(result.air).toBe(15);
});

test('streaming settles, edits wake meshing and survive unload/reload', async ({ page }) => {
  const result = await page.evaluate(async () => {
    // @ts-expect-error Vite module
    const { ChunkManager } = await import('/src/game/ChunkManager.ts');
    // @ts-expect-error Vite module
    const { BlockId } = await import('/src/game/blocks.ts');
    // @ts-expect-error Vite module
    const THREE = await import('/node_modules/three/build/three.module.js');
    const manager = new ChunkManager(new THREE.Scene(), 12345, 2);
    manager.forceSpawnArea();
    let generated = 0, meshed = 0, maxGen = 0, maxMesh = 0;
    const gen = manager.createChunk.bind(manager), mesh = manager.meshChunk.bind(manager);
    manager.createChunk = (...args: unknown[]) => { generated++; return gen(...args); };
    manager.meshChunk = (...args: unknown[]) => { meshed++; return mesh(...args); };
    for (let i = 0; i < 150; i++) {
      generated = meshed = 0; manager.update(.5, .5);
      maxGen = Math.max(maxGen, generated); maxMesh = Math.max(maxMesh, meshed);
    }
    const pending = manager.pendingMeshCount;
    manager.setBlock(15, 90, 0, BlockId.Stone);
    meshed = 0; for (let i = 0; i < 5; i++) manager.update(.5, .5);
    const rebuilt = meshed;
    const saved = manager.serializeEdits();
    for (let i = 0; i < 150; i++) manager.update(1000, 1000);
    for (let i = 0; i < 150; i++) manager.update(.5, .5);
    const block = manager.getBlock(15, 90, 0);
    const result = { maxGen, maxMesh, pending, rebuilt, block, stone: BlockId.Stone, saved: saved.some((e: number[]) => e[0] === 15 && e[1] === 90) };
    manager.dispose(); return result;
  });
  expect(result.maxGen).toBe(1); expect(result.maxMesh).toBe(1); expect(result.pending).toBe(0);
  expect(result.rebuilt).toBeGreaterThanOrEqual(2); expect(result.saved).toBe(true); expect(result.block).toBe(result.stone);
});

test('graphics quality persists without changing world or skin profiles', async ({ page }) => {
  await page.evaluate(() => { localStorage.setItem('voxelcraft-save-v1', 'world'); localStorage.setItem('voxelcraft-skin-profile-v1', 'skin'); });
  await page.getByLabel('Qualidade gráfica').selectOption('low');
  await page.reload();
  await expect(page.getByLabel('Qualidade gráfica')).toHaveValue('low');
  expect(await page.evaluate(() => [localStorage.getItem('voxelcraft-save-v1'), localStorage.getItem('voxelcraft-skin-profile-v1')])).toEqual(['world', 'skin']);
});

test('old saves restore full breath; new saves preserve breath and underwater fog resets on surfacing', async ({ page }) => {
  const result = await page.evaluate(async () => {
    // @ts-expect-error Vite module
    const { Game } = await import('/src/game/Game.ts');
    // @ts-expect-error Vite module
    const { BlockId } = await import('/src/game/blocks.ts');
    const host = document.createElement('div'); host.style.cssText = 'width:320px;height:240px'; document.body.append(host);
    localStorage.setItem('voxelcraft-graphics', 'low');
    const game = new Game(host, { onHud() {}, onLockChange() {}, onCraftingChange() {}, onSaveResult() {} });
    game.renderer.setAnimationLoop(null);
    const lowShadows = game.renderer.shadowMap.enabled;
    game.player.respawn(.5, 80, .5);
    for (let y = 80; y <= 83; y++) game.chunks.setBlock(0, y, 0, BlockId.Water);
    game.tick(1000); const wet = game.scene.fog.far;
    game.survival.air = 7; game.saveGame();
    const saved = JSON.parse(localStorage.getItem('voxelcraft-save-v1')!);
    game.survival.air = 15; game.applySave(saved); const restored = game.survival.air;
    delete saved.stats.air; game.applySave(saved); const legacy = game.survival.air;
    game.player.respawn(.5, 90, .5); game.tick(1016); const dry = game.scene.fog.far;
    game.dispose(); host.remove();
    return { lowShadows, wet, dry, restored, legacy };
  });
  expect(result.lowShadows).toBe(false);
  expect(result.wet).toBe(16); expect(result.dry).toBe(64);
  expect(result.restored).toBe(7); expect(result.legacy).toBe(15);
});
