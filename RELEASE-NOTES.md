# 🎉 Release Notes

## [0.2.0] — 2026-11-08 (React Flow Canvas)

### 🎬 Principais Features

- **Canvas React Flow:** Workflow visual com 10+ etapas demo
- **WebviewPanel Amplo:** Painel ao lado do chat (não sidebar)
- **Inspetor Lateral:** Clique em nó → entrada/saída/erros/dependências
- **Pan/Zoom Nativo:** React Flow com fitView automático
- **Estados Coloridos:** ◯ Planejado • ▶ Executando • ✓ Concluído • ✕ Falhou
- **Arestas Dinâmicas:** Dependências explícitas + conexão anterior por padrão
- **Auto-Atualiza:** Polling a cada 2s via postMessage

### 📦 Pacote v0.2.0

```
painel-execucao-0.2.0.vsix (110 KB)
├─ extension.js (5.3 KB)                ← WebviewPanel + converter eventos
├─ webview/dist/
│  ├─ index.html (381 B)
│  ├─ assets/index-*.js (299.6 KB)      ← React Flow compilado
│  └─ assets/index-*.css (13.5 KB)      ← Estilos
├─ resources/icon.svg
└─ package.json
```

### ✅ Validações

- ✅ React Flow compilado com Vite (299KB JS)
- ✅ Canvas renderiza 11 etapas demo corretamente
- ✅ WebviewPanel abre em aba ampla (ao lado do chat)
- ✅ Inspector abre ao clicar em nó
- ✅ Auto-refresh a cada 2s
- ✅ Suporta eventos reais + fallback demo
- ✅ .vsix 110 KB instalável

### 🔄 Evolução

| Versão | Fase | Foco |
|--------|------|------|
| 0.1.x | Foundation | Timeline de eventos, XSS safe |
| **0.2.0** | **Canvas Workflow** | **Workflow visual, canvas horizontal** |
| 0.3.0 | React Flow | Canvas com pan/zoom completo |
| 0.4.0 | Comparison | Diff entre execuções |
| 0.5.0 | Gemini | Explicações IA (opt-in) |

---

## [0.1.1] — 2026-11-07 (Hotfix)

### 🐛 Correções

- Corrige CommonJS/ESM mismatch (extension agora usa import/export correto)
- Reduz tamanho .vsix para 6.9 KB

---

## [0.1.0-alpha] — 2026-11-07 (Foundation)

### ✨ Inicial

- Timeline de eventos do Claude Code
- Demo vs Real badges
- Redaction automática
- HTML5 puro

---

## Como Instalar v0.2.0

```
1. Extensions (Ctrl+Shift+X) 
2. "..." → "Install from VSIX"
3. Selecione: painel-execucao-0.2.0.vsix
4. Cmd+Shift+P → "Abrir Painel Execução"
   OU clique no ícone na Activity Bar
```

## Próximos

- React Flow canvas com pan/zoom
- Salvar posições de nós
- Comparison entre runs
- Gemini explanations (opt-in)

---

**Status:** Phase 2 (Canvas Foundation) entregue ✅  
**GitHub:** https://github.com/alosiolemos/painel-execucao  
**Licença:** MIT
