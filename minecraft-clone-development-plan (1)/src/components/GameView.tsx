// ============================================================
// GameView.tsx — HUD e telas da Fase 5 (final)
// ------------------------------------------------------------
// Novidades: chip de bioma, contadores de mobs, botão SALVAR
// MUNDO com toast de confirmação e suporte a carregar um save
// (prop autoload vinda do menu principal).
// ============================================================
import { useEffect, useRef, useState } from 'react';
import {
  Check,
  Clock3,
  Footprints,
  Gauge,
  Home,
  Layers,
  MapPin,
  MoonStar,
  Pause,
  PiggyBank,
  Play,
  Save,
  Skull,
  Sun,
  TreePine,
  X,
  Eraser,
} from 'lucide-react';
import { Game, type HudState } from '../game/Game';
import { ALL_CREATIVE_ITEM_IDS, RECIPES, getItemMeta } from '../game/inventory';

interface GameViewProps {
  onExit(saved: boolean): void;
  autoload: boolean;
  gameMode: 'survival' | 'creative';
}

const PHASE5_CHECKLIST = [
  '4 biomas: planície, floresta, deserto e neve',
  'Cavernas com túneis e cavernas amplas (ruído 3D)',
  'Árvores que cruzam bordas de chunk + grama alta e flores',
  'Porco passivo (vagueia/foge) e zumbi hostil (persegue à noite)',
  'Efeitos sonoros sintetizados via WebAudio',
  'Salvar/carregar mundo completo no navegador',
];



