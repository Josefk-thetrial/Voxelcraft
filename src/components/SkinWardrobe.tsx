import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import SkinPreview, { type PreviewMotion } from './SkinPreview';
import { defaultSkinProfile, getSkinProfile, importSkin, saveSkinProfile, SKIN_LAYERS, type SkinLayer } from '../game/skin';

import { CAPE_STYLES, capeDataUrl, importCape, type CapeStyle } from '../game/cape';

const capeLabels: Record<CapeStyle, string> = { none: 'Sem capa', ember: 'Brasa', forest: 'Floresta', night: 'Estelar', custom: 'Personalizada' };
const labels: Record<SkinLayer, string> = {
  hat: 'Chapéu / cabelo', jacket: 'Jaqueta', rightSleeve: 'Manga direita',
  leftSleeve: 'Manga esquerda', rightPants: 'Calça direita', leftPants: 'Calça esquerda',
};
export default function SkinWardrobe({ onClose }: { onClose(): void }) {
  const [profile, setProfile] = useState(getSkinProfile);
  const [message, setMessage] = useState('As alterações só são aplicadas ao salvar.');
  const [busy, setBusy] = useState(false);
  const [motion, setMotion] = useState<PreviewMotion>('walk');
  const capeInput = useRef<HTMLInputElement>(null);
  const [walking, setWalking] = useState(true);
  const dialog = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    const el = dialog.current!;
    el.showModal();
    return () => { alive.current = false; el.close(); };
  }, []);
  const upload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setBusy(true);
    try {
      const result = await importSkin(file);
      if (!alive.current) return;
      setProfile(p => ({ ...p, dataUrl: result.dataUrl, model: result.legacy ? 'classic' : p.model }));
      setMessage(result.legacy ? 'Skin antiga convertida para 64×64 com membros espelhados.' : 'Skin importada. Escolha o modelo correto e salve.');
    } catch (error) {
      if (alive.current) setMessage(error instanceof Error ? error.message : 'Não foi possível importar a skin.');
    } finally { if (alive.current) setBusy(false); }
  };
  const uploadCape = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]; event.target.value = '';
    if (!file) return;
    setBusy(true);
    try {
      const dataUrl = await importCape(file);
      if (alive.current) {
        setProfile(p => ({ ...p, cape: { style: 'custom', dataUrl } }));
        setMessage('Capa importada. Use Frente / costas para conferir e salve para aplicar.');
      }
    } catch (error) {
      if (alive.current) setMessage(error instanceof Error ? error.message : 'Não foi possível importar a capa.');
    } finally { if (alive.current) setBusy(false); }
  };
  const selectedCapeUrl = capeDataUrl(profile.cape);
  const save = () => {
    if (saveSkinProfile(profile)) onClose();
    else setMessage('Não foi possível salvar: armazenamento cheio ou bloqueado. Exporte sua skin antes de sair.');
  };
  return <dialog ref={dialog} className="skin-dialog" onCancel={onClose} aria-labelledby="wardrobe-title">
    <header className="skin-header">
      <div><span className="skin-eyebrow">SEU PERSONAGEM</span><h2 id="wardrobe-title">Vestiário de skins</h2></div>
      <button className="skin-close" onClick={onClose} aria-label="Fechar sem salvar">×</button>
    </header>
    <div className="skin-layout">
      <section className="skin-stage">
        <SkinPreview profile={profile} walking={walking} motion={motion} />
        <p>Arraste para girar · Role para aproximar</p>
        <label><input type="checkbox" checked={walking} onChange={e => setWalking(e.target.checked)} /> Animar personagem</label>
        <label className="skin-motion">Movimento da prévia
          <select value={motion} onChange={e => setMotion(e.target.value as PreviewMotion)}>
            <option value="walk">Caminhada</option><option value="run">Corrida</option>
            <option value="crouch">Agachado</option><option value="jump">No ar / salto</option><option value="fly">Voo</option>
          </select>
        </label>
      </section>
      <section className="skin-options" aria-label="Personalização">
        <h3>01 / Sua textura</h3>
        <p>Skins Java PNG de 64×64 ou antigas de 64×32. Máximo 1 MB. Salvas somente neste navegador.</p>
        <button className="mc-menu-btn" disabled={busy} onClick={() => input.current?.click()}>{busy ? 'Importando…' : 'Importar skin PNG'}</button>
        <input ref={input} aria-label="Arquivo da skin" type="file" accept="image/png,.png" hidden onChange={upload} />
        <div className="skin-actions">
          {profile.dataUrl && <a className="skin-text-btn" download="voxelcraft-skin.png" href={profile.dataUrl}>Exportar PNG</a>}
          <button className="skin-text-btn" disabled={busy} onClick={() => { setProfile(p => ({ ...defaultSkinProfile(), cape: p.cape })); setMessage('Skin padrão selecionada. Salve para confirmar.'); }}>Restaurar padrão</button>
        </div>
        <fieldset disabled={busy}>
          <legend>02 / Modelo do personagem</legend>
          <div className="skin-models">
            <label><input type="radio" name="model" checked={profile.model === 'classic'} onChange={() => setProfile(p => ({ ...p, model: 'classic' }))} /> Clássico <small>Braços de 4 pixels</small></label>
            <label><input type="radio" name="model" checked={profile.model === 'slim'} onChange={() => setProfile(p => ({ ...p, model: 'slim' }))} /> Slim <small>Braços de 3 pixels</small></label>
          </div>
          <p>O PNG não informa o modelo. Se as mangas parecerem erradas, troque esta opção.</p>
        </fieldset>
        <fieldset disabled={busy}>
          <legend>03 / Camadas externas</legend>
          <div className="skin-layers">{SKIN_LAYERS.map(layer => <label key={layer}>
            <input type="checkbox" checked={profile.layers[layer]} onChange={e => setProfile(p => ({ ...p, layers: { ...p.layers, [layer]: e.target.checked } }))} />{labels[layer]}
          </label>)}</div>
        </fieldset>
        <fieldset disabled={busy}>
          <legend>04 / Capa</legend>
          <p>Cosmética nas costas, animada com o movimento. PNG Java de 64×32, até 1 MB. Não é uma elytra.</p>
          <label className="skin-motion">Estilo da capa
            <select value={profile.cape.style} onChange={e => setProfile(p => ({ ...p, cape: { ...p.cape, style: e.target.value as CapeStyle } }))}>
              {CAPE_STYLES.map(style => <option key={style} value={style} disabled={style === 'custom' && !profile.cape.dataUrl}>{capeLabels[style]}</option>)}
            </select>
          </label>
          <button className="mc-menu-btn" onClick={() => capeInput.current?.click()}>Importar capa PNG</button>
          <input ref={capeInput} type="file" accept="image/png,.png" aria-label="Arquivo da capa" hidden onChange={uploadCape} />
          <div className="skin-actions">
            {selectedCapeUrl && <a className="skin-text-btn" href={selectedCapeUrl} download="voxelcraft-capa.png">Exportar capa PNG</a>}
            {profile.cape.dataUrl && <button className="skin-text-btn" onClick={() => setProfile(p => ({ ...p, cape: { style: 'none', dataUrl: null } }))}>Remover capa importada</button>}
          </div>
        </fieldset>
      </section>
    </div>
    <footer className="skin-footer">
      <p role="status" aria-live="polite">{message}</p>
      <div className="skin-actions"><button className="mc-menu-btn" onClick={onClose}>Cancelar</button><button className="mc-menu-btn skin-save" disabled={busy} onClick={save}>Salvar e usar</button></div>
    </footer>
  </dialog>;
}
