import { BlockId } from './blocks';

export interface ItemMeta {
  id: number;
  name: string;
  css: string;
}

/** Biblioteca completa de itens/blocos jogáveis para o inventário criativo. */
export const ITEM_LIBRARY: ItemMeta[] = [
  { id: BlockId.Grass,         name: 'Grama',            css: 'block-grass' },
  { id: BlockId.Dirt,          name: 'Terra',            css: 'block-dirt' },
  { id: BlockId.Stone,         name: 'Pedra',            css: 'block-stone' },
  { id: BlockId.Sand,          name: 'Areia',            css: 'block-sand' },
  { id: BlockId.Sandstone,     name: 'Arenito',          css: 'block-sandstone' },
  { id: BlockId.Planks,        name: 'Tábuas',           css: 'block-planks' },
  { id: BlockId.Log,           name: 'Tronco',           css: 'block-log' },
  { id: BlockId.Leaves,        name: 'Folhas',           css: 'block-leaves' },
  { id: BlockId.Snow,          name: 'Neve',             css: 'block-snow' },
  { id: BlockId.CraftingTable, name: 'Mesa',             css: 'block-crafting' },
  { id: BlockId.Torch,         name: 'Tocha',            css: 'block-torch' },
  { id: BlockId.Water,         name: 'Água',             css: 'block-water' },
  { id: BlockId.GrassTuft,     name: 'Grama alta',       css: 'block-grass-tuft' },
  { id: BlockId.Flower,        name: 'Flor',             css: 'block-flower' },
  { id: BlockId.Granite, name: 'Granito', css: 'block-geology-granite' },
  { id: BlockId.Basalt, name: 'Basalto', css: 'block-geology-basalt' },
  { id: BlockId.Gabbro, name: 'Gabro', css: 'block-geology-gabbro' },
  { id: BlockId.Gneiss, name: 'Gnaisse', css: 'block-geology-gneiss' },
  { id: BlockId.Peridotite, name: 'Peridotito', css: 'block-geology-peridotite' },
  { id: BlockId.Wadsleyite, name: 'Wadsleyita', css: 'block-geology-wadsleyite' },
  { id: BlockId.Ringwoodite, name: 'Ringwoodita', css: 'block-geology-ringwoodite' },
  { id: BlockId.Bridgmanite, name: 'Bridgmanita', css: 'block-geology-bridgmanite' },
  { id: BlockId.PostPerovskite, name: 'Pós-perovskita', css: 'block-geology-postperovskite' },
  { id: BlockId.MoltenCore, name: 'Ferro-níquel líquido', css: 'block-geology-moltencore' },
  { id: BlockId.IronNickel, name: 'Ferro-níquel sólido', css: 'block-geology-ironnickel' },
  { id: BlockId.Bedrock,       name: 'Rocha-mãe',        css: 'block-bedrock' },
];

export const DEFAULT_HOTBAR_IDS = ITEM_LIBRARY.slice(0, 9).map((item) => item.id);
export const HOTBAR_SIZE = 9;
export const ALL_CREATIVE_ITEM_IDS = ITEM_LIBRARY.map((item) => item.id);

const META_MAP = new Map(ITEM_LIBRARY.map((item) => [item.id, item]));

export function getItemMeta(id: number): ItemMeta {
  return META_MAP.get(id) ?? { id, name: `Item ${id}`, css: 'block-stone' };
}

export interface Ingredient {
  blockId: number;
  amount: number;
}

export interface Recipe {
  id: string;
  name: string;
  description: string;
  ingredients: Ingredient[];
  result: Ingredient;
  css: string;
}

export const RECIPES: Recipe[] = [
  {
    id: 'planks',
    name: 'Tábuas de madeira',
    description: 'Transforma um tronco em quatro tábuas.',
    ingredients: [{ blockId: BlockId.Log, amount: 1 }],
    result: { blockId: BlockId.Planks, amount: 4 },
    css: 'block-planks',
  },
  {
    id: 'crafting-table',
    name: 'Mesa de crafting',
    description: 'Quatro tábuas formam uma bancada de trabalho.',
    ingredients: [{ blockId: BlockId.Planks, amount: 4 }],
    result: { blockId: BlockId.CraftingTable, amount: 1 },
    css: 'block-crafting',
  },
  {
    id: 'torches',
    name: 'Tochas',
    description: 'Uma tábua e uma pedra produzem quatro tochas.',
    ingredients: [
      { blockId: BlockId.Planks, amount: 1 },
      { blockId: BlockId.Stone, amount: 1 },
    ],
    result: { blockId: BlockId.Torch, amount: 4 },
    css: 'block-torch',
  },
];

const STARTING_COUNTS: Record<number, number> = {
  [BlockId.Grass]: 24,
  [BlockId.Dirt]: 32,
  [BlockId.Stone]: 32,
  [BlockId.Sand]: 20,
  [BlockId.Planks]: 12,
  [BlockId.Log]: 6,
  [BlockId.CraftingTable]: 1,
  [BlockId.Torch]: 4,
  [BlockId.Water]: 8,
};

export class Inventory {
  private counts = new Map<number, number>();

  constructor() {
    for (const [id, amount] of Object.entries(STARTING_COUNTS)) {
      this.counts.set(Number(id), amount);
    }
  }

  count(id: number): number {
    return this.counts.get(id) ?? 0;
  }

  add(id: number, amount = 1): void {
    this.counts.set(id, this.count(id) + amount);
  }

  consume(id: number, amount = 1): boolean {
    if (this.count(id) < amount) return false;
    this.counts.set(id, this.count(id) - amount);
    return true;
  }

  canCraft(recipe: Recipe): boolean {
    return recipe.ingredients.every((item) => this.count(item.blockId) >= item.amount);
  }

  craft(recipe: Recipe): boolean {
    if (!this.canCraft(recipe)) return false;
    for (const item of recipe.ingredients) this.consume(item.blockId, item.amount);
    this.add(recipe.result.blockId, recipe.result.amount);
    return true;
  }

  /** Contagens alinhadas com os IDs atuais da hotbar. */
  hotbarCounts(hotbarIds: number[]): number[] {
    return hotbarIds.map((id) => this.count(id));
  }

  entries(): [number, number][] {
    return Array.from(this.counts.entries());
  }

  restore(entries: [number, number][]): void {
    this.counts.clear();
    for (const [id, amount] of entries) this.counts.set(id, amount);
  }
}
