import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => { await page.goto('/'); });

test('numeric, text and random seeds resolve predictably, including zero and large integers', async ({ page }) => {
  const result = await page.evaluate(async () => {
    // @ts-expect-error Browser-served module
    const { seedFromText, createWorldSettings } = await import('/src/game/worldSettings.ts');
    return {
      zero: createWorldSettings('0'), one: seedFromText('0001'), negative: seedFromText('-1'),
      overflow: seedFromText('4294967297'), huge: seedFromText('18446744073709551616'),
      text: seedFromText('  Mar azul  '), same: seedFromText('Mar azul'), other: seedFromText('Mar verde'),
      randoms: Array.from({ length: 8 }, () => createWorldSettings().seed),
    };
  });
  expect(result.zero).toEqual({ seed: 0, seedText: '0', generatorVersion: 3 });
  expect(result.one).toBe(1); expect(result.negative).toBe(-1);
  expect(result.overflow).toBe(1); expect(result.huge).toBe(0);
  expect(result.text).toBe(result.same); expect(result.text).not.toBe(result.other);
  expect(new Set(result.randoms).size).toBeGreaterThan(1);
});

test('legacy generator matches pre-change snapshots exactly', async ({ page }) => {
  const hashes = await page.evaluate(async () => {
    // @ts-expect-error Browser-served module
    const { TerrainGenerator, Chunk } = await import('/src/game/chunk.ts');
    const gen = new TerrainGenerator(20260214, 1);
    return [[0, 0], [-2, 1], [3, -4], [20, 20]].map(([x, z]) => {
      const chunk = new Chunk(x, z); gen.fillChunk(chunk);
      let hash = 2166136261;
      for (const byte of chunk.data) hash = Math.imul(hash ^ byte, 16777619);
      return hash >>> 0;
    });
  });
  expect(hashes).toEqual([1669136692, 2419693742, 3151059047, 635979213]);
});

test('new terrain is deterministic across instances and chunk generation order, and seeds differ', async ({ page }) => {
  const results = await page.evaluate(async () => {
    // @ts-expect-error Browser-served module
    const { TerrainGenerator, Chunk } = await import('/src/game/chunk.ts');
    const sample = (seed: number, reverse: boolean) => {
      const gen = new TerrainGenerator(seed, 2);
      const coords = [[0, 0], [1, 0], [-1, -1], [15, -8]];
      if (reverse) coords.reverse();
      const result: Record<string, number> = {};
      for (const [x, z] of coords) {
        const chunk = new Chunk(x, z); gen.fillChunk(chunk);
        let hash = 2166136261;
        for (const byte of chunk.data) hash = Math.imul(hash ^ byte, 16777619);
        result[`${x},${z}`] = hash >>> 0;
      }
      return result;
    };
    return [sample(42, false), sample(42, true), sample(43, false)];
  });
  expect(results[0]).toEqual(results[1]); expect(results[0]).not.toEqual(results[2]);
});

test('ocean terrain has finite heights, deep connected water and deterministic dry spawn candidates', async ({ page }) => {
  const result = await page.evaluate(async () => {
    // @ts-expect-error Browser-served module
    const { TerrainGenerator, SEA_LEVEL } = await import('/src/game/chunk.ts');
    const seeds = [0, 1, 42, -1, 12345, 20260214, 2147483647, -2147483648];
    let invalid = 0, unsafe = 0;
    for (const seed of seeds) {
      const gen = new TerrainGenerator(seed, 2);
      for (let z = -512; z <= 512; z += 16) for (let x = -512; x <= 512; x += 16) {
        const h = gen.heightAt(x, z);
        if (!Number.isInteger(h) || h < 4 || h > 240) invalid++;
      }
      const spawn = gen.findSpawn(); const again = new TerrainGenerator(seed, 2).findSpawn();
      if (spawn.x !== again.x || spawn.z !== again.z || gen.heightAt(Math.floor(spawn.x), Math.floor(spawn.z)) < SEA_LEVEL + 3) unsafe++;
    }
    const gen = new TerrainGenerator(12345, 2);
    let deep = 0, water = 0, maxRun = 0;
    for (let z = -512; z <= 512; z += 16) {
      let run = 0;
      for (let x = -512; x <= 512; x += 16) {
        const h = gen.heightAt(x, z);
        if (h < SEA_LEVEL) { water++; run++; } else run = 0;
        if (h <= SEA_LEVEL - 10) deep++;
        maxRun = Math.max(maxRun, run * 16);
      }
    }
    return { invalid, unsafe, deep, water, maxRun };
  });
  expect(result.invalid).toBe(0); expect(result.unsafe).toBe(0);
  expect(result.deep).toBeGreaterThan(400); expect(result.water).toBeGreaterThan(result.deep);
  expect(result.maxRun).toBeGreaterThanOrEqual(320);
});

