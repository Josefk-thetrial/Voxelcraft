import { useState } from 'react';
import { EARTH_RADIUS, layersAt, type CrustProfile } from '../game/geology';

const meters = (n: number) => Math.round(n).toLocaleString('pt-BR');
export default function GeologyPanel({ crust, creative, onTravel }: { crust: CrustProfile; creative: boolean; onTravel(depth: number): boolean }) {
  const [depth, setDepth] = useState('100000');
  const [status, setStatus] = useState('');
  return <details className="geology-panel">
    <summary>Camadas da Terra · 1 bloco = 1 metro</summary>
    <p>Profundidades abaixo do nível do mar. Limites aproximados; a crosta varia conforme a região.</p>
    <table><thead><tr><th>Camada</th><th>Profundidade (m)</th><th>Espessura (m)</th></tr></thead>
      <tbody>{layersAt(crust).map(layer => <tr key={layer.name}>
        <td>{layer.name}<small>{layer.state}</small></td><td>{meters(layer.top)}–{meters(layer.bottom)}</td><td>{meters(layer.bottom - layer.top)}</td>
      </tr>)}</tbody>
    </table>
    <p>A litosfera e a astenosfera são divisões mecânicas sobrepostas a essas camadas. O manto é sólido e dúctil, não um oceano de lava. Solo e sedimentos não têm uma espessura universal.</p>
    <p>Bedrock em <strong>{meters(EARTH_RADIUS)} m</strong>: barreira artificial do jogo. Modelo vertical, não um planeta esférico; sem simulação de pressão ou calor geotérmico.</p>
    {creative ? <form onSubmit={e => {
      e.preventDefault();
      const value = Number(depth);
      if (!depth.trim() || !Number.isFinite(value) || value < 0 || value > EARTH_RADIUS) { setStatus('Informe uma profundidade entre 0 e 6.371.000 metros.'); return; }
      setStatus(onTravel(value) ? 'Câmara criada. Continue o jogo para explorar; o voo está ativado.' : 'Não foi possível viajar.');
    }}>
      <label>Profundidade para visitar (m)<input type="number" min="0" max={EARTH_RADIUS} step="1" required value={depth} onChange={e => setDepth(e.target.value)} /></label>
      <button className="mc-menu-btn" type="submit">Visitar profundidade</button>
      <p>Atalho do Criativo: escava uma câmara local de 5×5×4. Use Salvar para guardar essas edições. Não gera nem escava milhões de blocos no caminho.</p>
      <div className="geology-shortcuts">{[100000, 500000, 1000000, 4000000, 6000000, EARTH_RADIUS].map(d => <button type="button" key={d} onClick={() => setDepth(String(d))}>{meters(d)} m</button>)}</div>
    </form> : <p>O atalho para visitar camadas está disponível apenas no Criativo. O subsolo também pode ser escavado normalmente.</p>}
    <p role="status">{status}</p>
  </details>;
}
