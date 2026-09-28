// PlayerModel.ts — Modelo 3D com mapeamento UV real de skin Minecraft 64×64
import * as THREE from 'three';
import { getStoredSkinDataUrl } from './skin';

const SKIN_PATH = '/textures/skin.png';

function loadSkinTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d')!;

  // Desenha um Steve básico como fallback (caso a imagem demore ou falhe)
  ctx.fillStyle = '#c8a07e'; ctx.fillRect(0, 0, 32, 16); 
  ctx.fillStyle = '#4a3422'; ctx.fillRect(8, 0, 8, 8); ctx.fillRect(0, 8, 8, 8); ctx.fillRect(24, 8, 8, 8); ctx.fillRect(16, 0, 8, 8);
  ctx.fillStyle = '#c8a07e'; ctx.fillRect(8, 8, 8, 8); 
  ctx.fillStyle = '#fff'; ctx.fillRect(9, 10, 2, 2); ctx.fillRect(13, 10, 2, 2);
  ctx.fillStyle = '#4466aa'; ctx.fillRect(10, 10, 1, 2); ctx.fillRect(13, 10, 1, 2);
  ctx.fillStyle = '#7a5040'; ctx.fillRect(10, 13, 4, 1);
  ctx.fillStyle = '#00a8a8'; ctx.fillRect(16, 16, 24, 16);
  ctx.fillStyle = '#c8a07e'; ctx.fillRect(40, 16, 16, 16); ctx.fillRect(32, 48, 16, 16);
  ctx.fillStyle = '#3b3b8f'; ctx.fillRect(0, 16, 16, 16); ctx.fillRect(16, 48, 16, 16);

  const tex = new THREE.CanvasTexture(canvas);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.colorSpace = THREE.SRGBColorSpace;

  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.onload = () => {
    ctx.clearRect(0, 0, 64, 64);
    ctx.drawImage(img, 0, 0, 64, 64);
    tex.needsUpdate = true;
  };
  img.src = getStoredSkinDataUrl() ?? SKIN_PATH;

  return tex;
}

/**
 * Mapeia os UVs de um BoxGeometry para uma skin 64x64.
 * tx, ty: início da região na skin.
 * w, h, d: largura, altura, profundidade do membro.
 */
function mapSkinUVs(geo: THREE.BoxGeometry, tx: number, ty: number, w: number, h: number, d: number): void {
  const uv = geo.attributes.uv;
  const S = 64;

  const setFace = (idx: number, x: number, y: number, sw: number, sh: number) => {
    const u0 = x / S;
    const u1 = (x + sw) / S;
    const v0 = 1 - y / S;
    const v1 = 1 - (y + sh) / S;
    const offset = idx * 4;

    // Ordem dos vértices nas faces do Three.js BoxGeometry
    if (idx === 2 || idx === 3) { // Topo e Base
      uv.setXY(offset,     u0, v0);
      uv.setXY(offset + 1, u1, v0);
      uv.setXY(offset + 2, u0, v1);
      uv.setXY(offset + 3, u1, v1);
    } else {
      uv.setXY(offset,     u1, v0);
      uv.setXY(offset + 1, u0, v0);
      uv.setXY(offset + 2, u1, v1);
      uv.setXY(offset + 3, u0, v1);
    }
  };

  // 0:+X(Dir), 1:-X(Esq), 2:+Y(Top), 3:-Y(Base), 4:+Z(Frente), 5:-Z(Tras)
  setFace(0, tx + d + w, ty + d, d, h); // Lado direito (da perspectiva do membro)
  setFace(1, tx, ty + d, d, h);         // Lado esquerdo
  setFace(2, tx + d, ty, w, d);         // Topo
  setFace(3, tx + d + w, ty, w, d);     // Base
  setFace(4, tx + d, ty + d, w, h);     // FRENTE (rosto/peito)
  setFace(5, tx + d + w + d, ty + d, w, h); // TRÁS
}

export interface PlayerModelParts {
  group: THREE.Group;
  head: THREE.Mesh;
  body: THREE.Mesh;
  armR: THREE.Mesh;
  armL: THREE.Mesh;
  legR: THREE.Mesh;
  legL: THREE.Mesh;
}

export function createPlayerModel(): PlayerModelParts {
  const tex = loadSkinTexture();
  const mat = new THREE.MeshLambertMaterial({ map: tex, alphaTest: 0.1, transparent: true });
  const group = new THREE.Group();

  const skinBox = (w: number, h: number, d: number, tx: number, ty: number, bw: number, bh: number, bd: number): THREE.Mesh => {
    const geo = new THREE.BoxGeometry(bw, bh, bd);
    mapSkinUVs(geo, tx, ty, w, h, d);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
  };

  // ── Membros ──
  const head = skinBox(8, 8, 8, 0, 0, 0.5, 0.5, 0.5);
  head.geometry.translate(0, 0.25, 0);
  head.position.y = 1.5;

  // Camada externa da cabeça (hat/helmet layer) DESATIVADA por padrão.
  // Motivo: muitas skins usam essa camada como capuz/máscara e ela estava
  // cobrindo o rosto, parecendo bug. Se quiser, podemos reativar depois com toggle.

  const body = skinBox(8, 12, 4, 16, 16, 0.5, 0.75, 0.25);
  body.position.y = 1.125;

  const armR = skinBox(4, 12, 4, 40, 16, 0.25, 0.75, 0.25);
  armR.geometry.translate(0, -0.375, 0);
  armR.position.set(-0.375, 1.5, 0);

  const armL = skinBox(4, 12, 4, 32, 48, 0.25, 0.75, 0.25);
  armL.geometry.translate(0, -0.375, 0);
  armL.position.set(0.375, 1.5, 0);

  const legR = skinBox(4, 12, 4, 0, 16, 0.25, 0.75, 0.25);
  legR.geometry.translate(0, -0.375, 0);
  legR.position.set(-0.125, 0.75, 0);

  const legL = skinBox(4, 12, 4, 16, 48, 0.25, 0.75, 0.25);
  legL.geometry.translate(0, -0.375, 0);
  legL.position.set(0.125, 0.75, 0);

  group.add(head, body, armR, armL, legR, legL);
  return { group, head, body, armR, armL, legR, legL };
}

export function animatePlayerModel(parts: PlayerModelParts, walkSpeed: number, dt: number, phase: { value: number }): void {
  // Ritmo mais lento e amplitude mais natural
  if (walkSpeed > 0.01) phase.value += walkSpeed * dt * 2.8;
  const swing = walkSpeed > 0.01 ? Math.sin(phase.value) * 0.45 : 0;
  parts.armR.rotation.x = swing;
  parts.armL.rotation.x = -swing;
  parts.legR.rotation.x = -swing;
  parts.legL.rotation.x = swing;
}
