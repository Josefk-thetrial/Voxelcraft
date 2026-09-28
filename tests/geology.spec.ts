import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => { await page.goto('/'); });

test('geological boundaries, thickness sums, phases and exact bedrock datum', async ({ page }) => {
  const result = await page.evaluate(async () => {
    // @ts-expect-error Vite module
    const g = await import('/src/game/geology.ts');
    const crust = { thickness: 35000, oceanic: false };
    const layers = g.layersAt(crust);
    return { radius: g.EARTH_RADIUS, floorDepth: g.depthAt(g.BEDROCK_TOP_Y),
      thickness: layers.reduce((sum: number, layer: any) => sum + layer.bottom - layer.top, 0),
      boundaries: layers.map((l: any) => l.bottom),
      samples: [34999,35000,409999,410000,519999,520000,660000,2700000,2900000,5150000,6371000].map(d => g.layerAt(d, crust).name),
      mantle: g.layerAt(1000000, crust).state, outer: g.layerAt(4000000, crust).state, inner: g.layerAt(6000000, crust).state };
  });
  expect(result.radius).toBe(6371000); expect(result.floorDepth).toBe(6371000); expect(result.thickness).toBe(6371000);
  expect(result.boundaries).toEqual([35000,410000,520000,660000,2700000,2900000,5150000,6371000]);
  expect(result.samples).toEqual(['Crosta continental','Manto superior','Manto superior','Transição — wadsleyita','Transição — wadsleyita','Transição — ringwoodita','Manto inferior','Camada D″ (limite aproximado)','Núcleo externo','Núcleo interno','Bedrock — barreira do jogo']);
  expect([result.mantle, result.outer, result.inner]).toEqual(['sólido','líquido','sólido']);
});

test('crust differs under oceans/continents; deep reads allocate no planet-sized arrays', async ({ page }) => {
  const result = await page.evaluate(async () => {
    // @ts-expect-error Vite module
    const { ChunkManager } = await import('/src/game/ChunkManager.ts');
    // @ts-expect-error Vite module
    const THREE = await import('/node_modules/three/build/three.module.js');
    // @ts-expect-error Vite module
    const { GEO_SEA_Y, BEDROCK_TOP_Y } = await import('/src/game/geology.ts');
    const manager = new ChunkManager(new THREE.Scene(), 42, 2, 3);
    let ocean = 0, land = 0, invalid = 0;
    for (let z = -400; z <= 400; z += 100) for (let x = -400; x <= 400; x += 100) {
      const { crust } = manager.geologicalInfo(x, 0, z);
      if (crust.oceanic) { ocean++; if (crust.thickness < 5000 || crust.thickness > 10000) invalid++; }
      else { land++; if (crust.thickness < 30000 || crust.thickness > 70000) invalid++; }
    }
    const ids = [100000,500000,600000,1000000,2800000,4000000,6000000].map(d => manager.getBlock(0, GEO_SEA_Y - d, 0));
    const protectedFloor = !manager.setBlock(0, BEDROCK_TOP_Y - 1, 0, 0);
    const result = { ocean, land, invalid, ids, loaded: manager.loadedCount(), bytes: manager.allocatedVoxelBytes(), protectedFloor, floor: manager.getBlock(0, BEDROCK_TOP_Y - 1, 0), aboveFloor: manager.getBlock(0, BEDROCK_TOP_Y, 0) };
    manager.dispose(); return result;
  });
  expect(result.ocean).toBeGreaterThan(0); expect(result.land).toBeGreaterThan(0); expect(result.invalid).toBe(0);
  expect(result.ids).toEqual([20,21,22,23,24,25,26]);
  expect(result.loaded).toBe(0); expect(result.bytes).toBe(0);
  expect(result.protectedFloor).toBe(true); expect(result.floor).toBe(5); expect(result.aboveFloor).toBe(26);
});

