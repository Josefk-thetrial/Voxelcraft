// ============================================================
// App.tsx — Gerenciador de telas (Menu ↔ Jogo)
// ------------------------------------------------------------
// Menu recebe a opção de continuar um save existente; a flag
// `autoload` viaja até o Game, que aplica o diff salvo sobre
// o mundo procedural recém-gerado.
// ============================================================
import { useState } from 'react';
import Menu from './components/Menu';
import GameView from './components/GameView';
import { hasSave } from './game/save';

import { createWorldSettings, type WorldSettings } from './game/worldSettings';

type Screen = 'menu' | 'game';

export default function App() {
  const [world, setWorld] = useState<WorldSettings>();
  const [screen, setScreen] = useState<Screen>('menu');
  const [autoload, setAutoload] = useState(false);
  const [gameMode, setGameMode] = useState<'survival' | 'creative'>('survival');

  const startGame = (load: boolean, mode: 'survival' | 'creative' = 'survival', seedText = '') => {
    if (!load && hasSave() && !window.confirm('Criar um novo mundo substituirá o mundo salvo. Deseja continuar?')) return;
    setWorld(load ? undefined : createWorldSettings(seedText));
    setAutoload(load);
    setGameMode(mode);
    setScreen('game');
  };

  return screen === 'menu' ? (
    <Menu onPlay={startGame} />
  ) : (
    <GameView world={world} autoload={autoload} gameMode={gameMode} onExit={() => setScreen('menu')} />
  );
}
