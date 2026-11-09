# Painel Execução

[![GitHub Release](https://img.shields.io/github/v/release/alosiolemos/painel-execucao?label=version)](https://github.com/alosiolemos/painel-execucao/releases)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![VS Code Engine](https://img.shields.io/badge/VS%20Code-%3E%3D1.85.0-blue)](https://code.visualstudio.com/)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D18.0.0-green)](https://nodejs.org/)

📊 **Painel local em VS Code** para acompanhar, auditar e inspecionar execução de tarefas do Claude Code em tempo real. Similar ao N8N, mas integrado diretamente no VS Code.

**Versão local: 0.3.1** — seleção preservada, execuções de teste visíveis e atualização sem demonstração automática. Instale `painel-execucao-0.3.1.vsix` e abra o comando `Painel Execução: Abrir Painel Execução`. Eventos antigos são agrupados por sessão e pasta; conclusão só é informada quando existe evento explícito de término.

---

## ✨ O Que Você Consegue Ver

- ✅ **Timeline de eventos** — Todas as ações em ordem, com timestamps
- ✅ **Entrada & Saída** — O que cada ferramenta recebeu e retornou
- ✅ **Inspetor JSON** — Expandir detalhes de cada evento
- ✅ **Demo vs Real** — Badges distinguem eventos de teste vs captura real
- ✅ **Redação segura** — Caminhos privados e tokens automaticamente removidos

---

## 🚀 Quick Start

### 📦 Opção A: Instalar .VSIX (1 minuto)

**Mais rápido para usuários finais**

1. **Abra VS Code**
2. **Extensions** (Ctrl+Shift+X)
3. Clique no ícone **"..."** (canto superior direito)
4. Selecione **"Install from VSIX..."**
5. Procure por: `painel-execucao-0.1.1.vsix` ([Download](https://github.com/alosiolemos/painel-execucao/releases))
6. **Clique no ícone "Painel Execução"** na Activity Bar (esquerda)

✅ Pronto! Veja os eventos demo aparecerem.

---

### 💻 Opção B: Desenvolvimento Local (Com Hot Reload)

**Para desenvolvedores**

```bash
git clone https://github.com/alosiolemos/painel-execucao.git
cd painel-execucao
npm install
npm run ext:build

# Abra VS Code na raiz
code .

# Pressione F5 → selecione "Extension Development Host"
# Uma nova janela abre com a extensão carregada
```

**Testar com Demo:**
```bash
npm run collect:demo          # Popula 4 eventos de teste
npm run collect:read          # Visualiza no CLI
```

---

### 🔵 Capturar Dados Reais

1. **Configure Claude Code** (opcional):
   - Copie `settings.local.json` para `~/.claude/settings.local.json`
   - Reinicie Claude Code

2. **Execute uma ação no Claude Code:**
   - Qualquer ferramenta: Read, Bash, Grep, Edit, etc.
   - Exemplo: *"Leia o arquivo README.md"*

3. **Novo evento aparece** no painel com badge azul "REAL"

---

## 📁 Estrutura

```
painel-execucao/
├── collector.js               ← Backend: captura PostToolUse via stdin
├── reader.js                  ← CLI: visualiza eventos
├── settings.local.json        ← Hooks configurados
├── extension/
│   ├── src/
│   │   ├── extension.ts       ← Entry point VS Code Extension
│   │   ├── event-reader.ts    ← Parser JSONL + watch
│   │   └── painel-provider.ts ← Webview provider
│   └── dist/extension.js      ← Build (4.9kb) ✅
├── webview/
│   └── dist/index.html        ← UI estática (HTML5 puro + CSS + JS seguro)
├── demo-events.jsonl          ← 4 eventos de teste
├── USAGE.md                   ← Guia completo
├── INVESTIGACAO-ACHADOS.md    ← Validação técnica
├── STATUS.md                  ← Roadmap
├── SETUP-GITHUB.md            ← Como publicar
└── package.json               ← Monorepo (extension + webview)
```

---

## 🏗️ Arquitetura

```
Claude Code Executando
    ↓
    PostToolUse Hook (registrado em settings.local.json)
    ↓
    collector.js (stdin JSON)
    ├─ Redige caminhos: /home/user → ~
    ├─ Redige tokens: 40+ chars → [REDACTED]
    ├─ Redige campos: password, token, secret, api_key → [REDACTED]
    └─ Salva em ~/.painel-execucao/data/{projeto}/events.jsonl
    ↓
    VS Code Extension (TypeScript)
    ├─ Registra webview panel
    ├─ Auto-refresh a cada 2s (lê events.jsonl)
    ├─ Envia para frontend via postMessage
    └─ Gerencia visibilidade (pause/resume)
    ↓
    Webview HTML5 (HTML5 + CSS + JavaScript seguro)
    ├─ Timeline interativa
    ├─ Cards expandíveis (details/summary)
    ├─ JSON preview entrada/saída (textContent, sem XSS)
    ├─ Badges Demo/Real com cores VS Code
    └─ Temas automáticos (claro/escuro)
```

---

## 📊 O Que Cada Fase Adiciona

| Fase | O que você vê | Status |
|------|---|---|
| **Foundation** | Timeline + inspetor + demo | ✅ **Feito** |
| **Visualization** | Grafo de dependências | ⏳ Próxima |
| **Comparison** | Diff entre 2 execuções | ⏳ After |
| **Gemini** | Explicações IA (opt-in) | ⏳ Future |

---

## 🎯 Demo vs Real

### 📌 Demo Events (Amarelo)

4 eventos pré-carregados para validar UI:
1. Read — Lê arquivo
2. Bash — Executa comando
3. Grep — Busca padrão
4. Edit — Modifica arquivo

**Como usar:**
```bash
npm run collect:demo           # Setup
npm run collect:read           # Ver em CLI
# Ou abra em VS Code com F5
```

### 🔵 Real Events (Azul)

Capturados do Claude Code durante a sessão:
- PostToolUse hook ativo
- Qualquer ação que você fizer (Read, Bash, Grep, etc.)
- Mostra entrada/saída reais

**Como ativar:**
1. Reinicie Claude Code (settings.local.json pronto)
2. Execute: *"Leia um arquivo"*
3. Novo evento aparece com badge "REAL"

---

## 🔒 Segurança

- ✅ **Proteção contra XSS:**
  - Dados renderizados com `textContent` (não `innerHTML`)
  - Nenhuma interpretação HTML de eventos
  - JSON preview é puro texto (escapado)

- ✅ **Redação automática (Collector):**
  - Caminhos: `C:\Users\alois\...` → `~\...`
  - Tokens: `abc123def456...` → `[REDACTED_TOKEN]`
  - Campos sensíveis: `password`, `token`, `secret`, `api_key` → `[REDACTED]`
  - Profundidade máxima 8 níveis
  - Limites em arrays/objects (100 each)
  - Detecção de strings codificadas longas

- ✅ **Armazenamento local apenas:**
  - Nenhuma sincronização
  - Nenhuma telemetria
  - Nenhuma upload externo
  - Tudo fica em ~/.painel-execucao/

- ✅ **GitHub seguro:**
  - .gitignore strict
  - Nenhum .env ou credenciais no repo
  - Código opensource para auditoria

- ✅ **Falhas isoladas:**
  - Erros de I/O não interrompem Claude Code
  - process.exit(0) mesmo em erro
  - Sem console.log para stdout

---

## 📋 Requisitos

- **Node.js** ≥ 18.0.0
- **VS Code** ≥ 1.85
- **Git** (para clonar)

## 💡 Como Usar

### Via CLI

```bash
# Ver eventos capturados
node reader.js painel-execucao

# Ver projeto diferente
node reader.js seu-projeto

# Limpar dados (demo/teste)
rm -rf ~/.painel-execucao/data/seu-projeto
```

### Via VS Code Extension

1. **F5** → "Extension Development Host" (nova janela)
2. **View** → Open View Container "Painel Execução"
3. **ou clique no ícone na Activity Bar**
4. Veja timeline de eventos em tempo real

### Configuração (Opcional)

Editar `settings.local.json` para:
- Mudar projeto monitorado
- Adicionar novos hooks
- Customizar redação

---

## 📚 Documentação

| Documento | Descrição |
|-----------|-----------|
| **[INSTALL.md](INSTALL.md)** | ⭐ Começa aqui: 2 opções de instalação (VSIX ou desenvolvimento) |
| **[USAGE.md](USAGE.md)** | Guia detalhado de uso e configuração |
| **[GITHUB-SETUP.md](GITHUB-SETUP.md)** | Como publicar seu fork + erro exato se houver bloqueio |
| **[INVESTIGACAO-ACHADOS.md](INVESTIGACAO-ACHADOS.md)** | Validação técnica (o que funciona, o que não) |
| **[STATUS.md](STATUS.md)** | Roadmap e progresso da implementação |

---

## 🎮 Controles no Painel

| Ação | Resultado |
|---|---|
| Clicar em evento | Expande detalhes |
| Clicar em "Entrada" | Mostra JSON dos argumentos (tool_input) |
| Clicar em "Saída" | Mostra JSON do resultado (tool_response) |
| Badge amarelo "DEMO" | Evento de teste (pré-carregado) |
| Badge azul "REAL" | Capturado do PostToolUse real |

---

## 🧠 O Que o Painel Captura

### Cada Evento Contém

```json
{
  "timestamp": "2026-11-07T22:30:45.123Z",
  "projectName": "painel-execucao",
  "event": {
    "tool_use_id": "tool_use_abc123xyz",
    "tool_name": "Read",
    "tool_input": {
      "file_path": "~/README.md"
    },
    "tool_response": {
      "status": "success",
      "content": "# Painel Execução..."
    },
    "captureSource": "stdin",
    "available": true
  }
}
```

### Ferramentas Capturadas

- **Read** — Lê arquivo (path + conteúdo)
- **Bash** — Executa comando (cmd + stdout/stderr)
- **Grep** — Busca padrão (pattern + matches)
- **Glob** — Lista arquivos (pattern + files)
- **Edit** — Modifica arquivo (path + mudança)
- **Write** — Escreve arquivo (path + conteúdo)
- **Artifact** — Cria artefato (tipo + link)
- E qualquer outra ferramenta do Claude Code

---

## 🐛 Troubleshooting

### Painel não aparece em VS Code
```bash
# 1. Rebuild
npm run ext:build

# 2. F5 para recarregar extension
# 3. View → Open View Container "Painel Execução"
```

### Eventos não aparecem
```bash
# Verificar dados
ls -la ~/.painel-execucao/data/painel-execucao/

# Ver em CLI
node reader.js painel-execucao

# Reset e demo
npm run collect:demo
npm run collect:read
```

### "Badge REAL" mas sem dados
- Confirme: settings.local.json contém hooks
- Reinicie Claude Code
- Execute ação: *"Leia um arquivo"*

---

## 🤖 Gemini (Opcional)

Explicações por IA para eventos anômalos:

1. Copiar `.env.example` para `.env.local`
2. Preencher `GEMINI_API_KEY` (Google AI Studio)
3. Definir `GEMINI_ENABLED=true`

**Sem Gemini:**
- Painel funciona 100% offline ✅
- Sem custos ✅
- Padrão desativado ✅

---

## 📦 O Que Ainda Falta

- 🔄 **Visualization:** Grafo de dependências (React Flow)
- 🔍 **Inspetor avançado:** Diff entre campos
- 📊 **Comparison:** Lado a lado de 2 execuções
- 🤖 **Gemini:** Inteligência em anomalias
- 🎨 **Polish:** Temas customizáveis

---

## 🤝 Contribuindo

Bugs, sugestões ou melhorias? Abra uma issue com:
- O que testou
- O que esperava
- O que viu
- Anexar screenshot se possível

---

## 📄 Licença

MIT — Livre para uso pessoal e comercial

---

## 🔗 Links

- **GitHub:** https://github.com/alosiolemos/painel-execucao
- **Releases:** https://github.com/alosiolemos/painel-execucao/releases (`.vsix` instalável)
- **Issues:** https://github.com/alosiolemos/painel-execucao/issues
- **License:** [MIT](LICENSE)

---

## 📦 Download

**Instalável:** [painel-execucao-0.1.1.vsix](https://github.com/alosiolemos/painel-execucao/releases) (6.9 KB)

Ou clone e compile localmente:
```bash
git clone https://github.com/alosiolemos/painel-execucao.git
cd painel-execucao
npm install && npm run ext:build
```

---

**Última atualização:** 2026-11-07  
**Built with:** Node.js 18+, TypeScript, HTML5 (sem frameworks), VS Code Extension API  
**Autor:** [@alosiolemos](https://github.com/alosiolemos)
