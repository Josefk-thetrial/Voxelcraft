/** Bounded PNG decoding shared by skin and cape importers. */
export function decodePng(src: string, normalize: (image: HTMLImageElement) => HTMLCanvasElement): Promise<HTMLCanvasElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => { try { resolve(normalize(image)); } catch (error) { reject(error); } };
    image.onerror = () => reject(new Error('Não foi possível ler a imagem PNG.'));
    image.src = src;
  });
}
export async function importPng(file: File, validSize: (w: number, h: number) => boolean, normalize: (image: HTMLImageElement) => HTMLCanvasElement, sizeError: string): Promise<{ dataUrl: string; legacy: boolean }> {
  if (file.size > 1024 * 1024) throw new Error('O arquivo deve ter no máximo 1 MB.');
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (![137, 80, 78, 71, 13, 10, 26, 10].every((v, i) => bytes[i] === v)) throw new Error('Selecione um arquivo PNG válido.');
  const view = new DataView(bytes.buffer);
  if (bytes.length < 24 || !validSize(view.getUint32(16), view.getUint32(20))) throw new Error(sizeError);
  const url = URL.createObjectURL(file);
  try { return { dataUrl: (await decodePng(url, normalize)).toDataURL('image/png'), legacy: view.getUint32(20) === 32 }; }
  finally { URL.revokeObjectURL(url); }
}
