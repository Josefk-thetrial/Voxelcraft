import * as THREE from 'three';
import { ATLAS_COLS, ATLAS_ROWS, getAtlasTexture } from './textures';

/**
 * Material SIMPLES para a mão e drops: usa UV normalizado direto,
 * apenas mostra o tile correto do atlas sem o shader de greedy meshing.
 * Recebe tile [0..N) e mapeia para o atlas via UV já calculado no geo.
 */
export function createSimpleAtlasMaterial(): THREE.MeshLambertMaterial {
  const mat = new THREE.MeshLambertMaterial({
    map: getAtlasTexture(),
    side: THREE.FrontSide,
    transparent: false,
    depthWrite: true,
    depthTest: true,
  });
  return mat;
}

/** Material para flora (grama alta, flores) — DoubleSide com alphaTest. */
export function createFloraMaterial(): THREE.MeshLambertMaterial {
  const material = new THREE.MeshLambertMaterial({
    map: getAtlasTexture(),
    side: THREE.DoubleSide,
    transparent: false,
    alphaTest: 0.1,   // descarta fragmentos quase transparentes
    depthWrite: true,
  });

  material.onBeforeCompile = (shader) => {
    // Injeta leitura do atributo tile (igual ao opaqueMaterial)
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float tile;\nvarying float vVoxelTile;')
      .replace('#include <uv_vertex>', '#include <uv_vertex>\nvVoxelTile = tile;');

    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vVoxelTile;')
      .replace(
        '#include <map_fragment>',
        `#ifdef USE_MAP
          float voxelTile = floor(vVoxelTile + 0.5);
          float voxelCol = mod(voxelTile, ${ATLAS_COLS.toFixed(1)});
          float voxelRow = floor(voxelTile / ${ATLAS_COLS.toFixed(1)});
          vec2 repeatedUv = fract(vMapUv);
          repeatedUv = mix(vec2(0.04), vec2(0.96), repeatedUv);
          vec2 atlasUv = vec2(
            voxelCol + repeatedUv.x,
            ${ATLAS_ROWS.toFixed(1)} - voxelRow - 1.0 + repeatedUv.y
          ) / vec2(${ATLAS_COLS.toFixed(1)}, ${ATLAS_ROWS.toFixed(1)});
          vec4 floraColor = texture2D(map, atlasUv);
          if (floraColor.a < 0.1) discard;
          diffuseColor *= floraColor;
        #endif`,
      );
  };
  material.customProgramCacheKey = () => 'voxel-atlas-v1-flora';
  return material;
}

export function createVoxelMaterial(water = false, doubleSided = false): THREE.MeshLambertMaterial {
  const material = new THREE.MeshLambertMaterial({
    map: getAtlasTexture(),
    side: doubleSided ? THREE.DoubleSide : THREE.FrontSide,
    transparent: water,
    opacity: water ? 0.72 : 1,
    depthWrite: true,
  });

  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        '#include <common>\nattribute float tile;\nvarying float vVoxelTile;',
      )
      .replace('#include <uv_vertex>', '#include <uv_vertex>\nvVoxelTile = tile;');

    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vVoxelTile;')
      .replace(
        '#include <map_fragment>',
        `#ifdef USE_MAP
          float voxelTile = floor(vVoxelTile + 0.5);
          float voxelCol = mod(voxelTile, ${ATLAS_COLS.toFixed(1)});
          float voxelRow = floor(voxelTile / ${ATLAS_COLS.toFixed(1)});
          vec2 repeatedUv = fract(vMapUv);
          repeatedUv = mix(vec2(0.04), vec2(0.96), repeatedUv);
          vec2 atlasUv = vec2(
            voxelCol + repeatedUv.x,
            ${ATLAS_ROWS.toFixed(1)} - voxelRow - 1.0 + repeatedUv.y
          ) / vec2(${ATLAS_COLS.toFixed(1)}, ${ATLAS_ROWS.toFixed(1)});
          diffuseColor *= texture2D(map, atlasUv);
        #endif`,
      );
  };
  material.customProgramCacheKey = () =>
    `voxel-atlas-v1-${water ? 'water' : 'solid'}-${doubleSided ? 'ds' : 'fs'}`;

  return material;
}