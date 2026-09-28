import { getGraphicsQuality, saveGraphicsQuality, type GraphicsQuality } from '../game/graphics';
import { useState, useEffect } from 'react';
import { hasSave, readSave } from '../game/save';
import { randomSeed, seedFromText } from '../game/worldSettings';
import SkinWardrobe from './SkinWardrobe';

interface MenuProps {
  onPlay(loadExisting: boolean, mode: 'survival' | 'creative', seedText?: string): void;
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
  const [quality, setQuality] = useState(getGraphicsQuality);
  const [seedText, setSeedText] = useState('');
  const saved = hasSave();
  const [save] = useState(readSave);
  const [splash, setSplash] = useState('');
  const [wardrobeOpen, setWardrobeOpen] = useState(false);

  useEffect(() => {
    setSplash(SPLASHES[Math.floor(Math.random() * SPLASHES.length)]);
  }, []);

  return (
    <div className="relative h-full w-full overflow-hidden bg-black select-none text-white">
      {wardrobeOpen && <SkinWardrobe onClose={() => setWardrobeOpen(false)} />}
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
          <div className="world-seed-settings">
            <label htmlFor="world-seed">Seed do novo mundo</label>
            <div className="world-seed-row">
              <input id="world-seed" value={seedText} maxLength={128} spellCheck={false} autoComplete="off" placeholder="Vazio = aleatória · número ou texto" onChange={e => setSeedText(e.target.value)} aria-describedby="seed-help" />
              <button type="button" onClick={() => setSeedText(String(randomSeed()))} title="Gerar uma seed aleatória">Sortear</button>
            </div>
            <p id="seed-help">{seedText.trim() ? `Seed numérica: ${seedFromText(seedText)} · Gerador v3 · Terra profunda` : 'Em branco, uma seed aleatória é sorteada ao criar.'}</p>
            {save && <p>Continuar usa a seed salva: <strong>{save.seed}</strong> · v{save.generatorVersion ?? 1}</p>}
          </div>
          <button onClick={() => onPlay(false, 'survival', seedText)} className="mc-menu-btn">
            Singleplayer — Survival
          </button>
          <button onClick={() => onPlay(false, 'creative', seedText)} className="mc-menu-btn">
            Singleplayer — Creative
          </button>
          {saved && (
            <button onClick={() => onPlay(true, 'survival')} className="mc-menu-btn">
              Continue Saved World
            </button>
          )}
          <button onClick={() => setWardrobeOpen(true)} className="mc-menu-btn">Skins — Personalizar personagem</button>
          <label className="graphics-setting">Qualidade gráfica
            <select value={quality} onChange={e => {
              const value = e.target.value as GraphicsQuality;
              if (saveGraphicsQuality(value)) setQuality(value);
              else setSplash('Não foi possível salvar a qualidade gráfica.');
            }}>
              <option value="low">Leve — menos sombras e alcance</option>
              <option value="balanced">Equilibrada — recomendada</option>
              <option value="high">Alta — visual completo</option>
            </select>
          </label>
        </div>

      </div>
      <div className="menu-footer">
        <p className="mc-footer-left">VoxelCraft 1.0.0</p>
        <p className="mc-footer-right">Not affiliated with Mojang AB.<br />Built with Three.js &amp; React</p>
      </div>
    </div>
  );
}