test('ocean surface joins across chunk edges and seabed stays under water', async ({ page }) => {
  const result = await page.evaluate(async () => {
    // @ts-expect-error Browser-served module
    const { TerrainGenerator, Chunk, SEA_LEVEL } = await import('/src/game/chunk.ts');
    // @ts-expect-error Browser-served module
    const { BlockId } = await import('/src/game/blocks.ts');
    const gen = new TerrainGenerator(12345, 2);
    for (let cz = -16; cz <= 16; cz++) for (let cx = -16; cx <= 16; cx++) {
      if (gen.heightAt(cx * 16 + 15, cz * 16 + 8) > 10) continue;
      const a = new Chunk(cx, cz), b = new Chunk(cx + 1, cz); gen.fillChunk(a); gen.fillChunk(b);
      let joined = 0;
      for (let z = 0; z < 16; z++) {
        if (a.getLocal(15, SEA_LEVEL, z) === BlockId.Water && b.getLocal(0, SEA_LEVEL, z) === BlockId.Water) joined++;
      }
      const h = gen.heightAt(cx * 16 + 15, cz * 16 + 8);
      return { joined, depth: SEA_LEVEL - h, bed: a.getLocal(15, h, 8), sand: BlockId.Sand, stone: BlockId.Stone };
    }
    throw new Error('Deep ocean fixture missing');
  });
  expect(result.joined).toBe(16); expect(result.depth).toBeGreaterThanOrEqual(16);
  expect([result.sand, result.stone]).toContain(result.bed);
});

test('saving and loading uses the saved seed/version, keeps edits and original respawn point', async ({ page }) => {
  const result = await page.evaluate(async () => {
    // @ts-expect-error Browser-served module
    const { Game } = await import('/src/game/Game.ts');
    // @ts-expect-error Browser-served module
    const { createWorldSettings } = await import('/src/game/worldSettings.ts');
    // @ts-expect-error Browser-served module
    const { BlockId } = await import('/src/game/blocks.ts');
    const host = document.createElement('div'); host.style.cssText = 'width:320px;height:240px'; document.body.append(host);
    const callbacks = { onHud() {}, onLockChange() {}, onCraftingChange() {}, onSaveResult() {} };
    const world = createWorldSettings('Mar azul');
    let game = new Game(host, callbacks, { world, gameMode: 'creative' }); game.renderer.setAnimationLoop(null);
    const spawn = game.spawn.toArray(); const px = Math.floor(spawn[0]), pz = Math.floor(spawn[2]);
    const edit = [px, 90, pz]; game.chunks.setBlock(...edit, BlockId.Planks);
    game.player.respawn(px + 2.5, 92, pz + 2.5); game.saveGame(); game.dispose();
    const saved = JSON.parse(localStorage.getItem('voxelcraft-save-v1')!);
    game = new Game(host, callbacks, { autoload: true, world: createWorldSettings('ignored'), gameMode: 'survival' });
    game.renderer.setAnimationLoop(null);
    const result = { seed: game.world.seed, expected: world.seed, text: saved.seedText, version: saved.generatorVersion, block: game.chunks.getBlock(...edit), planks: BlockId.Planks, originalSpawn: spawn, restoredSpawn: game.spawn.toArray(), position: game.player.position.toArray(), mode: game.gameMode };
    game.dispose(); host.remove(); return result;
  });
  expect(result.seed).toBe(result.expected); expect(result.text).toBe('Mar azul'); expect(result.version).toBe(3);
  expect(result.block).toBe(result.planks); expect(result.restoredSpawn).toEqual(result.originalSpawn);
  expect(result.position).not.toEqual(result.originalSpawn); expect(result.mode).toBe('creative');
});

