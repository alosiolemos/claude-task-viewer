> Registro histórico de versões anteriores. Para a instalação e arquitetura atuais, consulte o [README](README.md) e o [guia de uso](docs/como-usar.md).

# 🎉 Release Notes

## [0.2.2] — 2026-11-08 (Histórico + Labels)

### ✨ Novo

- **Histórico recolhível:** Sidebar à esquerda com lista de execuções
- **Múltiplas execuções:** Nova execução com canvas vazio, preserva anteriores
- **Labels descritivos:** "Ler README.md", "Criar resultado.json", "Validar resultado"
- **Layout melhorado:** Histórico (esquerda) + Canvas + Inspector (direita)

### 🎬 Como Usar

1. **Instalar:** Extensions → Install from VSIX → `painel-execucao-0.2.1.vsix`
2. **Abrir:** Cmd+Shift+P → "Abrir Painel Execução"
3. **Usar:**
   - Execute ações no Claude Code (Read, Write, etc.)
   - Painel captura automaticamente
   - Canvas renderiza com labels descritivos
   - Clique em nó → Inspector mostra entrada/saída
   - Histórico lista todas as execuções (timestamp + badge)

---

## [0.2.1] — 2026-11-08 (Comportamento Corrigido)

### 🔧 Correções Comportamentais

- **Preserve Posições:** Nós mantêm posição entre updates (localStorage)
- **Estabilize Execução:** executionId idêntico por sessão (não recria a cada refresh)
- **VSCode API:** acquireVsCodeApi() inicializado corretamente
- **Sem Dados Fictícios:** Não cria dependências automáticas nem marca sucesso genérico
- **Fallback Demo:** Mostra demo claramente identificada quando sem eventos reais
- **Agrupa Corretamente:** Ações por ferramenta (Read, Bash, etc), não por evento

### 📦 Pacote v0.2.1

```
painel-execucao-0.2.1.vsix (110 KB)
```

---

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
