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

## Verificar

```sh
npm run typecheck
npm run build
npx playwright install --with-deps chromium
npm test
npm audit
```

Para usar um Chromium já instalado: `CHROMIUM_PATH=/caminho/do/chromium npm test`.

Os 15 testes de navegador cobrem persistência/cancelamento, importação e exportação, dimensões inválidas, conversão legada, transparência, UVs e modelo slim, camadas, liberação de textura, migração, falha de armazenamento, proteção de saves, layout estreito e inicialização dos dois modos de jogo, além de importação/exportação de capas, persistência independente, recursos GPU e transições de animação. Não substituem um teste manual completo de gameplay.