test('vertical streaming stays bounded and negative-Y edits/torches survive unload and reloading', async ({ page }) => {
  const result = await page.evaluate(async () => {
    // @ts-expect-error Vite module
    const { ChunkManager } = await import('/src/game/ChunkManager.ts');
    // @ts-expect-error Vite module
    const THREE = await import('/node_modules/three/build/three.module.js');
    const manager = new ChunkManager(new THREE.Scene(), 42, 2, 3);
    const y = -99984; // Exact 16-block section boundary.
    manager.forceSpawnArea(.5, .5, y);
    manager.setBlock(0, y, 0, 0); manager.setBlock(0, y - 1, 0, 11);
    for (let i = 0; i < 200; i++) manager.update(.5, .5, y);
    const bytes1 = manager.allocatedVoxelBytes(), count1 = manager.loadedCount();
    const saved = manager.serializeEdits();
    manager.forceSpawnArea(.5, .5, -5999973);
    for (let i = 0; i < 200; i++) manager.update(.5, .5, -5999973);
    const bytes2 = manager.allocatedVoxelBytes(), count2 = manager.loadedCount();
    manager.forceSpawnArea(.5, .5, y);
    const edited = manager.getBlock(0, y, 0), torch = manager.getBlock(0, y - 1, 0);
    const lights = manager.getNearbyTorches(new THREE.Vector3(.5, y, .5), 20, 6).length;
    manager.dispose();
    const restored = new ChunkManager(new THREE.Scene(), 42, 2, 3); restored.applyEdits(saved); restored.forceSpawnArea(.5, .5, y);
    const reload = [restored.getBlock(0, y, 0), restored.getBlock(0, y - 1, 0)]; restored.dispose();
    return { bytes1, bytes2, count1, count2, edited, torch, lights, reload, edits: saved.length };
  });
  expect(result.count1).toBeLessThanOrEqual(175); expect(result.count2).toBeLessThanOrEqual(175);
  expect(result.bytes1).toBeLessThan(1024 * 1024); expect(result.bytes2).toBeLessThan(1024 * 1024);
  expect(result.edited).toBe(0); expect(result.torch).toBe(11); expect(result.lights).toBe(1);
  expect(result.reload).toEqual([0,11]); expect(result.edits).toBe(2);
});

test('local meshing culls internal molten faces and keeps geometry near zero', async ({ page }) => {
  const result = await page.evaluate(async () => {
    // @ts-expect-error Vite module
    const { Chunk } = await import('/src/game/chunk.ts');
    // @ts-expect-error Vite module
    const { buildChunkGeometry } = await import('/src/game/mesher.ts');
    // @ts-expect-error Vite module
    const { isSolid } = await import('/src/game/blocks.ts');
    const chunk = new Chunk(0, 0, -4000000, 16); chunk.data.fill(25); chunk.highestBlockY = 15;
    const enclosed = buildChunkGeometry(chunk, () => 25);
    const exposed = buildChunkGeometry(chunk, () => 0);
    const vertices = exposed.torch.attributes.position.array;
    const result = { enclosed: enclosed.torch === null, vertices: vertices.length / 3, min: Math.min(...vertices), max: Math.max(...vertices), solid: isSolid(25) };
    Object.values(exposed).forEach((geo: any) => geo?.dispose()); return result;
  });
  expect(result).toEqual({ enclosed: true, vertices: 24, min: 0, max: 16, solid: false });
});

test('render origin rebases static meshes and both cameras and restores coordinates on errors', async ({ page }) => {
  const result = await page.evaluate(async () => {
    // @ts-expect-error Vite module
    const THREE = await import('/node_modules/three/build/three.module.js');
    // @ts-expect-error Vite module
    const { withVerticalRenderOrigin } = await import('/src/game/renderOrigin.ts');
    return [false,true].map(external => {
      const scene = new THREE.Scene(), obj = new THREE.Object3D(), camera = new THREE.PerspectiveCamera();
      obj.position.y = -6370976; obj.matrixAutoUpdate = false; obj.updateMatrix(); scene.add(obj);
      camera.position.y = -6370971.38; if (!external) scene.add(camera);
      let renderMeshY = 0, renderCameraY = 0;
      try { withVerticalRenderOrigin(scene, camera, () => { scene.updateMatrixWorld(true); camera.updateMatrixWorld(true); renderMeshY = obj.matrixWorld.elements[13]; renderCameraY = camera.matrixWorld.elements[13]; throw new Error('test'); }); } catch { /* deliberate failure */ }
      return { renderMeshY, renderCameraY, meshY: obj.position.y, matrixY: obj.matrix.elements[13], cameraY: camera.position.y };
    });
  });
  for (const r of result) {
    expect(Math.abs(r.renderMeshY)).toBeLessThan(256); expect(Math.abs(r.renderCameraY)).toBeLessThan(256);
    expect(r.renderCameraY - r.renderMeshY).toBeCloseTo(4.62, 5);
    expect(r.meshY).toBe(-6370976); expect(r.matrixY).toBe(-6370976); expect(r.cameraY).toBe(-6370971.38);
  }
});

