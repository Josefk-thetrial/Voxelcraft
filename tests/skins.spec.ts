import { test, expect } from '@playwright/test';

async function openWardrobe(page: import('@playwright/test').Page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Skins — Personalizar personagem' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
}

test('saves model and layers; cancel and Escape leave the saved profile unchanged', async ({ page }) => {
  await openWardrobe(page);
  await page.getByRole('radio', { name: /Slim/ }).check();
  await page.getByRole('checkbox', { name: 'Jaqueta' }).uncheck();
  await page.getByRole('button', { name: 'Salvar e usar' }).click();
  await page.reload();
  await page.getByRole('button', { name: /Skins —/ }).click();
  await expect(page.getByRole('radio', { name: /Slim/ })).toBeChecked();
  await expect(page.getByRole('checkbox', { name: 'Jaqueta' })).not.toBeChecked();
  await page.getByRole('button', { name: 'Restaurar padrão' }).click();
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: /Skins —/ }).click();
  await expect(page.getByRole('radio', { name: /Slim/ })).toBeChecked();
});

test('invalid files report errors, valid uploads can be exported', async ({ page }) => {
  await openWardrobe(page);
  const file = page.locator('input[type=file]');
  await file.setInputFiles({ name: 'fake.png', mimeType: 'image/png', buffer: Buffer.from('not a PNG') });
  await expect(page.getByRole('status')).toContainText('PNG válido');
  const makePng = async (size: number) => Buffer.from(await page.evaluate(size => {
    const c = document.createElement('canvas'); c.width = c.height = size;
    const ctx = c.getContext('2d')!; ctx.fillStyle = '#cc55aa'; ctx.fillRect(0, 0, size, size);
    return c.toDataURL().split(',')[1];
  }, size), 'base64');
  await file.setInputFiles({ name: 'wrong.png', mimeType: 'image/png', buffer: await makePng(32) });
  await expect(page.getByRole('status')).toContainText('64×64 ou 64×32');
  await file.setInputFiles({ name: 'valid.png', mimeType: 'image/png', buffer: await makePng(64) });
  await expect(page.getByRole('status')).toContainText('Skin importada');
  await expect(page.getByRole('link', { name: 'Exportar PNG' })).toHaveAttribute('href', /^data:image\/png/);
  await page.getByRole('button', { name: 'Salvar e usar' }).click();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('voxelcraft-skin-profile-v1')!).dataUrl)).toMatch(/^data:image\/png/);
});

test('legacy conversion mirrors individual faces, clears opaque hat and keeps base opaque', async ({ page }) => {
  await page.goto('/');
  const result = await page.evaluate(async () => {
    // @ts-expect-error Browser-served Vite module
    const { decodeSkin } = await import('/src/game/skin.ts');
    const canvas = document.createElement('canvas'); canvas.width = 64; canvas.height = 32;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#333333'; ctx.fillRect(0, 0, 64, 32);
    ctx.fillStyle = '#ff0000'; ctx.fillRect(4, 20, 1, 12);
    ctx.fillStyle = '#0000ff'; ctx.fillRect(7, 20, 1, 12);
    const converted = await decodeSkin(canvas.toDataURL());
    const c = converted.getContext('2d');
    return { size: [converted.width, converted.height], left: [...c.getImageData(20, 52, 1, 1).data], right: [...c.getImageData(23, 52, 1, 1).data], hat: c.getImageData(40, 8, 1, 1).data[3], jacket: c.getImageData(20, 36, 1, 1).data[3] };
  });
  expect(result).toEqual({ size: [64, 64], left: [0, 0, 255, 255], right: [255, 0, 0, 255], hat: 0, jacket: 0 });
});

