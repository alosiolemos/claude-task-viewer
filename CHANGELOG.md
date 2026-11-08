# 📝 Changelog

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