test('bedrock collision and raycast work at six million metres without the old void death', async ({ page }) => {
  const result = await page.evaluate(async () => {
    // @ts-expect-error Vite module
    const { Game } = await import('/src/game/Game.ts');
    // @ts-expect-error Vite module
    const { raycastVoxels } = await import('/src/game/raycast.ts');
    // @ts-expect-error Vite module
    const { BEDROCK_TOP_Y } = await import('/src/game/geology.ts');
    // @ts-expect-error Vite module
    const THREE = await import('/node_modules/three/build/three.module.js');
    const host = document.createElement('div'); host.style.cssText = 'width:320px;height:240px'; document.body.append(host);
    const game = new Game(host, { onHud() {}, onLockChange() {}, onCraftingChange() {}, onSaveResult() {} }, { gameMode: 'creative', world: { seed: 42, seedText: '42', generatorVersion: 3 } }); game.renderer.setAnimationLoop(null);
    game.travelToDepth(6371000); game.player.mode = 'walk';
    for (let i = 0; i < 30; i++) game.player.update(.1, game.chunks);
    game.gameMode = 'survival'; game.tick(1000);
    const position = game.player.position.clone();
    const hit = raycastVoxels(position.clone().add(new THREE.Vector3(0, 1.62, 0)), new THREE.Vector3(0, -1, 0), (x: number,y: number,z: number) => game.chunks.getBlock(x,y,z));
    const result = { y: position.y, bottom: BEDROCK_TOP_Y, health: game.survival.health, id: hit?.blockId, distance: hit?.distance, prohibited: game.travelToDepth(1000) };
    game.dispose(); host.remove(); return result;
  });
  expect(result.y).toBeGreaterThanOrEqual(result.bottom - .001); expect(result.y).toBeCloseTo(result.bottom, 3);
  expect(result.health).toBe(20); expect(result.id).toBe(5); expect(result.distance).toBeCloseTo(1.62, 3); expect(result.prohibited).toBe(false);
});

test('deep-world save restores depth and edits; v2 saves retain their shallow world', async ({ page }) => {
  const result = await page.evaluate(async () => {
    // @ts-expect-error Vite module
    const { Game } = await import('/src/game/Game.ts');
    const cb = { onHud() {}, onLockChange() {}, onCraftingChange() {}, onSaveResult() {} };
    const host = document.createElement('div'); host.style.cssText = 'width:320px;height:240px'; document.body.append(host);
    let game = new Game(host, cb, { gameMode: 'creative', world: { seed: 42, seedText: '42', generatorVersion: 3 } }); game.renderer.setAnimationLoop(null);
    game.travelToDepth(6000000); const original = game.player.position.toArray(); game.saveGame(); game.dispose();
    game = new Game(host, cb, { autoload: true }); game.renderer.setAnimationLoop(null);
    const restored = game.player.position.toArray(), version = game.world.generatorVersion;
    const chamber = game.chunks.getBlock(Math.floor(restored[0]), restored[1], Math.floor(restored[2])); game.dispose();
    game = new Game(host, cb, { gameMode: 'creative', world: { seed: 42, seedText: '42', generatorVersion: 2 } }); game.renderer.setAnimationLoop(null); game.saveGame(); game.dispose();
    game = new Game(host, cb, { autoload: true }); game.renderer.setAnimationLoop(null);
    const legacy = { version: game.world.generatorVersion, belowZero: game.chunks.getBlock(0,-1,0), shortcut: game.travelToDepth(100000) };
    game.dispose(); host.remove(); return { original, restored, version, chamber, legacy };
  });
  expect(result.original).toEqual(result.restored); expect(result.version).toBe(3); expect(result.chamber).toBe(0);
  expect(result.legacy).toEqual({ version: 2, belowZero: 5, shortcut: false });
});

test('creative geology panel visits exact depth and exposes layers without removing pause controls', async ({ page }) => {
  test.setTimeout(60000);
  await page.getByLabel('Seed do novo mundo').fill('42');
  await page.getByRole('button', { name: 'Singleplayer — Creative' }).click();
  await page.getByText('Clique para jogar').click();
  await expect.poll(() => page.evaluate(() => Boolean(document.pointerLockElement))).toBe(true);
  await page.evaluate(() => document.exitPointerLock());
  await page.getByText('Camadas da Terra · 1 bloco = 1 metro').click();
  await expect(page.getByRole('cell', { name: 'Núcleo externo líquido' })).toBeVisible();
  await page.getByLabel('Profundidade para visitar (m)').fill('6371000');
  await page.getByRole('button', { name: 'Visitar profundidade', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Câmara criada');
  await expect(page.getByRole('button', { name: 'SALVAR', exact: true })).toBeVisible();
  // Chromium can temporarily reject re-locking immediately after a pointer-lock exit.
  // Retry the real user gesture rather than mocking the lock or sleeping a fixed interval.
  await expect(async () => {
    const resume = page.getByRole('button', { name: 'CONTINUAR', exact: true });
    if (await resume.isVisible()) await resume.click();
    await expect.poll(() => page.evaluate(() => Boolean(document.pointerLockElement)), { timeout: 1500 }).toBe(true);
  }).toPass({ timeout: 15000, intervals: [1000] });
  await expect(page.getByText('6.371.000 m de profundidade', { exact: true })).toBeVisible();
});
