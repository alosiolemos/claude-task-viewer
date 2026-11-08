# Como Usar — Painel Execução

## 🎯 O que é

Painel local em VS Code que mostra e audita a execução de tarefas do Claude Code em tempo real. Captura entrada, saída e metadados de cada ação.

## ✅ O que Funciona Agora

- ✅ **Captura de eventos:** PostToolUse hook do Claude Code
- ✅ **Dados capturados:** tool_use_id, tool_name, tool_input, tool_response
- ✅ **Redação segura:** Caminhos privados e tokens removidos
- ✅ **Isolamento:** Falhas não interrompem Claude Code
- ✅ **VS Code Extension:** Painel funcional com demo
- ✅ **Timeline:** Visualiza eventos em ordem

## 🔨 Instalação & Testes

### Pré-requisitos
- Node.js ≥ 18
- VS Code ≥ 1.85
- Git

### Setup Local

```bash
cd painel-execucao
npm install                    # Install all workspaces
npm run ext:build              # Build extension → dist/extension.js
npm run collect:demo           # Populate demo data
```

### Testar Extension em VS Code

```bash
# No VS Code: F5 para abrir "Extension Development Host"
# Isso abre uma nova janela VS Code com a extensão carregada

# Ativar o painel:
# View → Open View Container "Painel Execução"
# ou clique no ícone na Activity Bar
```

### Ver Dados Demo

```bash
# Terminal
bash scripts/setup-demo.sh      # Copy demo events to ~/.painel-execucao
node reader.js demo            # View in CLI
```

---

## 📊 Etapas & Dados

### Demo Events (Pré-configurados)

4 eventos de teste que demonstram o painel:

```
1. Read file         (entrada: file_path, saída: conteúdo)
2. Bash command      (entrada: comando, saída: stdout)
3. Grep search       (entrada: padrão, saída: matches)
4. Edit file         (entrada: path + alteração, saída: confirmação)
```

**Como identificar:**
- Badge "DEMO" (amarelo) = Evento simulado
- Badge "REAL" (azul) = Capturado do PostToolUse real

### Dados Reais (Quando Ativado)

Para capturar eventos REAIS do Claude Code:

1. **Ativar o hook PostToolUse:**
   ```bash
   # settings.local.json já está configurado
   # Reinicie VS Code
   ```

2. **Executar uma ação no Claude Code:**
   ```
   "Leia o arquivo README.md"
   ```

3. **Ver no painel:**
   - Novo evento aparecerá com badge "REAL"
   - Contém tool_input (argumentos) e tool_response (resultado)

---

## 🏗️ Arquitetura

```
Painel Execução
├── Backend (collector.js)
│   ├── Recebe PostToolUse via stdin
│   ├── Redige dados sensíveis
│   └── Salva em ~/.painel-execucao/data/{projeto}/events.jsonl
│
├── Extension (TypeScript/VS Code API)
│   ├── Registra webview panel
│   ├── Lê events.jsonl
│   └── Comunica com frontend
│
└── Frontend (HTML + JavaScript puro)
    ├── Timeline interativa
    ├── Cards expandíveis
    └── JSON preview de entrada/saída
```

## 🔒 Segurança

- ✅ **Redação automática:** Caminhos (`/home/user` → `~`), tokens (40+ chars → `[REDACTED]`)
- ✅ **Campos sensíveis:** password, token, secret, api_key, etc. → `[REDACTED]`
- ✅ **Proteção de profundidade:** Máximo 8 níveis em objetos
- ✅ **Armazenamento local:** Nenhuma sincronização ou telemetria
- ✅ **GitHub seguro:** .gitignore strict, nenhum .env em repo

## 📁 Estrutura de Dados

### Evento Capturado

```json
{
  "timestamp": "2026-11-07T10:30:45.123Z",
  "projectName": "painel-execucao",
  "captureVersion": "1.0",
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

## 🎮 Controles

| Ação | Resultado |
|---|---|
| Clicar em evento | Expande detalhes |
| Clicar em "Entrada" | Mostra JSON dos argumentos |
| Clicar em "Saída" | Mostra JSON do resultado |
| Badge "DEMO" | Evento de teste |
| Badge "REAL" | Capturado do PostToolUse |

## ⚙️ Configuração

### Ativar Captura Real

1. **settings.local.json** já configurado com:
   ```json
   {
     "hooks": {
       "SessionStart": [...],
       "PostToolUse": [...]
     }
   }
   ```

2. **Reinicie Claude Code** para carregar hooks

3. **Projeto isolado automaticamente** pelo cwd (última parte do path)

### Escolher Projeto

Por padrão: `"painel-execucao"`

Para mudar:
```bash
export CLAUDE_CODE_PROJECT=seu-projeto
```

## 🚀 Próximos Passos

- [ ] **Visualization:** Grafo de nós (que ferramentas chamam outras)
- [ ] **Comparison:** Comparar 2 execuções lado a lado
- [ ] **Gemini:** Explicações de eventos (opcional, desativado)
- [ ] **GitHub Actions:** CI/CD para build automático

## 🐛 Troubleshooting

### Painel não aparece
- F5 em VS Code para recarregar extensão
- View → Open View Container "Painel Execução"
- Reinicie VS Code

### Eventos não aparecem
- Verifique: `ls ~/.painel-execucao/data/{projeto}/events.jsonl`
- Execute: `node reader.js {projeto}` para validar dados
- Confirme: settings.local.json contém hooks

### Eventos aparecem mas sem dados
- Badge "DEMO" = dados de teste (esperado)
- Badge "REAL" = aguardando PostToolUse real
- Execute ação no Claude Code: "Leia arquivo xyz"

## 📞 Suporte

Consulte:
- `README.md` — Arquitetura geral
- `INVESTIGACAO-ACHADOS.md` — Validação técnica
- `STATUS.md` — Roadmap desenvolvimento
- `collector.js` — Lógica de captura
- `extension/src/` — Código da extensão

---

**Status:** Foundation completa, pronto para testes. 🎉
