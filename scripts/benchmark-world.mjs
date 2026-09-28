// Run against npm run dev. Optional CHROMIUM_PATH selects a system browser.
import { chromium } from '@playwright/test';
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--no-sandbox'] });
try {
  const page = await browser.newPage();
  await page.goto(process.env.BENCH_URL || 'http://127.0.0.1:5173');
  const result = await page.evaluate(async () => {
    const { ChunkManager } = await import('/src/game/ChunkManager.ts');
    const THREE = await import('/node_modules/three/build/three.module.js');
    const manager = new ChunkManager(new THREE.Scene(), 12345, 5);
    manager.forceSpawnArea();
    const samples = [];
    for (let i = 0; i < 400; i++) {
      const start = performance.now(); manager.update(0.5, 0.5); samples.push(performance.now() - start);
    }
    const busy = samples.filter(v => v > 0.1).sort((a,b) => a-b);
    const start = performance.now();
    for (let i = 0; i < 10000; i++) manager.update(0.5, 0.5);
    const idleMs = performance.now() - start;
    const result = { radius: 5, seed: 12345, chunks: manager.loadedCount(), meshes: manager.meshedCount(), streamingTotalMs: samples.reduce((a,b)=>a+b,0), busyP95Ms: busy[Math.floor(busy.length * .95)], worstUpdateMs: Math.max(...samples), idle10000UpdatesMs: idleMs };
    manager.dispose(); return result;
  });
  console.log(JSON.stringify(result, null, 2));
} finally { await browser.close(); }
