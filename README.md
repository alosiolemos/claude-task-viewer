# Painel Execução

📊 **Painel local em VS Code** para acompanhar, auditar e inspecionar execução de tarefas do Claude Code em tempo real. Similar ao N8N, mas integrado diretamente no VS Code.

**Status:** ✅ **Foundation Completa** — Painel funcional, Backend validado, Extension buildada

---

## ✨ O Que Você Consegue Ver

- ✅ **Timeline de eventos** — Todas as ações em ordem, com timestamps
- ✅ **Entrada & Saída** — O que cada ferramenta recebeu e retornou
- ✅ **Inspetor JSON** — Expandir detalhes de cada evento
- ✅ **Demo vs Real** — Badges distinguem eventos de teste vs captura real
- ✅ **Redação segura** — Caminhos privados e tokens automaticamente removidos

---

## 🚀 Quick Start

### 1️⃣ Instalar

```bash
git clone https://github.com/alosiolemos/painel-execucao.git
cd painel-execucao
npm install
npm run ext:build
```

### 2️⃣ Testar Com Demo

```bash
npm run collect:demo          # Popula 4 eventos de teste
npm run collect:read          # Visualiza no CLI
# ou abra em VS Code: F5 → Extension Development Host
```

### 3️⃣ Usar Com Dados Reais

1. Reinicie Claude Code (settings.local.json já tem hooks)
2. Execute ação no Claude Code: *"Leia o arquivo README.md"*
3. Novo evento aparece no painel com badge "REAL"

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
│   ├── dist/index.html        ← UI estática (HTML5 puro)
│   └── src/
│       ├── App.tsx            ← React component (timeline)
│       └── index.tsx          ← Entry React
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
    ├─ Lê events.jsonl
    └─ Envia para frontend
    ↓
    Webview HTML5 (JavaScript puro)
    ├─ Timeline interativa
    ├─ Cards expandíveis
    ├─ JSON preview entrada/saída
    └─ Badges Demo/Real
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

- ✅ **Redação automática:**
  - Caminhos: `C:\Users\alois\...` → `~\...`
  - Tokens: `abc123def456...` → `[REDACTED_TOKEN]`
  - Campos sensíveis: `password`, `token`, `secret`, `api_key` → `[REDACTED]`

- ✅ **Proteção contra edge cases:**
  - Profundidade máxima 8 níveis
  - Limites em arrays/objects (100 each)
  - Detecção de strings codificadas longas

- ✅ **Armazenamento local:**
  - Nenhuma sincronização
  - Nenhuma telemetria
  - Tudo fica em ~/.painel-execucao/

- ✅ **GitHub seguro:**
  - .gitignore strict
  - Nenhum .env ou credenciais no repo

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

## 🔗 Documentação Completa

- **[USAGE.md](USAGE.md)** — Guia detalhado de uso
- **[INVESTIGACAO-ACHADOS.md](INVESTIGACAO-ACHADOS.md)** — Validação técnica (o que funciona, o que não)
- **[STATUS.md](STATUS.md)** — Roadmap e progresso
- **[SETUP-GITHUB.md](SETUP-GITHUB.md)** — Como publicar seu fork

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
- **Issues:** https://github.com/alosiolemos/painel-execucao/issues
- **Releases:** https://github.com/alosiolemos/painel-execucao/releases

---

**Última atualização:** 2026-11-07  
**Built with:** Node.js, TypeScript, React, VS Code Extension API
