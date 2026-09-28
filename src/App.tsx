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
import { clearSave } from './game/save';

type Screen = 'menu' | 'game';

export default function App() {
  const [screen, setScreen] = useState<Screen>('menu');
  const [autoload, setAutoload] = useState(false);
  const [gameMode, setGameMode] = useState<'survival' | 'creative'>('survival');

  const startGame = (load: boolean, mode: 'survival' | 'creative' = 'survival') => {
    if (!load) clearSave();
    setAutoload(load);
    setGameMode(mode);
    setScreen('game');
  };

  return screen === 'menu' ? (
    <Menu onPlay={startGame} />
  ) : (
    <GameView autoload={autoload} gameMode={gameMode} onExit={() => setScreen('menu')} />
  );
}