export default function GameView({ onExit, autoload, gameMode }: GameViewProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const gameRef = useRef<Game | null>(null);
  const [hud, setHud] = useState<HudState | null>(null);
  const [locked, setLocked] = useState(false);
  const [everLocked, setEverLocked] = useState(false);
  const [craftingOpen, setCraftingOpen] = useState(false);
  const [saveToast, setSaveToast] = useState<'ok' | 'fail' | null>(null);
  const toastTimer = useRef<number | null>(null);

  useEffect(() => {
    const game = new Game(hostRef.current!, {
      onHud: setHud,
      onLockChange: (isLocked) => {
        setLocked(isLocked);
        if (isLocked) setEverLocked(true);
      },
      onCraftingChange: setCraftingOpen,
      onSaveResult: (ok) => {
        setSaveToast(ok ? 'ok' : 'fail');
        if (toastTimer.current) window.clearTimeout(toastTimer.current);
        toastTimer.current = window.setTimeout(() => setSaveToast(null), 2600);
      },
    }, { autoload, gameMode } as any);
    gameRef.current = game;
    return () => {
      if (toastTimer.current) window.clearTimeout(toastTimer.current);
      game.dispose();
      gameRef.current = null;
    };
  }, [autoload, gameMode]);

  const lock = () => gameRef.current?.lockPointer();
  const isCreative = hud?.gameMode === 'creative';
  const showStart = !locked && !everLocked && !craftingOpen && (!hud || hud.health > 0);
  const showPause = !locked && everLocked && !craftingOpen && (!hud || hud.health > 0);
  const showDeath = hud && hud.health <= 0 && !isCreative;

  const countFor = (blockId: number): number => {
    const slot = hud?.hotbarItemIds.findIndex((id) => id === blockId) ?? -1;
    return slot >= 0 ? hud?.hotbarCounts[slot] ?? 0 : 0;
  };

  return (
    <div className="relative h-full w-full select-none overflow-hidden bg-black">
      <div ref={hostRef} className="absolute inset-0" />

      {locked && hud && (
        <>
          <div className="vignette" />
          <div className="crosshair" />

          {/* Painel debug */}
          <div className="absolute left-4 top-4 font-semibold">
            <div className="flex items-center gap-3 rounded-md border border-white/15 bg-black/55 px-3 py-2 text-xs text-white/85 backdrop-blur-sm">
              <span className="flex items-center gap-1.5"><Gauge className="h-3.5 w-3.5 text-lime-300" />{hud.fps} FPS</span>
              <span className="h-3 w-px bg-white/25" />
              <span className="flex items-center gap-1.5 tabular-nums"><MapPin className="h-3.5 w-3.5 text-lime-300" />X {hud.x.toFixed(1)} · Y {hud.y.toFixed(1)} · Z {hud.z.toFixed(1)}</span>
              <span className="h-3 w-px bg-white/25" />
              <span className="flex items-center gap-1.5"><TreePine className="h-3.5 w-3.5 text-lime-300" />{hud.biome}</span>
              <span className="h-3 w-px bg-white/25" />
              <span className="flex items-center gap-1.5 tabular-nums"><Layers className="h-3.5 w-3.5 text-lime-300" />{hud.chunks} chunks{hud.pending > 0 && <span className="text-amber-300">+{hud.pending}</span>}</span>
              <span className="h-3 w-px bg-white/25" />
              <span className="flex items-center gap-1.5 text-lime-300">
                {hud.mode === 'fly' ? 'VOANDO' : hud.crouching ? 'AGACHADO' : hud.grounded ? 'NO CHÃO' : 'NO AR'}
                <Footprints className="h-3.5 w-3.5" />
              </span>
            </div>
          </div>

          {/* Relógio + mobs */}
          <div className="absolute right-4 top-4 flex items-center gap-3 rounded-md border border-white/15 bg-black/55 px-3 py-2 text-xs font-bold text-white/85 backdrop-blur-sm">
            {hud.dayPhase === 'Noite' ? <MoonStar className="h-4 w-4 text-blue-200" /> : <Sun className="h-4 w-4 text-amber-300" />}
            <span>{hud.dayPhase}</span>
            <span className="h-3 w-px bg-white/25" />
            <Clock3 className="h-3.5 w-3.5 text-lime-300" />
            <span className="tabular-nums">{hud.clock}</span>
            <span className="h-3 w-px bg-white/25" />
            <span className="flex items-center gap-1 text-pink-300"><PiggyBank className="h-3.5 w-3.5" />{hud.pigs}</span>
            <span className="flex items-center gap-1 text-emerald-400"><Skull className="h-3.5 w-3.5" />{hud.zombies}</span>
          </div>

          {hud.targetBlock && (
            <div className="absolute left-1/2 top-[calc(50%+22px)] -translate-x-1/2 rounded bg-black/45 px-2 py-1 text-[11px] font-bold uppercase tracking-wider text-white/70 backdrop-blur-sm">
              {hud.targetBlock}
            </div>
          )}

          {/* ── Área inferior: vida, hotbar ── */}
          <div className="pointer-events-none absolute bottom-0 left-1/2 -translate-x-1/2 flex flex-col items-center gap-0">

            {/* Barras de vida e fome (apenas Sobrevivência) */}
            {!isCreative && (
              <div className="flex items-center gap-6 mb-1">
                {/* Vida: 10 corações (cada = 2 HP) */}
                <div className="flex gap-0.5">
                  {Array.from({ length: 10 }, (_, i) => {
                    const full = hud.health >= (i + 1) * 2;
                    const half = !full && hud.health >= i * 2 + 1;
                    return (
                      <span key={i} className="mc-heart">
                        {full ? '❤' : half ? '💔' : '🖤'}
                      </span>
                    );
                  })}
                </div>
                {/* Fome: 10 peças */}
                <div className="flex gap-0.5">
                  {Array.from({ length: 10 }, (_, i) => {
                    const full = hud.hunger >= (i + 1) * 2;
                    const half = !full && hud.hunger >= i * 2 + 1;
                    return (
                      <span
                        key={i}
                        className={`mc-food ${full ? 'mc-food--full' : half ? 'mc-food--half' : 'mc-food--empty'}`}
                      >
                        ◆
                      </span>
                    );
                  })}
                </div>
              </div>
            )}
            {isCreative && (
              <div className="mb-1">
                <span className="rounded bg-purple-600/40 px-3 py-0.5 font-pixel text-[8px] tracking-wider text-purple-200 border border-purple-400/30">✦ CRIATIVO</span>
              </div>
            )}

            {/* Hotbar */}
            <div className="mb-1 text-[10px] font-bold uppercase tracking-widest text-white drop-shadow-[0_1px_2px_#000]">{hud.selectedBlock}</div>
            <div className="hotbar mb-2">
              {hud.hotbarItemIds.map((id, index) => {
                const item = getItemMeta(id);
                return (
                  <div key={`${id}-${index}`} className={`hotbar-slot ${hud.selectedSlot === index ? 'is-selected' : ''}`}>
                    <span className="hotbar-number">{index + 1}</span>
                    <span className={`voxel-icon ${item.css}`} />
                    <span className="hotbar-count">{isCreative ? '∞' : hud.hotbarCounts[index]}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}

      {/* Toast de salvamento */}
      {saveToast && (
        <div className={`fade-up absolute left-1/2 top-20 z-40 -translate-x-1/2 flex items-center gap-2 rounded-md border px-4 py-2 text-sm font-bold backdrop-blur-md ${saveToast === 'ok' ? 'border-lime-300/40 bg-lime-500/15 text-lime-300' : 'border-red-400/40 bg-red-500/15 text-red-300'}`}>
          {saveToast === 'ok' ? <Check className="h-4 w-4" /> : <X className="h-4 w-4" />}
          {saveToast === 'ok' ? 'Mundo salvo com sucesso!' : 'Falha ao salvar (storage indisponível)'}
        </div>
      )}

      {/* Inventário Estilo Minecraft */}
      {craftingOpen && hud && (
        <div className="absolute inset-0 z-30 grid place-items-center bg-black/75 p-4 backdrop-blur-sm" onClick={(e) => { if (e.target === e.currentTarget) gameRef.current?.closeCrafting(); }}>
          <div className="mc-inventory">
            {/* Cabeçalho */}
            <div className="mc-inv-header">
              <span className="mc-inv-title">{isCreative ? 'Criativo' : 'Fabricação'}</span>
              <button onClick={() => gameRef.current?.closeCrafting()} className="mc-inv-close" aria-label="Fechar">✕</button>
            </div>

            {isCreative ? (
              <>
                {/* Grade criativa — todos os itens disponíveis */}
                <div className="mc-inv-search">Procurar</div>
                <div className="mc-inv-grid">
                  {ALL_CREATIVE_ITEM_IDS.map((id) => {
                    const item = getItemMeta(id);
                    return (
                      <button key={id} onClick={() => gameRef.current?.chooseCreativeItem(id)} className="mc-inv-slot" title={item.name}>
                        <span className={`voxel-icon ${item.css}`} />
                      </button>
                    );
                  })}
                </div>

                {/* Hotbar atual no fundo */}
                <div className="mc-inv-separator" />
                <div className="mc-inv-hotbar-row">
                  {hud.hotbarItemIds.map((id, index) => {
                    const item = getItemMeta(id);
                    return (
                      <div key={`hb-${index}`} className={`mc-inv-slot ${hud.selectedSlot === index ? 'is-active' : ''}`}>
                        <span className={`voxel-icon ${item.css}`} />
                      </div>
                    );
                  })}
                </div>
              </>
            ) : (
              <>
                {/* Modo Sobrevivência — Crafting 2×2 + receitas */}
                <div className="mc-inv-survival-layout">
                  <div className="mc-inv-craft-section">
                    <p className="mc-inv-subtitle">Fabricação</p>
                    <div className="mc-inv-craft-grid">
                      {[0,1,2,3].map((i) => <div key={i} className="mc-inv-slot mc-inv-slot--empty" />)}
                    </div>
                    <span className="mc-inv-arrow">→</span>
                    <div className="mc-inv-slot mc-inv-slot--empty mc-inv-slot--result" />
                  </div>
                </div>

                {/* Receitas disponíveis */}
                <div className="mc-inv-separator" />
                <p className="mc-inv-subtitle">Receitas</p>
                <div className="mc-inv-recipes">
                  {RECIPES.map((recipe) => {
                    const canCraft = recipe.ingredients.every((item) => countFor(item.blockId) >= item.amount);
                    return (
                      <button
                        key={recipe.id}
                        disabled={!canCraft}
                        onClick={() => gameRef.current?.craft(recipe.id)}
                        className={`mc-inv-recipe ${canCraft ? '' : 'opacity-40'}`}
                        title={recipe.description}
                      >
                        <span className={`voxel-icon ${recipe.css}`} />
                        <span className="mc-inv-recipe-name">{recipe.name}</span>
                        <span className="mc-inv-recipe-qty">×{recipe.result.amount}</span>
                      </button>
                    );
                  })}
                </div>

                {/* Hotbar atual */}
                <div className="mc-inv-separator" />
                <div className="mc-inv-hotbar-row">
                  {hud.hotbarItemIds.map((id, index) => {
                    const item = getItemMeta(id);
                    return (
                      <div key={`hb-${index}`} className={`mc-inv-slot ${hud.selectedSlot === index ? 'is-active' : ''}`}>
                        <span className={`voxel-icon ${item.css}`} />
                        <span className="mc-inv-slot-count">{hud.hotbarCounts[index]}</span>
                      </div>
                    );
                  })}
                </div>
              </>
            )}

            <p className="mc-inv-footer">Pressione E para fechar</p>
          </div>
        </div>
      )}

      {/* Início — clique em qualquer lugar para capturar o mouse */}
      {showStart && (
        <div
          className="absolute inset-0 z-20 grid place-items-center bg-black/50 cursor-pointer"
          onClick={lock}
        >
          <p className="font-pixel text-sm text-white/80 animate-pulse">
            Clique para jogar
          </p>
        </div>
      )}

      {/* Pausa */}
      {showPause && (
        <div className="absolute inset-0 z-20 grid place-items-center bg-black/70 p-6 backdrop-blur-sm">
          <div className="fade-up w-full max-w-lg border border-white/15 bg-[#0d120a]/95 p-8 shadow-2xl">
            <h2 className="flex items-center justify-center gap-3 text-center font-pixel text-sm text-white"><Pause className="h-4 w-4 text-lime-300" />JOGO PAUSADO</h2>
            <div className="mt-6 border border-lime-300/20 bg-lime-400/5 p-4">
              <p className="mb-3 flex items-center gap-2 font-pixel text-[8px] tracking-wider text-lime-300"><Check className="h-4 w-4" /> FASE 5 CONCLUÍDA — PROJETO FINALIZADO</p>
              <ul className="space-y-2">
                {PHASE5_CHECKLIST.map((label) => <li key={label} className="flex items-center gap-2.5 text-sm font-semibold text-white/80"><Check className="h-4 w-4 shrink-0 text-lime-400" />{label}</li>)}
              </ul>
            </div>
            <div className="mt-5 flex gap-3">
              <button onClick={() => gameRef.current?.saveGame()} className="mc-btn flex-1 !px-4"><Save className="h-4 w-4" />SALVAR</button>
              <button onClick={lock} className="mc-btn flex-1 !px-4"><Play className="h-4 w-4 fill-current" />CONTINUAR</button>
            </div>
            <button onClick={() => onExit(true)} className="mc-btn mc-btn--stone mt-3 w-full"><Home className="h-4 w-4" />VOLTAR AO MENU</button>
            <p className="mt-4 flex items-center justify-center gap-2 text-center text-[11px] font-semibold text-white/35">
              <Eraser className="h-3.5 w-3.5" /> Escolha "Novo mundo" no menu para apagar o save
            </p>
          </div>
        </div>
      )}

      {/* TELA DE MORTE (YOU DIED!) */}
      {showDeath && (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-red-900/60 p-6 backdrop-blur-md animate-in fade-in duration-700">
          <h2 className="mc-death-title mb-12">You died!</h2>
          <div className="flex flex-col gap-3 w-full max-w-[400px]">
            <button onClick={() => gameRef.current?.respawn()} className="mc-menu-btn">
              Respawn
            </button>
            <button onClick={() => onExit(false)} className="mc-menu-btn">
              Title Screen
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
