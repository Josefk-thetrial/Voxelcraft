PASTA DE TEXTURAS CUSTOMIZADAS — VOXELCRAFT
==========================================

Se você não gostar das texturas padrão do jogo, coloque arquivos PNG aqui.
O jogo tenta carregar primeiro essas texturas e, se não encontrar, usa o atlas
procedural interno como fallback.

OPÇÃO 1 — Atlas inteiro
-----------------------
Coloque um arquivo chamado:
  atlas.png

Formato esperado:
  - grade 8 colunas × 4 linhas
  - cada tile será redimensionado para 16x16 internamente
  - você pode usar qualquer resolução proporcional (ex.: 128x64, 256x128)

OPÇÃO 2 — Tiles individuais
---------------------------
Você também pode sobrescrever apenas algumas texturas colocando PNGs com estes nomes:

  grass_top.png
  grass_side.png
  dirt.png
  stone.png
  sand.png
  bedrock.png
  log_side.png
  log_top.png
  planks.png
  leaves.png
  snow_top.png
  snow_side.png
  water.png
  torch.png
  crafting_top.png
  crafting_side.png
  sandstone.png
  grass_tuft.png
  flower.png

DICAS
-----
- PNG com transparência funciona bem para grass_tuft.png e flower.png
- O ideal é usar artes 16x16 ou múltiplos de 16
- Se um arquivo estiver faltando, o jogo usa a textura procedural equivalente
