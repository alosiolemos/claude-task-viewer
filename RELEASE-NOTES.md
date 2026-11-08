# 🎉 Release Notes — v0.1.0-alpha

## O Que Há Nesta Release

### ✅ Funcionalidades Completas

- **Painel em Tempo Real:** Timeline de eventos do Claude Code em VS Code
- **.vsix Instalável:** 7.5 KB, pronto para instalar sem compilação
- **HTML5 Puro:** Sem React, sem dependências pesadas, sem webpack
- **Proteção XSS:** Renderização segura com `textContent` (não `innerHTML`)
- **Auto-Refresh:** Timeline atualiza a cada 2 segundos
- **Redação Automática:** Paths, tokens e campos sensíveis removidos
- **Demo vs Real:** Badges visuais (amarelo = teste, azul = capturado)
- **TypeScript:** Extension compilada com esbuild (5.4 KB)

### 📦 Pacote Inclui

```
painel-execucao-0.1.0-alpha.vsix
├─ extension.js (5.4 KB)       ← Backend VS Code
├─ webview/index.html (6.9 KB) ← Frontend HTML5
├─ icon.svg                    ← Ícone Activity Bar
├─ package.json                ← Manifesto VS Code
└─ LICENSE                     ← MIT License
```

### 🚀 Como Instalar

1. **Baixe:** `painel-execucao-0.1.0-alpha.vsix`
2. **Abra VS Code**
3. **Ctrl+Shift+X** → "..." → "Install from VSIX..."
4. **Selecione** o arquivo `.vsix`
5. **Clique** no ícone "Painel Execução" na Activity Bar

✅ Pronto! Timeline demo aparece automaticamente.

### 📋 Testar

```bash
# Clonar repositório
git clone https://github.com/alosiolemos/painel-execucao.git
cd painel-execucao

# Instalação local (com hot reload)
npm install
npm run ext:build
F5 → Extension Development Host

# Ver eventos demo
npm run collect:demo
npm run collect:read

# Capturar dados reais
# → Configure settings.local.json (vem pronto)
# → Reinicie Claude Code
# → Execute ação (Read, Bash, Grep, etc.)
# → Novo evento aparece com badge "REAL"
```

### 🔒 Segurança

- ✅ XSS protection (textContent rendering)
- ✅ Automatic redaction (paths, tokens, secrets)
- ✅ Local storage only (no cloud sync)
- ✅ No telemetry
- ✅ Open source for audit

### 📚 Documentação

- **[INSTALL.md](https://github.com/alosiolemos/painel-execucao/blob/main/INSTALL.md)** — Guia instalação
- **[README.md](https://github.com/alosiolemos/painel-execucao/blob/main/README.md)** — Visão geral
- **[USAGE.md](https://github.com/alosiolemos/painel-execucao/blob/main/USAGE.md)** — Uso detalhado

### 📊 Tech Stack

- **Extension:** TypeScript + VS Code API + esbuild
- **Frontend:** HTML5 + CSS + Vanilla JavaScript (puro)
- **Backend:** Node.js (collector.js)
- **Storage:** JSONL local (~/.painel-execucao/)

### 🐛 Conhecidos

- ✅ Todos os testes locais passando
- ✅ XSS removido
- ✅ Webview incluída no .vsix
- ✅ Auto-refresh funcionando

### ⏭️ Próximas Fases

- **Phase 2:** Grafo de dependências (React Flow)
- **Phase 3:** Comparison (diff entre execuções)
- **Phase 4:** Gemini IA (explicações, opcional)
- **Phase 5:** Themes customizáveis

### 🙏 Licença

MIT — Livre para uso pessoal e comercial

---

**Release Date:** 2026-11-07  
**Author:** [@alosiolemos](https://github.com/alosiolemos)  
**GitHub:** https://github.com/alosiolemos/painel-execucao
