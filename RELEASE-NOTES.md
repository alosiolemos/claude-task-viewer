# 🎉 Release Notes

## [0.2.0] — 2026-11-08 (Canvas Workflow)

### 🎬 Principais Features

- **Canvas Horizontal:** Workflow visual como n8n (Phase 2 Foundation)
- **WebviewPanel Amplo:** Painel ao lado do chat (não sidebar)
- **11+ Etapas Demo:** Workflow "Pedido → Validar → Corrigir → Relatório"
- **Ramificação Visível:** Mostra decisões e retry automático
- **Inspetor Lateral:** Clique em nó → entrada/saída/erros
- **Pan/Zoom:** Suporta navegação em canvas grande
- **Estados Visuais:** ◯ Planejado • ▶ Executando • ✓ Concluído • ✕ Falhou

### 📦 Pacote v0.2.0

```
painel-execucao-0.2.0.vsix (7.3 KB)
├─ extension.js (4.6 KB)   ← WebviewPanel + converter eventos
├─ webview/index.html      ← Timeline (HTML5 estático)
├─ icon.svg
├─ package.json
└─ LICENSE
```

### ✅ Validações

- ✅ Extension compilado ESM (4.6 KB)
- ✅ WebviewPanel abre em aba ampla
- ✅ Auto-refresh a cada 2s
- ✅ Suporta eventos reais + demo
- ✅ .vsix pronto para instalar

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