test('modern skins preserve outer alpha and independent left limbs; base alpha is forced', async ({ page }) => {
  await page.goto('/');
  const result = await page.evaluate(async () => {
    // @ts-expect-error Browser-served Vite module
    const { decodeSkin } = await import('/src/game/skin.ts');
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 64;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#00ff00'; ctx.fillRect(20, 52, 4, 12);
    ctx.fillStyle = 'rgba(255,0,0,0.5)'; ctx.fillRect(40, 8, 8, 8);
    const c = (await decodeSkin(canvas.toDataURL())).getContext('2d');
    return { left: [...c.getImageData(20, 52, 1, 1).data], base: c.getImageData(8, 8, 1, 1).data[3], hat: c.getImageData(40, 8, 1, 1).data[3], sleeve: c.getImageData(44, 36, 1, 1).data[3] };
  });
  expect(result.left).toEqual([0, 255, 0, 255]);
  expect(result.base).toBe(255); expect(result.hat).toBe(128); expect(result.sleeve).toBe(0);
});

test('slim dimensions, six attached overlays, front UV orientation and disposal', async ({ page }) => {
  await page.goto('/');
  const result = await page.evaluate(async () => {
    // @ts-expect-error Browser-served Vite module
    const { createPlayerModel, disposePlayerModel } = await import('/src/game/PlayerModel.ts');
    // @ts-expect-error Browser-served Vite module
    const { defaultSkinProfile } = await import('/src/game/skin.ts');
    const profile = defaultSkinProfile(); profile.model = 'slim'; profile.layers.hat = false;
    const model = createPlayerModel(profile);
    let disposed = false; model.texture.addEventListener('dispose', () => { disposed = true; });
    const result = { width: model.armR.geometry.parameters.width, overlays: model.group.children.map((p: any) => p.children.length), hat: model.head.children[0].visible, u0: model.head.geometry.attributes.uv.getX(16), u1: model.head.geometry.attributes.uv.getX(17), disposed: false };
    disposePlayerModel(model); result.disposed = disposed; return result;
  });
  expect(result).toEqual({ width: 3 / 16, overlays: [1, 1, 1, 1, 1, 1], hat: false, u0: 8 / 64, u1: 16 / 64, disposed: true });
});

test('migrates existing skin key without touching the world; blocked storage is reported', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => {
    localStorage.setItem('voxelcraft-player-skin', 'data:image/png;base64,legacy');
    localStorage.setItem('voxelcraft-save-v1', 'existing-world');
  });
  await page.getByRole('button', { name: /Skins —/ }).click();
  await expect(page.getByRole('link', { name: 'Exportar PNG' })).toBeVisible();
  await page.evaluate(() => { Storage.prototype.setItem = () => { throw new DOMException('Full', 'QuotaExceededError'); }; });
  await page.getByRole('button', { name: 'Salvar e usar' }).click();
  await expect(page.getByRole('status')).toContainText('armazenamento cheio ou bloqueado');
  expect(await page.evaluate(() => localStorage.getItem('voxelcraft-save-v1'))).toBe('existing-world');
});

test('starting a new world asks before replacing a save', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.setItem('voxelcraft-save-v1', 'existing-world'));
  page.once('dialog', dialog => dialog.dismiss());
  await page.getByRole('button', { name: 'Singleplayer — Survival' }).click();
  expect(await page.evaluate(() => localStorage.getItem('voxelcraft-save-v1'))).toBe('existing-world');
  await expect(page.getByRole('button', { name: 'Singleplayer — Creative' })).toBeVisible();
});

test('wardrobe fits a small viewport and exposes all controls', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 700 });
  await openWardrobe(page);
  const dialog = page.getByRole('dialog');
  expect(await dialog.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
  await page.getByRole('button', { name: 'Salvar e usar' }).click();
  await expect(dialog).not.toBeVisible();
});

for (const mode of ['Survival', 'Creative']) {
  test(`${mode} still initializes the world with the saved slim skin`, async ({ page }) => {
    test.setTimeout(60000);
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await openWardrobe(page);
    await page.getByRole('radio', { name: /Slim/ }).check();
    await page.getByRole('button', { name: 'Salvar e usar' }).click();
    await page.getByRole('button', { name: `Singleplayer — ${mode}` }).click();
    await expect(page.getByText('Clique para jogar')).toBeVisible({ timeout: 30000 });
    await expect(page.locator('canvas')).toBeVisible();
    // Let multiple simulation/render frames run, including player animation.
    await page.waitForTimeout(2000);
    expect(errors).toEqual([]);
  });
}
