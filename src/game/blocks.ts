// ============================================================
// blocks.ts — Registro central de tipos de blocos
// ------------------------------------------------------------
// Novidades: NEVE (bloco sólido estilo grama) e ÁGUA —
// bloco TRANSPARENTE: não culla faces vizinhas, tem malha
// própria translúcida e não oferece colisão/apoio.
// ============================================================
import { Tiles } from './textures';

export const BlockId = {
  Air: 0,
  Grass: 1,
  Dirt: 2,
  Stone: 3,
  Sand: 4,
  Bedrock: 5,
  Log: 6,
  Planks: 7,
  Leaves: 8,
  Water: 9,
  Snow: 10,
  Torch: 11,
  CraftingTable: 12,
  Sandstone: 13,
  GrassTuft: 14,
  Flower: 15,
  Granite: 16, Basalt: 17, Gabbro: 18, Gneiss: 19, Peridotite: 20,
  Wadsleyite: 21, Ringwoodite: 22, Bridgmanite: 23, PostPerovskite: 24,
  MoltenCore: 25, IronNickel: 26,
} as const;

export type BlockId = (typeof BlockId)[keyof typeof BlockId];

export interface BlockDef {
  name: string;
  top: number; // índice do tile no atlas para a face superior
  side: number; // faces laterais
  bottom: number; // face inferior
  transparent?: boolean; // renderiza faces vizinhas + malha translúcida
  solid?: boolean;
  render?: 'cube' | 'torch' | 'cross'; // cross = dois planos em X (flora)
}

/** Tabela de definições indexada pelo ID do bloco. */
export const BLOCKS: Record<number, BlockDef> = {
  [BlockId.Granite]: { name: 'Granito', top: Tiles.Granite, side: Tiles.Granite, bottom: Tiles.Granite },
  [BlockId.Basalt]: { name: 'Basalto', top: Tiles.Basalt, side: Tiles.Basalt, bottom: Tiles.Basalt },
  [BlockId.Gabbro]: { name: 'Gabro', top: Tiles.Gabbro, side: Tiles.Gabbro, bottom: Tiles.Gabbro },
  [BlockId.Gneiss]: { name: 'Gnaisse', top: Tiles.Gneiss, side: Tiles.Gneiss, bottom: Tiles.Gneiss },
  [BlockId.Peridotite]: { name: 'Peridotito', top: Tiles.Peridotite, side: Tiles.Peridotite, bottom: Tiles.Peridotite },
  [BlockId.Wadsleyite]: { name: 'Wadsleyita', top: Tiles.Wadsleyite, side: Tiles.Wadsleyite, bottom: Tiles.Wadsleyite },
  [BlockId.Ringwoodite]: { name: 'Ringwoodita', top: Tiles.Ringwoodite, side: Tiles.Ringwoodite, bottom: Tiles.Ringwoodite },
  [BlockId.Bridgmanite]: { name: 'Bridgmanita', top: Tiles.Bridgmanite, side: Tiles.Bridgmanite, bottom: Tiles.Bridgmanite },
  [BlockId.PostPerovskite]: { name: 'Pós-perovskita', top: Tiles.PostPerovskite, side: Tiles.PostPerovskite, bottom: Tiles.PostPerovskite },
  [BlockId.MoltenCore]: { name: 'Ferro-níquel líquido', top: Tiles.MoltenCore, side: Tiles.MoltenCore, bottom: Tiles.MoltenCore, solid: false },
  [BlockId.IronNickel]: { name: 'Ferro-níquel sólido', top: Tiles.IronNickel, side: Tiles.IronNickel, bottom: Tiles.IronNickel },

  [BlockId.Grass]: { name: 'Grama', top: Tiles.GrassTop, side: Tiles.GrassSide, bottom: Tiles.Dirt },
  [BlockId.Dirt]: { name: 'Terra', top: Tiles.Dirt, side: Tiles.Dirt, bottom: Tiles.Dirt },
  [BlockId.Stone]: { name: 'Pedra', top: Tiles.Stone, side: Tiles.Stone, bottom: Tiles.Stone },
  [BlockId.Sand]: { name: 'Areia', top: Tiles.Sand, side: Tiles.Sand, bottom: Tiles.Sand },
  [BlockId.Bedrock]: { name: 'Rocha-mãe', top: Tiles.Bedrock, side: Tiles.Bedrock, bottom: Tiles.Bedrock },
  [BlockId.Log]: { name: 'Tronco', top: Tiles.LogTop, side: Tiles.LogSide, bottom: Tiles.LogTop },
  [BlockId.Planks]: { name: 'Tábuas', top: Tiles.Planks, side: Tiles.Planks, bottom: Tiles.Planks },
  [BlockId.Leaves]: { name: 'Folhas', top: Tiles.Leaves, side: Tiles.Leaves, bottom: Tiles.Leaves },
  [BlockId.Water]: { name: 'Água', top: Tiles.Water, side: Tiles.Water, bottom: Tiles.Water, transparent: true },
  [BlockId.Snow]: { name: 'Neve', top: Tiles.SnowTop, side: Tiles.SnowSide, bottom: Tiles.Dirt },
  [BlockId.Torch]: {
    name: 'Tocha',
    top: Tiles.Torch,
    side: Tiles.Torch,
    bottom: Tiles.Torch,
    transparent: true,
    solid: false,
    render: 'torch',
  },
  [BlockId.CraftingTable]: {
    name: 'Mesa de crafting',
    top: Tiles.CraftingTop,
    side: Tiles.CraftingSide,
    bottom: Tiles.Planks,
  },
  [BlockId.Sandstone]: { name: 'Arenito', top: Tiles.Sandstone, side: Tiles.Sandstone, bottom: Tiles.Sandstone },
  [BlockId.GrassTuft]: {
    name: 'Grama alta',
    top: Tiles.GrassTuft,
    side: Tiles.GrassTuft,
    bottom: Tiles.GrassTuft,
    transparent: true,
    solid: false,
    render: 'cross',
  },
  [BlockId.Flower]: {
    name: 'Flor',
    top: Tiles.Flower,
    side: Tiles.Flower,
    bottom: Tiles.Flower,
    transparent: true,
    solid: false,
    render: 'cross',
  },
};

/**
 * Sólido = colide e serve de apoio para o jogador.
 * Ar e água NÃO são sólidos (na Fase 4 a água terá natação).
 */
export function isSolid(id: number): boolean {
  if (id === BlockId.Air || id === BlockId.Water) return false;
  return BLOCKS[id]?.solid !== false;
}

/** Opaco = culla as faces dos blocos vizinhos. */
export function isOpaque(id: number): boolean {
  if (!isSolid(id)) return false;
  return BLOCKS[id]?.transparent !== true;
}

export function isReplaceable(id: number): boolean {
  return (
    id === BlockId.Air ||
    id === BlockId.Water ||
    id === BlockId.MoltenCore ||
    id === BlockId.Torch ||
    id === BlockId.GrassTuft ||
    id === BlockId.Flower
  );
}

/** Fluids have no collision but provide drag and cannot be breathed. */
export function isFluid(id: number): boolean { return id === BlockId.Water || id === BlockId.MoltenCore; }
