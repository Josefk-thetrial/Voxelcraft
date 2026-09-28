import { useState, useEffect, useRef, type ChangeEvent } from 'react';
import { hasSave } from '../game/save';
import { clearStoredSkinDataUrl, setStoredSkinDataUrl } from '../game/skin';

interface MenuProps {
  onPlay(loadExisting: boolean, mode: 'survival' | 'creative'): void;
}

const SPLASHES = [
  'Yaaaaaaaaaaaaaaaaaaaaaaaay!',
  'Agora no navegador!',
  'Sem instalar nada!',
  'Feito com café e Three.js!',
  'Cuidado com os zumbis!',
  'Não é um bug, é uma feature!',
  '100% artesanal!',
  'Melhor que dever de casa!',
  'Funciona no celular? Talvez!',
  'Ctrl+S salva vidas!',
  'Não cave pra baixo!',
  'Eu sou Steve?',
  'Also try Terraria!',
  'HEEEEROBRINE removido!',
  'Pixels > Polígonos!',
  'WebGL go brrrrr!',
  'Sem lag... espero!',
  'Powered by curiosidade!',
  'Cavernas são assustadoras!',
  'Porcos são amigos, não comida!',
  'Zumbi não paga aluguel!',
  'F pra voar, F pra respeitar!',
  'Bloco a bloco!',
  'Proceduralmente gerado!',
  'localStorage é meu HD!',
  'Greedy meshing!',
  'Perlin noise everywhere!',
];

export default function Menu({ onPlay }: MenuProps) {
  const saved = hasSave();
  const [splash, setSplash] = useState('');
  const skinInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setSplash(SPLASHES[Math.floor(Math.random() * SPLASHES.length)]);
  }, []);

  const onPickSkin = () => skinInputRef.current?.click();

  const onSkinChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.includes('png')) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setStoredSkinDataUrl(reader.result);
        setSplash('Skin carregada!');
      }
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="relative h-full w-full overflow-hidden bg-black select-none text-white">
      {/* Panorama de fundo */}
      <img src="/images/panorama.jpg" alt="" className="mc-panorama" draggable={false} />

      {/* ── Layout exato do Minecraft Java Edition ── */}
      <div className="mc-screen">

        {/* LOGO — topo, 25% da altura */}
        <div className="mc-logo-area">
          <div className="mc-logo-wrap">
            <h1 className="mc-title">MINECRAFT</h1>
            <p className="mc-subtitle">Browser Edition</p>
            {splash && <span className="mc-splash">{splash}</span>}
          </div>
        </div>

        {/* BOTÕES — centro, 50% */}
        <div className="mc-buttons-area">
          <button onClick={() => onPlay(false, 'survival')} className="mc-menu-btn">
            Singleplayer — Survival
          </button>
          <button onClick={() => onPlay(false, 'creative')} className="mc-menu-btn">
            Singleplayer — Creative
          </button>
          {saved && (
            <button onClick={() => onPlay(true, 'survival')} className="mc-menu-btn">
              Continue Saved World
            </button>
          )}
          <div className="mc-btn-row">
            <button onClick={onPickSkin} className="mc-menu-btn mc-menu-btn--half">Upload Skin</button>
            <button onClick={() => { clearStoredSkinDataUrl(); setSplash('Skin limpa!'); }} className="mc-menu-btn mc-menu-btn--half">Reset Skin</button>
          </div>
          <input
            ref={skinInputRef}
            type="file"
            accept="image/png"
            className="hidden"
            onChange={onSkinChange}
          />
        </div>

        {/* RODAPÉ */}
        <p className="mc-footer-left">VoxelCraft 1.0.0</p>
        <p className="mc-footer-right">Not affiliated with Mojang AB.<br />Built with Three.js &amp; React</p>
      </div>
    </div>
  );
}
