# VoxelCraft

Jogo voxel com React, Three.js e TypeScript. Os modos Survival e Creative, geração de mundo, inventário, crafting, criaturas, ciclo de dia/noite e salvamento local existentes foram mantidos.

## Executar

```sh
npm ci
npm run dev
```

O servidor escuta em `0.0.0.0:5173`. Para produção: `npm run build`.

## Skins

No menu, abra **Skins — Personalizar personagem**:

- Importe PNG Java de **64×64** ou legado **64×32**, até 1 MB. Arquivos inválidos são recusados antes de substituir a seleção.
- Skins antigas são convertidas para 64×64, com espelhamento por face dos membros esquerdos. A camada de chapéu inteiramente opaca de arquivos antigos é descartada, seguindo a convenção legada.
- Escolha **Clássico** (braços de 4 pixels) ou **Slim** (3 pixels). O PNG não contém metadados confiáveis para determinar o modelo; arquivos legados usam Clássico ao importar.
- Ative/desative chapéu, jaqueta, mangas e pernas da camada externa independentemente. Camadas acompanham as animações dos membros; a camada base é opaca.
- Arraste a prévia para girar; use a roda para zoom. É possível pausar a caminhada.
- **Salvar e usar** persiste a skin, o modelo e as camadas. Cancelar/Escape descarta o rascunho. A skin aparece no personagem em terceira pessoa (F5).
- **Exportar PNG** baixa a textura importada normalizada, sem remover as camadas ocultadas na configuração. **Restaurar padrão** também precisa ser confirmado com Salvar.
- A skin armazenada pela versão anterior é lida automaticamente. Configurar skins não altera o mundo salvo.

O armazenamento é local por navegador/origem, sem envio da imagem para servidores. Se estiver cheio ou bloqueado, a interface informa o erro e mantém o vestiário aberto. Antes de criar um novo mundo, agora há uma confirmação para proteger o save existente.

## Capas e animações

A seção **04 / Capa** do vestiário oferece **Brasa**, **Floresta** e **Estelar** (desenhos próprios), além de **Sem capa** e uma textura personalizada. Use **Frente / costas** para conferir. A orientação e o zoom da prévia são preservados ao editar a skin ou a capa.

- Importação de PNG **64×32**, até 1 MB, no atlas de capa Java (cuboide de 10×16×1 pixels). Uma imagem de skin não substitui o atlas de capa.
- Exportação da capa selecionada; **Remover capa importada** elimina o arquivo do rascunho. Salve para confirmar. Escolher **Sem capa** oculta sem apagar o arquivo personalizado.
- Capa e skin têm configurações independentes; restaurar a skin padrão não remove a capa. Perfis antigos abrem sem capa. Cancelar/Escape não altera os dados salvos.
- A capa fica presa ao tronco, com balanço amortecido e inclinação de acordo com velocidade, estado no ar e agachamento. É um acessório cosmético em terceira pessoa, não uma elytra, simulação de tecido ou item de voo.
- O personagem tem transições suaves, balanço dos braços em repouso, passada proporcional à velocidade, poses de salto/voo/agachamento e golpe suavizado. A prévia permite testar caminhada, corrida, agachamento, pose no ar e voo; desmarque **Animar personagem** para voltar ao repouso.
- As **seis camadas externas** continuam disponíveis e acompanham as animações. Desligar a jaqueta não desliga a capa.

### Limites desta etapa

Compatibilidade com o formato de skins não significa paridade completa com Minecraft. Não foram implementados serviços de contas Mojang/Microsoft, sincronização online, Marketplace/skins geométricas Bedrock, capas oficiais vinculadas a contas, editor de pintura, texturas HD ou todas as mecânicas do Minecraft. O item em primeira pessoa mantém o comportamento anterior; a personalização é aplicada ao modelo do personagem. A skin padrão continua sendo o fallback procedural existente ou `/textures/skin.png`, caso fornecido.

## Desempenho, gravidade e água

No menu, selecione **Qualidade gráfica** antes de entrar no mundo. A configuração fica salva separadamente do mundo e das skins:

