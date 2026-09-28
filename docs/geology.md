# Terra profunda — gerador v3

## Escala e referência

O usuário escolheu **6.371.000 blocos (6.371 km)**, com **1 bloco = 1 metro**. Esse é o raio médio usado pelo modelo, não a distância exata até o centro em todo ponto de uma Terra real irregular. O raio médio de 6.371 km e a distinção entre crosta oceânica/continental são descritos pela UCL. [4](https://www.ucl.ac.uk/seismin/explore/Earth.html)

A profundidade usa o **topo da água** como referência: `GEO_SEA_Y = 27`. O identificador antigo `SEA_LEVEL = 26` é a coordenada do último bloco de água, cujo topo está em 27. Assim:

- Plano superior da bedrock: `27 − 6.371.000 = −6.370.973`.
- Primeiro bloco indestrutível: `y = −6.370.974`, abaixo desse plano.
- O HUD mede a profundidade dos pés do jogador. Acima do nível do mar, indica zero; a coordenada Y continua no HUD.
- O terreno não precisa estar na mesma altitude do mar. A profundidade a partir de uma montanha será maior que a referência marítima.

**A bedrock final é uma barreira artificial do jogo**, não uma camada de rocha natural no centro da Terra.

## Camadas adotadas

A tabela é um **perfil de referência aproximado**, não um levantamento geológico real de cada coordenada. As principais fronteiras do manto e núcleo são baseadas nas descrições da UCL e do material didático de geologia de Maricopa. [4](https://www.ucl.ac.uk/seismin/explore/Earth.html) [2](https://open.maricopa.edu/physicalgeologymaricopa/chapter/2-1-the-earth-inside-and-out/)

| Camada representada | Faixa de profundidade abaixo do mar | Espessura no modelo |
|---|---:|---:|
| Crosta oceânica | 0 até o Moho local | 5.000–10.000 m |
| Crosta continental | 0 até o Moho local | 30.000–70.000 m |
| Manto superior, antes da transição | Moho local–410.000 m | Depende da crosta local |
| Transição, predominância ilustrativa de wadsleyita | 410.000–520.000 m | 110.000 m |
| Transição, predominância ilustrativa de ringwoodita | 520.000–660.000 m | 140.000 m |
| Manto inferior, acima de D″ | 660.000–2.700.000 m | 2.040.000 m |
| D″, faixa de referência simplificada | 2.700.000–2.900.000 m | 200.000 m |
| Núcleo externo, líquido | 2.900.000–5.150.000 m | 2.250.000 m |
| Núcleo interno, sólido | 5.150.000–6.371.000 m | 1.221.000 m |

A transição wadsleyita–ringwoodita é associada à descontinuidade de aproximadamente 520 km; sua posição e largura variam com composição, água e outras condições. [1](https://link.springer.com/article/10.1007/s00410-015-1163-2)

O manto superior inclui a zona de transição em classificações usuais; o painel a separa para mostrar suas subdivisões. Analogamente, D″ é parte do manto inferior, não uma camada extra somada por cima dele. A crosta oceânica e a continental são **alternativas**, não duas camadas empilhadas. No modelo, o ruído continental da seed escolhe o tipo e sua espessura local. O Moho é modelado relativo ao nível do mar; não é uma reconstrução sísmica, nem corrige em detalhe o datum para cada relevo/substrato.

A litosfera e a astenosfera são divisões **mecânicas**, sobrepostas à classificação química/mineralógica. O HUD usa referências ilustrativas de 70 km para a litosfera oceânica e 100 km para a continental; abaixo disso identifica a astenosfera até o início da transição. **Não são espessuras universais.** Solo e sedimentos também não têm espessura universal; a superfície mantém seu modelo procedural, não um mapa real de horizontes pedológicos.

O manto permanece sólido (com comportamento dúctil em escala geológica), e não é um oceano de lava. O núcleo externo é líquido e o interno sólido. [2](https://open.maricopa.edu/physicalgeologymaricopa/chapter/2-1-the-earth-inside-and-out/) Os materiais de bloco — granito, basalto, gabro, gnaisse, peridotito, minerais de alta pressão e ferro-níquel — são **representações simplificadas**, não composições puras de camadas reais. As cores são ilustrativas.

## Como explorar

1. Crie um **mundo novo**, no gerador v3. Saves v1 e v2 mantêm a profundidade e o terreno anteriores.
2. Em **Creative**, entre no jogo, pressione **Esc** e abra **Camadas da Terra**.
3. Digite a profundidade em metros (0–6.371.000) ou escolha um atalho. Clique em **Visitar profundidade**.
4. O jogo cria uma câmara local de observação de 5×5×4, mantém a bedrock intacta e ativa o voo. **Continuar** retorna ao jogo.
5. Use **Salvar** para persistir posição, seed, versão e as edições da câmara.

No Survival, o painel pode ser consultado, mas o teleporte é proibido. A mineração normal também funciona em Y negativo; os novos materiais entram no inventário. A escala não é comprimida: percorrer milhões de metros normalmente levaria muito tempo.

## Implementação e limites técnicos

- `DeepWorld.ts`: seções locais de **16×16×16**, 4.096 bytes por seção de blocos; geração implícita de tudo que não foi editado, sem armazenar o planeta inteiro.
- Janela de trabalho horizontal conforme a qualidade gráfica, com até sete níveis verticais de seções. Uma seção é processada por atualização; a área imediata de entrada é síncrona.
- Cache superficial limitado para reutilizar o relevo/oceanos v2 e não refazer cavernas/árvores a cada seção. As seções homogêneas profundas dispensam esse cache e o ruído de cavernas.
- Edições esparsas por chave **x,y,z** de seção; índices locais não negativos, incluindo em coordenadas globais negativas. Faces nas bordas verticais/horizontais são invalidadas ao editar.
- Malhas com vértices locais pequenos; origem de renderização vertical deslocada temporariamente perto da câmera. Coordenadas de física, seleção, HUD e save continuam em metros reais, usando precisão dupla.
- Colisão, voo, raycast, drops, tochas, leitura/salvamento e retorno à superfície aceitam Y negativo. Não há mais morte automática abaixo de Y −40 nos mundos v3.
- Bedrock na fronteira é protegida contra mineração/alteração, inclusive pelo atalho do Criativo.
- O núcleo externo é um fluido estático com arrasto simplificado, não uma simulação de convecção, densidade ou magnetismo. Não gera faces entre blocos internos do mesmo líquido.
- Gravidade, iluminação ambiente, velocidade, resistência de mineração e movimentação continuam sendo regras de jogo. **Não** há simulação realista de pressão, temperatura, gravidade radial, tempo geológico, sismicidade ou formato esférico. A geometria é uma coluna vertical procedural plana.
- O limite de armazenamento do navegador continua existindo para edições. Falhas de salvamento são informadas pela interface existente; o tamanho do planeta não implica que milhões de alterações caibam no localStorage.

## Verificações

`tests/geology.spec.ts` cobre limites e somas de espessuras, tipos de crosta, estados sólido/líquido, ausência de alocação proporcional à profundidade, streaming vertical, edição/tochas e recarga, culling do líquido, precisão/restituição de transformações de renderização, colisão/raycast na bedrock, sobrevivência abaixo do antigo limite, saves profundos/legados e o fluxo real do painel no Criativo.

No teste com raio horizontal 2, o cache fica em até 175 seções e menos de 1 MiB de **buffers de voxels** tanto a 100 km quanto a 6.000 km. Isso não é o consumo total do navegador: JS, materiais, texturas, caches de perfis e malhas têm custos adicionais. Os testes não substituem uma sessão extensa de gameplay em diferentes GPUs.