test('an old save selects generator v1 before creating chunks and retains its block edits', async ({ page }) => {
  const result = await page.evaluate(async () => {
    // @ts-expect-error Browser-served module
    const { Game } = await import('/src/game/Game.ts');
    const saved = { version: 1, seed: 20260214, savedAt: 1, player: { x: .5, y: 80, z: .5, yaw: 0, pitch: 0, mode: 'walk' }, gameMode: 'survival', stats: { health: 20, hunger: 20 }, timeOfDay: .4, selectedSlot: 0, inventory: [], edits: [[0, 90, 0, 7]] };
    localStorage.setItem('voxelcraft-save-v1', JSON.stringify(saved));
    const host = document.createElement('div'); host.style.cssText = 'width:320px;height:240px'; document.body.append(host);
    const game = new Game(host, { onHud() {}, onLockChange() {}, onCraftingChange() {}, onSaveResult() {} }, { autoload: true });
    game.renderer.setAnimationLoop(null);
    let hash = 2166136261;
    for (let y = 0; y < 256; y++) for (let z = 0; z < 16; z++) for (let x = 0; x < 16; x++) {
      const block = x === 0 && z === 0 && y === 90 ? 0 : game.chunks.getBlock(x, y, z);
      hash = Math.imul(hash ^ block, 16777619);
    }
    const result = { version: game.world.generatorVersion, hash: hash >>> 0, edit: game.chunks.getBlock(0, 90, 0) };
    game.saveGame(); game.dispose(); host.remove(); return result;
  });
  expect(result).toEqual({ version: 1, hash: 1669136692, edit: 7 });
});

test('menu accepts a text seed and shows the resolved seed in the new world', async ({ page }) => {
  await page.getByLabel('Seed do novo mundo').fill('Mar azul');
  const expected = await page.evaluate(async () => {
    // @ts-expect-error Browser-served module
    const { seedFromText } = await import('/src/game/worldSettings.ts'); return String(seedFromText('Mar azul'));
  });
  await page.getByRole('button', { name: 'Singleplayer — Creative' }).click();
  await expect(page.getByLabel('Seed do mundo', { exact: true })).toHaveValue(expected);
  await expect(page.getByText('Clique para jogar')).toBeVisible();
});

test('unsupported save versions show an error instead of replacing the saved world', async ({ page }) => {
  const raw = JSON.stringify({ version: 1, seed: 42, generatorVersion: 99, edits: [] });
  await page.evaluate(raw => localStorage.setItem('voxelcraft-save-v1', raw), raw);
  await page.reload();
  await page.getByRole('button', { name: 'Continue Saved World' }).click();
  await expect(page.getByRole('alert')).toContainText('O arquivo salvo foi preservado');
  expect(await page.evaluate(() => localStorage.getItem('voxelcraft-save-v1'))).toBe(raw);
});

test('seed controls and graphics remain accessible in a narrow menu', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 650 });
  await page.getByRole('button', { name: 'Sortear', exact: true }).click();
  await expect(page.getByLabel('Seed do novo mundo')).toHaveValue(/^-?\d+$/);
  await page.getByLabel('Qualidade gráfica').selectOption('low');
  await page.getByRole('button', { name: 'Singleplayer — Survival' }).click();
  await expect(page.getByText('Clique para jogar')).toBeVisible();
});
