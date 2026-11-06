# Teste PostToolUse Real — Com Entrada/Saída

Este guia valida a captura de eventos com **entrada e saída reais** usando o hook `PostToolUse`.

## O que será capturado

`PostToolUse` é acionado **após** uma ferramenta executar, com:
- ✅ `tool_use_id` — Identificador único da chamada
- ✅ `tool_input` — O que foi passado para a ferramenta (argumentos)
- ✅ `tool_response` — Resposta/resultado da ferramenta
- ✅ Timestamp — Quando ocorreu

## Como Testar

### Passo 1: Ativar Hook PostToolUse

Este hook capturará **eventos reais** do Claude Code nesta sessão.

Instrua o Claude a executar este comando no terminal do Claude Code:

```bash
# Ativar hook PostToolUse (addicionar ao settings.json)
# Para agora: apenas copie para validar

cp "C:\Users\alois\.claude\painel-execucao-posttooluse-hooks.json" "C:\Users\alois\.claude\painel-execucao-hooks.json"
```

Ou, edite manualmente `~/.claude/settings.json` (se souber) para incluir:

```json
{
  "hooksPath": "~/.claude/painel-execucao-posttooluse-hooks.json"
}
```

**Importante:** Depois de adicionar, **reinicie o Claude Code**.

### Passo 2: Executar Ações Reais DENTRO DESTA SESSÃO

No Claude Code (nesta conversa), execute:

1. **Ler um arquivo:**
   ```
   Peça ao Claude para usar Read tool: "Leia o arquivo TESTE-CAPTURA.md"
   ```

2. **Buscar padrão:**
   ```
   Peça ao Claude para usar Grep: "Procure por 'PostToolUse' no projeto"
   ```

3. **Listar arquivos:**
   ```
   Peça ao Claude para usar Glob: "Liste todos os arquivos .md"
   ```

4. **Executar comando:**
   ```
   Peça ao Claude para usar Bash: "Conte linhas de código: find . -name '*.js' | wc -l"
   ```

Cada ação vai disparar o hook `PostToolUse` e registrar entrada + saída.

### Passo 3: Visualizar Eventos Capturados

Abra um terminal e execute:

```bash
cd "C:\Users\alois\OneDrive\Documentos\Projetos\estudos\painel-execucao"

# Ver eventos capturados (incluindo entrada/saída)
node reader.js painel-execucao
```

### Esperado

```
📊 Painel Execução — Leitor de Eventos

📂 Projeto: painel-execucao
📁 Diretório: C:\Users\alois\.painel-execucao\data\painel-execucao

✅ Status do Coletor:
   Habilitado: true
   Última verificação: 2026-11-06T22:00:00.000Z
   PID: 12345

📋 Eventos capturados: 5

[1] 2026-11-06T22:00:00.000Z
    Tipo: tool
    Ferramenta: Read
    Tool ID: tool_use_abc123xyz
    Status: result
    ✅ Entrada disponível
    ✅ Saída disponível
    Captura: stdin (PostToolUse)

[2] 2026-11-06T22:00:05.000Z
    Tipo: tool
    Ferramenta: Bash
    Tool ID: tool_use_def456uvw
    Status: result
    ✅ Entrada disponível
    ✅ Saída disponível
    Captura: stdin (PostToolUse)
```

## Validação: O que Procurar

Após executar a ação, analise:

### ✅ Se Capturou Corretamente

```bash
cat ~/.painel-execucao/data/painel-execucao/events.jsonl | tail -1 | node -e "console.log(JSON.stringify(JSON.parse(require('fs').readFileSync(0, 'utf8')), null, 2))"
```

Você deve ver algo como:

```json
{
  "timestamp": "2026-11-06T22:00:05.000Z",
  "projectName": "painel-execucao",
  "captureVersion": "1.0",
  "event": {
    "captureSource": "stdin",
    "available": true,
    "tool_use_id": "tool_use_abc123xyz",
    "tool_name": "Read",
    "tool_input": {
      "file_path": "~/OneDrive/Documentos/Projetos/estudos/painel-execucao/TESTE-CAPTURA.md"
    },
    "tool_response": {
      "status": "success",
      "output": "[... conteúdo reduzido ...]"
    }
  }
}
```

### ❌ Se NÃO Capturou

Possíveis razões:

1. **Hook não foi ativado** — Reinicie Claude Code
2. **Projeto não foi identificado** — Configure `CLAUDE_CODE_PROJECT` ou defina no settings
3. **Coletor falhou silenciosamente** — Verifique logs:
   ```bash
   cat ~/.painel-execucao/data/painel-execucao/status.json
   ```

## Teste de Falha: Garantir Isolamento

Para validar que **falhas no coletor não quebram Claude Code**:

### Teste A: Timeout

```bash
# Edite collector.js, adicione sleep infinito no main()
# Re-execute ação no Claude Code
# Esperado: Claude continua, coletor timeout silenciosamente
```

### Teste B: Erro de I/O

```bash
# Edite collector.js, force fs.writeFileSync() a falhar
# Re-execute ação
# Esperado: Claude não é afetado, erro vai para stderr
```

### Teste C: Processo Kill

```bash
# Enquanto Claude Code roda, mate o coletor:
pkill -f "collector.js"

# Execute ação no Claude Code
# Esperado: Claude continua, próxima ação pode reiniciar coletor
```

## Diferenciação: Fonte dos Dados

Registre em `event.captureSource`:

- `"argv-cli"` — Evento de teste (simulado via CLI)
- `"stdin"` — Evento real (PostToolUse, entrada/saída verdadeiras)
- `"unknown"` — Sem fonte ou erro

Isso prova que:
- ✅ Demos sintéticas foram diferenciadas
- ✅ Eventos reais foram capturados
- ✅ Dados legítimos vs. teste vs. falha estão identificados

## Próximos Passos

Se **entrada/saída forem capturadas com sucesso:**

1. ✅ Atualizar documentação (validar que disponível)
2. ✅ Implementar Foundation (backend, extension, frontend)
3. ✅ Usar dados reais nas demos

Se **entrada/saída NÃO forem capturadas:**

1. ❌ Investigar payload do PostToolUse (pode estar vazio ou estrutura diferente)
2. ❌ Considerar alternativa (MCP, histórico de chat)
3. ⚠️ Começar com demos bem estruturadas + anotação manual

## Limpeza Após Teste

```bash
# Remover dados de teste
rm -rf ~/.painel-execucao/data/painel-execucao

# Desativar hook (remova as linhas de settings.json ou renomeie arquivo)
rm ~/.claude/painel-execucao-posttooluse-hooks.json
```
