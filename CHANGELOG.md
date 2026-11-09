# 📝 Changelog

## [0.10.0] — 2026-11-09

- Cabeçalho mostra a origem da tarefa exibida: **Conversa** (nome registrado na transcrição, com prioridade para o nome dado pelo usuário; sem nome, "Conversa sem título") e **Projeto · ID**.
- Lista lateral reúne as tarefas já acompanhadas pelo painel em qualquer sessão, com busca e filtros por projeto (padrão: projeto atual; opção "Todos os projetos acompanhados") e conversa. Cada item mostra título, conversa, projeto, data e estado.
- Identidade estável sessão + tarefa, sem duplicatas. Metadados pequenos por transcrição no armazenamento global do VS Code; as associações existentes não mudam e as transcrições não são copiadas.
- Tarefas de outras sessões abrem em modo de consulta, somente leitura: não alteram a tarefa ativa nem as associações. Transcrição ausente preserva a identificação e informa que os detalhes estão indisponíveis.
- Novo ícone **Exportar tarefa**: revisão do conteúdo com opção de ocultar categorias e termos, escolha entre HTML (relatório autocontido, sem scripts) e JSON, e janela nativa do VS Code para salvar. Cancelar não cria arquivo. A exportação não chama o Gemini; inclui apenas explicações já geradas na janela atual, identificadas como IA.
- Exportação, correções após validação: valores de campos com nome de credencial (`password`, `apiKey`, `token`, `credentials.*`, `Authorization`…) são redigidos em objetos e em textos; ocultar entradas remove também descrição, arquivo e parâmetros da ação; resultados preservam espaços e quebras de linha exatamente como registrados.

## [0.9.4] — 2026-11-09

- Primeira abertura mantém pedido em andamento, ações e resposta na mesma tarefa, com título derivado do pedido.
- Apenas rodadas anteriores concluídas ficam no legado; não cria legado vazio para um pedido inicial.
- Reparo restrito da separação antiga entre pedido no legado e primeira tarefa sem título, preservando o ID e tarefas nomeadas manualmente.

- Limpeza de instaladores anteriores, demos e testes da interface antiga; testes atuais preservados.

## [0.9.3] — 2026-11-09

- Resumo completo com prazo de 90 segundos e thinkingBudget zero, preservando o limite de saída e uma chamada por clique.
- Validação das cinco seções com conteúdo antes de aceitar e armazenar o resumo como concluído.
- Etapas individuais mantêm o prazo anterior. Sem alterações no layout ou novos botões.

## [0.9.2] — 2026-11-09 (incluída na publicação 0.9.3)

- Três pontos animados durante a geração, respeitando movimento reduzido.
- Estado de geração separado do estado da tarefa: concluído, erro ou resposta incompleta.
- Resposta interrompida pelo provedor preservada e identificada; não entra no cache como sucesso e permite nova tentativa manual.
- Pedido de resumo mais conciso para evitar repetição extensa das instruções.

## [0.9.1] — 2026-11-09 (incluída na publicação 0.9.3)

- Resumo da tarefa distribuído em seções responsivas para aproveitar a largura do painel.
- Títulos reconhecidos mesmo com Markdown, numeração ou seções ausentes; listas, negrito e código exibidos como DOM seguro.
- Sem mudanças nas chamadas, na chave ou nos dados enviados ao Gemini.

## [0.9.0] — 2026-11-09 (incluída na publicação 0.9.3)

- Cabeçalho com título e identificador da tarefa à esquerda e quatro botões de ícone à direita.
- Resumo completo opcional com Gemini, restrito à tarefa selecionada, no painel inferior.
- Cinco seções para facilitar o aprendizado; aviso de resumo parcial, omissões e limites de envio.
- Consentimento específico para enviar pedidos e comentários públicos da tarefa, chave no SecretStorage e cache sem chamadas automáticas.
- UUID para novas tarefas, preservando IDs e associações existentes.

## [0.8.3] — 2026-11-09

### Corrigido
- Ícone de informação do Gemini alinhado ao canto superior direito, como o comentário do Claude.

