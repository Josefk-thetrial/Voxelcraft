import { test, expect } from '@playwright/test';

async function wardrobe(page: import('@playwright/test').Page) {
  await page.goto('/');
  await page.getByRole('button', { name: /Skins —/ }).click();
}

test('cape selection persists independently of skin layers, supports export and cancellation', async ({ page }) => {
  await wardrobe(page);
  await page.getByLabel('Estilo da capa').selectOption('forest');
  await page.getByLabel('Jaqueta', { exact: true }).uncheck();
  await expect(page.getByRole('link', { name: 'Exportar capa PNG' })).toHaveAttribute('href', /^data:image\/png/);
  await page.getByRole('button', { name: 'Salvar e usar' }).click();
  await page.reload();
  await page.getByRole('button', { name: /Skins —/ }).click();
  await expect(page.getByLabel('Estilo da capa')).toHaveValue('forest');
  await expect(page.getByLabel('Jaqueta', { exact: true })).not.toBeChecked();
  await page.getByLabel('Estilo da capa').selectOption('none');
  await page.getByRole('button', { name: 'Cancelar', exact: true }).click();
  await page.getByRole('button', { name: /Skins —/ }).click();
  await expect(page.getByLabel('Estilo da capa')).toHaveValue('forest');
  await page.getByLabel('Estilo da capa').selectOption('none');
  await page.getByRole('button', { name: 'Salvar e usar' }).click();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('voxelcraft-skin-profile-v1')!).cape.style)).toBe('none');
});

test('cape PNG validates signature, dimensions and size, imports and removes a custom texture', async ({ page }) => {
  await wardrobe(page);
  const input = page.getByLabel('Arquivo da capa');
  await input.setInputFiles({ name: 'fake.png', mimeType: 'image/png', buffer: Buffer.from('fake') });
  await expect(page.getByRole('status')).toContainText('PNG válido');
  await input.setInputFiles({ name: 'large.png', mimeType: 'image/png', buffer: Buffer.alloc(1024 * 1024 + 1) });
  await expect(page.getByRole('status')).toContainText('máximo 1 MB');
  const png = async (height: number) => Buffer.from(await page.evaluate(h => {
    const c = document.createElement('canvas'); c.width = 64; c.height = h;
    const ctx = c.getContext('2d')!; ctx.fillStyle = '#ff6600'; ctx.fillRect(0, 0, 22, 17);
    return c.toDataURL().split(',')[1];
  }, height), 'base64');
  await input.setInputFiles({ name: 'skin.png', mimeType: 'image/png', buffer: await png(64) });
  await expect(page.getByRole('status')).toContainText('capa PNG Java de 64×32');
  await input.setInputFiles({ name: 'cape.png', mimeType: 'image/png', buffer: await png(32) });
  await expect(page.getByRole('status')).toContainText('Capa importada');
  await expect(page.getByLabel('Estilo da capa')).toHaveValue('custom');
  await page.getByRole('button', { name: 'Salvar e usar' }).click();
  await page.reload();
  await page.getByRole('button', { name: /Skins —/ }).click();
  await expect(page.getByLabel('Estilo da capa')).toHaveValue('custom');
  await page.getByRole('button', { name: 'Remover capa importada' }).click();
  await expect(page.getByRole('link', { name: 'Exportar capa PNG' })).toHaveCount(0);
});

test('cape is parented to the torso, uses 64×32 UVs and releases resources', async ({ page }) => {
  await page.goto('/');
  const result = await page.evaluate(async () => {
    // @ts-expect-error Vite-served module
    const { createPlayerModel, animatePlayerModel, disposePlayerModel } = await import('/src/game/PlayerModel.ts');
    // @ts-expect-error Vite-served module
    const { defaultSkinProfile } = await import('/src/game/skin.ts');
    const profile = defaultSkinProfile(); profile.cape.style = 'night'; profile.layers.jacket = false;
    const model = createPlayerModel(profile);
    const cape = model.cape;
    const disposed: string[] = [];
    cape.geometry.addEventListener('dispose', () => disposed.push('geometry'));
    cape.material.addEventListener('dispose', () => disposed.push('material'));
    model.capeTexture.addEventListener('dispose', () => disposed.push('texture'));
    const phase = { value: 0 };
    for (let i = 0; i < 60; i++) animatePlayerModel(model, 7, 1 / 60, phase);
    const movingAngle = cape.rotation.x;
    for (let i = 0; i < 120; i++) animatePlayerModel(model, 0, 1 / 60, phase);
    const result = { attached: cape.parent === model.body, jacket: model.body.children[0].visible, movingAngle, idleAngle: cape.rotation.x, width: cape.geometry.parameters.width, topV: cape.geometry.attributes.uv.getY(16), bottomV: cape.geometry.attributes.uv.getY(18), disposed };
    disposePlayerModel(model);
    return result;
  });
  expect(result.attached).toBe(true); expect(result.jacket).toBe(false);
  expect(result.width).toBe(10 / 16);
  expect(result.topV).toBe(31 / 32); expect(result.bottomV).toBe(15 / 32);
  expect(result.movingAngle).toBeGreaterThan(0.4);
  expect(result.idleAngle).toBeCloseTo(0.1, 2);
  expect(result.disposed.sort()).toEqual(['geometry', 'material', 'texture']);
});

test('animations transition smoothly, settle at rest, and follow airborne/crouch/attack states', async ({ page }) => {
  await page.goto('/');
  const result = await page.evaluate(async () => {
    // @ts-expect-error Vite-served module
    const { createPlayerModel, animatePlayerModel, disposePlayerModel } = await import('/src/game/PlayerModel.ts');
    const model = createPlayerModel(); const phase = { value: 0 };
    for (let i = 0; i < 40; i++) animatePlayerModel(model, 6, 1 / 60, phase);
    const before = model.legR.rotation.x;
    animatePlayerModel(model, 0, 1 / 60, phase);
    const after = model.legR.rotation.x;
    for (let i = 0; i < 180; i++) animatePlayerModel(model, 0, 1 / 60, phase);
    const stopped = model.legR.rotation.x;
    for (let i = 0; i < 90; i++) animatePlayerModel(model, 0, 1 / 60, phase, { grounded: false, attack: 1, crouching: true });
    const result = { before, after, stopped, leg: model.legR.rotation.x, arm: model.armR.rotation.x, torso: model.body.rotation.x };
    disposePlayerModel(model); return result;
  });
  expect(Math.abs(result.after - result.before)).toBeLessThan(0.2);
  expect(result.stopped).toBeCloseTo(0, 3);
  expect(result.leg).toBeCloseTo(0.25, 2);
  expect(result.arm).toBeLessThan(-1);
  expect(result.torso).toBeCloseTo(0.28, 2);
});

test('old profiles safely default to no cape and preview states keep the WebGL canvas', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.setItem('voxelcraft-skin-profile-v1', JSON.stringify({ model: 'slim', layers: { hat: false } })));
  await page.getByRole('button', { name: /Skins —/ }).click();
  await expect(page.getByLabel('Estilo da capa')).toHaveValue('none');
  await page.locator('canvas').evaluate(c => c.setAttribute('data-original', 'true'));
  await page.getByLabel('Estilo da capa').selectOption('ember');
  await page.getByRole('button', { name: 'Frente / costas' }).click();
  for (const motion of ['run', 'jump', 'crouch', 'fly']) {
    await page.getByLabel('Movimento da prévia').selectOption(motion);
  }
  await expect(page.locator('canvas')).toHaveAttribute('data-original', 'true');
  await expect(page.getByLabel('Chapéu / cabelo', { exact: true })).not.toBeChecked();
});
