import { BlockId } from './blocks';

/** Metres below the ocean surface (top of the water block at y=26).
 * Reference model, not a seismic reconstruction of a specific location.
 * References and uncertainty: docs/geology.md.
 */
export const EARTH_RADIUS = 6_371_000;
export const GEO_SEA_Y = 27;
export const BEDROCK_TOP_Y = GEO_SEA_Y - EARTH_RADIUS;
export const depthAt = (y: number) => Math.max(0, GEO_SEA_Y - y);
export interface GeologicalLayer {
  name: string;
  top: number;
  bottom: number;
  block: number;
  state: 'sólido' | 'líquido';
}
export const DEEP_LAYERS: GeologicalLayer[] = [
  { name: 'Manto superior', top: 70_000, bottom: 410_000, block: BlockId.Peridotite, state: 'sólido' },
  { name: 'Transição — wadsleyita', top: 410_000, bottom: 520_000, block: BlockId.Wadsleyite, state: 'sólido' },
  { name: 'Transição — ringwoodita', top: 520_000, bottom: 660_000, block: BlockId.Ringwoodite, state: 'sólido' },
  { name: 'Manto inferior', top: 660_000, bottom: 2_700_000, block: BlockId.Bridgmanite, state: 'sólido' },
  { name: 'Camada D″ (limite aproximado)', top: 2_700_000, bottom: 2_900_000, block: BlockId.PostPerovskite, state: 'sólido' },
  { name: 'Núcleo externo', top: 2_900_000, bottom: 5_150_000, block: BlockId.MoltenCore, state: 'líquido' },
  { name: 'Núcleo interno', top: 5_150_000, bottom: EARTH_RADIUS, block: BlockId.IronNickel, state: 'sólido' },
];
export interface CrustProfile { thickness: number; oceanic: boolean }
export function layersAt(crust: CrustProfile): GeologicalLayer[] {
  return [
    { name: crust.oceanic ? 'Crosta oceânica' : 'Crosta continental', top: 0, bottom: crust.thickness,
      block: crust.oceanic ? BlockId.Basalt : BlockId.Granite, state: 'sólido' },
    { ...DEEP_LAYERS[0], top: crust.thickness }, ...DEEP_LAYERS.slice(1),
  ];
}
export function layerAt(depth: number, crust: CrustProfile): GeologicalLayer {
  if (depth >= EARTH_RADIUS) return { name: 'Bedrock — barreira do jogo', top: EARTH_RADIUS, bottom: EARTH_RADIUS, block: BlockId.Bedrock, state: 'sólido' };
  if (depth < crust.thickness) return { name: crust.oceanic ? 'Crosta oceânica' : 'Crosta continental', top: 0, bottom: crust.thickness,
    block: crust.oceanic ? (depth > crust.thickness * .35 ? BlockId.Gabbro : BlockId.Basalt) : (depth > crust.thickness * .55 ? BlockId.Gneiss : BlockId.Granite), state: 'sólido' };
  for (const layer of DEEP_LAYERS) if (depth < layer.bottom) return layer === DEEP_LAYERS[0] ? { ...layer, top: crust.thickness } : layer;
  return DEEP_LAYERS[DEEP_LAYERS.length - 1];
}
export function mechanicalLayerAt(depth: number, crust: CrustProfile): string {
  if (depth >= EARTH_RADIUS) return 'Limite artificial do mundo';
  const lithosphere = crust.oceanic ? 70_000 : 100_000;
  if (depth < lithosphere) return 'Litosfera rígida (crosta + parte do manto)';
  if (depth < 410_000) return 'Astenosfera — rocha sólida dúctil';
  if (depth < 660_000) return 'Zona de transição do manto';
  if (depth < 2_900_000) return 'Manto inferior sólido';
  return depth < 5_150_000 ? 'Metal líquido' : 'Metal sólido';
}