### Publicação
- Apresentação visual, instalação sem terminal e guias de uso/desenvolvimento atualizados.
- Repositório apresentado como Claude Task Viewer; identidade interna da extensão preservada.

## [0.8.2] — 2026-11-09

- Lista de tarefas recolhível, colunas compactas e legendas em tooltips acessíveis.
- Comentário do Claude com identificação laranja e explicação Gemini com identificação azul.
- Abertura de seções preservada por etapa e nenhuma chamada à API ao expandir detalhes.

## [0.8.0–0.8.1] — 2026-11-09

- Arquivo, entrada e resultado em colunas com seções recolhíveis.
- Comentário público associado à mensagem da ação ou à rodada, sem blocos de raciocínio interno.
- Comentário incluído no contexto sanitizado da explicação Gemini.

## [0.7.0] — 2026-11-09

- Detalhes em painel inferior redimensionável.
- Gemini opcional por etapa, com chave pessoal no SecretStorage e envio explícito.

## [0.6.0] — 2026-11-09

- Leitura incremental direta das transcrições locais do Claude.
- Fluxo horizontal em HTML/CSS/JavaScript com conectores SVG.
- Tarefas com controle explícito de criação/continuação e histórico legado.
- Distribuição por VSIX pronto, sem build de React para o usuário.

---

As entradas abaixo descrevem versões antigas e podem mencionar arquitetura já substituída.

## [0.3.1] — 2026-11-08

- Corrige seleção que voltava para a primeira execução durante atualização.
- Exibe ações de teste e preserva eventos não associados, sem filtro exclusivo de auditoria.
- Remove demonstração automática e usa identificadores estáveis e deduplicação.
- Histórico local guarda preferências, sem copiar todos os eventos a cada atualização.
- Corrige build e pacote VSIX com versão real e assets completos.
- Validado com oito testes de conversão, teste de interface e janela isolada do VS Code.

## [0.1.1] — 2026-11-07 (Hotfix)

### 🐛 Correções

- **[CRITICAL]** Corrige CommonJS/ESM mismatch que impedia extensão de ativar
  - Problema: `extension/package.json` declarava `"type": "module"` mas esbuild gerava CommonJS
  - Resultado: VS Code rejeitava a extensão com "module.exports not found"
  - Solução: Configurar esbuild com `--format=esm` para gerar ES modules corretos
  - Verifica: `extension.js` agora começa com `import * as vscode` (ESM)

- **[IMPROVEMENT]** Reduz tamanho do .vsix
  - 0.1.0: 7.5 KB
  - 0.1.1: 6.9 KB (-9%, mais eficiente)

### ✅ Validações

- ✅ Webview incluída no .vsix (6.9 KB)
- ✅ extension.js ES module correto (3.7 KB)
- ✅ Auto-refresh funcionando (2s interval)
- ✅ XSS protection mantido (textContent)
- ✅ GitHub push bem-sucedido

### 🔄 Migrações

Nenhum (versão drop-in replacement)

---

## [0.1.0-alpha] — 2026-11-07 (Foundation)

### ✨ Features

- ✅ Painel em tempo real em VS Code
- ✅ Timeline de eventos do Claude Code
- ✅ Demo vs Real (badges visuais)
- ✅ Redação automática (paths, tokens)
- ✅ HTML5 puro (sem frameworks)
- ✅ Proteção contra XSS
- ✅ Auto-refresh (2s)
- ✅ TypeScript + esbuild

### 📦 Instaláveis

- painel-execucao-0.1.0-alpha.vsix (7.5 KB)

### 🐛 Problemas Conhecidos (Corrigidos em 0.1.1)

- ~~Extension ativa mas não renderiza (CommonJS/ESM conflict)~~

---

## Versões Futuras

- **0.2.0** — Grafo de dependências (React Flow)
- **0.3.0** — Comparison (diff entre execuções)
- **0.4.0** — Gemini IA (opcional)
- **0.5.0** — Themes customizáveis

---

## Como Reportar Bugs

Abra uma issue em: https://github.com/alosiolemos/painel-execucao/issues

Com:
- Versão do painel
- Versão do VS Code
- Erro exato (console log)
- Passos para reproduzir
