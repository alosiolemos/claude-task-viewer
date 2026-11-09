# 📝 Changelog

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