| Perfil | Raio de chunks | Limite de resolução (DPR) | Sombras | Antialiasing |
| --- | --- | --- | --- | --- |
| Leve | 3 | 1 | Desativadas | Não |
| Equilibrada (padrão) | 4 | 1,25 | 1024² | Não |
| Alta | 5 | 2 | 2048² | Sim |

O modo Alta mantém o alcance e os parâmetros visuais anteriores. O streaming processa no máximo uma geração e uma malha por atualização, com orçamento **flexível** de 5 ms: uma operação individual não é interrompida e pode ultrapassá-lo. O mundo distante aparece gradualmente. Quando está estável, não há nova varredura completa de chunks a cada frame. Edições acordam a fila; os blocos editados continuam salvos quando os chunks são descarregados.

- Física do jogador em passos fixos de **120 Hz**, limitada a 12 passos por frame, para estabilidade em taxas de renderização diferentes. Atrasos maiores que 100 ms não são recuperados integralmente, evitando uma espiral de trabalho.
- Colisões segmentadas impedem atravessar paredes/pisos finos em quedas rápidas ou voo. Limites de terreno ainda não carregado bloqueiam a passagem temporariamente, em vez de deixar o jogador cair no vazio.
- Câmera faz transição suave ao agachar; pausar não apaga o estado de contato com o chão.
- Na água, segure **Espaço para subir** e **Shift para mergulhar**. Há resistência vertical, afundamento lento e movimento horizontal reduzido. Entrar na água zera a distância de queda.
- Cabeça submersa consome **15 segundos de fôlego** no Survival. Depois, causa 2 pontos de dano por segundo; respirar recupera o fôlego. Creative não sofre afogamento. Saves antigos continuam válidos; novos saves incluem o fôlego.
- Névoa subaquática e indicador de fôlego; a superfície da água também é visível por baixo.
- O contador de FPS usa o tempo real entre frames. A aba oculta deixa de executar a atualização/renderização do jogo.

**Limites:** a água ainda usa blocos estáticos. Esta etapa não implementa propagação de líquidos, correntes, ondas físicas ou gravidade de areia/cascalho. O orçamento de chunks não é uma garantia de FPS, e a geração inicial de 3×3 chunks ainda é síncrona.

### Medição reproduzível de CPU

Com `npm run dev` aberto, execute `node scripts/benchmark-world.mjs` (aceita `CHROMIUM_PATH`). O cenário usa seed 12345, raio 5, 169 chunks de dados e 121 chunks com malha, sem renderização GPU. Em uma execução no ambiente de desenvolvimento:

| Métrica | Antes | Depois |
| --- | ---: | ---: |
| Maior atualização de streaming | 52 ms | 7,7 ms |
| Percentil 95 das atualizações acima de 0,1 ms | 38,6 ms | 5,9 ms |
| CPU acumulada em 400 atualizações | 756 ms | 609,4 ms |
| 10.000 atualizações com mundo estável | 78,9 ms | 1 ms |

É uma amostra local, **não um benchmark de FPS** nem promessa de desempenho em outro computador. O ganho principal é distribuir trabalho entre frames. Também foi comparada a geometria antes/depois em quatro chunks gerados: posições, normais, UVs, tiles e índices permaneceram idênticos.

## Verificar

```sh
npm run typecheck
npm run build
npx playwright install --with-deps chromium
npm test
npm audit
```

Para usar um Chromium já instalado: `CHROMIUM_PATH=/caminho/do/chromium npm test`.

Os 23 testes de navegador cobrem persistência/cancelamento, importação e exportação, dimensões inválidas, conversão legada, transparência, UVs e modelo slim, camadas, liberação de textura, migração, falha de armazenamento, proteção de saves, layout estreito e inicialização dos dois modos de jogo, além de importação/exportação de capas, persistência independente, recursos GPU e transições de animação. Também cobrem física a 30/60/144 FPS, quedas rápidas, colisões, natação, fôlego, streaming, persistência das edições, perfis gráficos e compatibilidade dos saves. Não substituem um teste manual completo de gameplay.
