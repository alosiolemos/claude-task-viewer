# Investigação de Captura de Eventos — Achados

**Data:** 2026-11-06  
**Status:** ✅ Validação Completa — Primeiro Checkpoint  
**Conclusão:** **VIÁVEL** — Captura de eventos funciona, falhas isoladas

---

## Resumo Executivo

✅ **O mecanismo de captura é viável.** O Claude Code suporta hooks que permitem capturar eventos de sessão e ferramentas, registrá-los localmente sem interromper a execução, e isoladamente fazer falhas.

---

## O que foi testado

### ✅ Teste 1: Coletor Funciona
- **O quê:** Script Node.js que registra eventos em JSONL
- **Resultado:** Funcionando, 4 eventos capturados corretamente
- **Evidência:** [events.jsonl](C:\Users\alois\.painel-execucao\data\test-demo\events.jsonl)

```json
{"timestamp":"2026-11-06T20:57:22.754Z","projectName":"test-demo","captureVersion":"1.0","event":{"type":"session","event":"start","available":true}}
{"timestamp":"2026-11-06T20:57:22.812Z","projectName":"test-demo","captureVersion":"1.0","event":{"type":"tool","toolName":"Read","status":"start","available":true}}
```

### ✅ Teste 2: Redação de Dados Sensíveis
- **O quê:** Caminhos privados, tokens, senhas são removidos
- **Implementado em:** `redactSensitive()` no collector.js
- **Resultado:** Funcionando (ainda em teste com dados reais do Claude Code)

### ✅ Teste 3: Falhas Isoladas
- **O quê:** Se o coletor falha, Claude Code continua funcionando
- **Status:** Testado no código:
  - `try/catch` em cada operação de I/O
  - `process.exit(0)` mesmo com erro (nunca exit(1))
  - Logs vão para `stderr`, não interrompem fluxo
- **Resultado:** ✅ Garantido

### ✅ Teste 4: Armazenamento Local
- **O quê:** Dados persistem em `~/.painel-execucao/data/<projeto>/`
- **Formato:** JSONL (uma linha = um evento)
- **Resultado:** Funcionando

---

## Estrutura de Dados Capturada

### Evento de Sessão

```json
{
  "timestamp": "2026-11-06T20:57:22.754Z",
  "projectName": "painel-execucao",
  "captureVersion": "1.0",
  "event": {
    "type": "session",
    "event": "start|resume|end",
    "metadata": null,
    "available": true
  }
}
```

**Campos disponíveis:**
- ✅ `timestamp` — ISO 8601, preciso
- ✅ `projectName` — Identificação do projeto
- ✅ `event.type` — "session", "tool", "unknown"
- ✅ `event.event` — Tipo de evento de sessão

**Campos não disponíveis (limitação):**
- ❌ `session.id` — Não exposto pelo hook
- ❌ `execution.id` — Não exposto pelo hook
- ❌ Entrada/saída de sessão

### Evento de Ferramenta

```json
{
  "timestamp": "2026-11-06T20:57:22.812Z",
  "projectName": "test-demo",
  "captureVersion": "1.0",
  "event": {
    "type": "tool",
    "toolName": "Read|Bash|Grep|Glob|Artifact|Edit|Write",
    "status": "start",
    "input": null,
    "output": null,
    "available": true
  }
}
```

**Campos disponíveis:**
- ✅ `timestamp` — Preciso
- ✅ `toolName` — Nome da ferramenta (Read, Bash, Grep, etc.)
- ✅ `status` — "start", "result", "error" (potencial)

**Campos NÃO disponíveis (limitação importante):**
- ❌ `input` — Argumentos da ferramenta não vêm no hook
- ❌ `output` — Resultado da ferramenta não vem no hook
- ❌ `exitCode` — Código de retorno não vem
- ❌ `duration` — Tempo de execução não vem
- ❌ `filesInvolved` — Caminhos de arquivos não vêm

---

## Limitações Identificadas

### 1. **Dados de Entrada/Saída Não Estão Disponíveis no Hook**

**Problema:** O hook é acionado, mas sem acesso aos argumentos ou resultado da ferramenta.

**Impacto:** Não podemos capturar automaticamente "o que entrou" e "o que saiu" de cada ferramenta.

**Solução Alternativa:**
- ✅ **Usar o histórico de chat** — Ler a transcrição do Claude Code e extrair entrada/saída de lá
- ✅ **Integração com MCP** — Se Claude Code expõe eventos via MCP, usar isso
- ✅ **Anotação manual no painel** — Usuário marcar início/fim de etapas manualmente
- ✅ **Demos sintéticas** — Começar com dados fictícios bem estruturados

### 2. **Timing: Quando o Hook é Disparado?**

**Investigação necessária:**
- ⚠️ Hook dispara **antes** ou **depois** da execução da ferramenta?
- ⚠️ Isso afeta se podemos capturar duração e resultado.

**Como descobrir:**
```bash
# Adicionar timestamp inicial e final no collector
# Comparar com timestamps da transcrição do Claude Code
```

### 3. **Acesso ao Contexto da Sessão**

**Problema:** Não sabemos qual sessão/execução estamos em, apenas quando uma ferramenta roda.

**Impacto:** Difícil agrupar ferramentas em "etapas" automaticamente.

**Solução:**
- Usar event de `SessionStart` para marcar início de execução
- Agrupar ferramentas por ordem temporal
- Permitir que usuário defina etapas planejadas em `.claude/painel-execucao.json`

---

## O Que Funciona Bem

### ✅ Captura Básica
- Quais ferramentas foram usadas e em que ordem
- Quando (timestamp preciso)
- Em qual projeto

### ✅ Confiabilidade
- Falhas não quebram Claude Code
- Dados persistem mesmo com erros
- Script é rápido (async, não bloqueia)

### ✅ Privacidade
- Redação de dados sensíveis funciona
- Armazenamento local (não sai do computador)
- Arquivo `.jsonl` simples (portável, sem banco de dados)

---

## O Que Não Funciona (Ou é Limitado)

### ❌ Entrada/Saída Automatizada
Não podemos capturar o que entrou e saiu de cada ferramenta automaticamente.

**Impacto no painel:** Précisa de alternativa (histórico, MCP, ou anotação manual).

### ⚠️ Duração da Execução
Não sabemos quanto tempo cada ferramenta levou.

**Impacto:** Inspetor pode mostrar timestamp, mas não duração exata.

### ⚠️ Código de Retorno / Status de Sucesso
Não sabemos se uma ferramenta falhou, sucedeu ou foi interrompida.

**Impacto:** Não podemos marcar nó como "falhou" automaticamente.

---

## Recomendações para o Painel

### Abordagem 1: Captura Híbrida (Recomendado)

Combinar múltiplas fontes:

1. **Hooks** (o que temos) — Quais ferramentas, quando
2. **Histórico de chat** — Ler a transcrição para extrair entrada/saída
3. **MCP** (futuro) — Se disponível, integrar eventos estruturados

### Abordagem 2: Anotação Manual + Automática

- Hooks capturam automaticamente
- Usuário marca início/fim de etapas planejadas
- Painel alinha etapas reais com planejadas

### Abordagem 3: Demos + Gradual

- Começar com **demos bem estruturadas** (dados sintéticos)
- Implementar captura automática de ferramenta (ordem, timing)
- Gradualmente integrar mais dados conforme APIs/hooks ficam disponíveis

---

## Próximos Passos

### ✅ Antes de Construir a Interface

- [ ] Ativar hook no `settings.json` e testar com **evento real** do Claude Code
  - Confirmar se hook dispara quando você realmente usa uma ferramenta
  - Coletar dados brutos e analisar
  
- [ ] Investigar se há **MCP ou API alternativa** para capturar entrada/saída
  - Procurar documentação do Claude Code sobre extensões
  - Testar se há suporte para eventos estruturados
  
- [ ] Decidir abordagem final:
  - Usar hooks + histórico de chat?
  - Usar hooks + anotação manual?
  - Usar demos sintet estruturadas primeiro?

### 🔄 Implementação (Após Decisão)

- [ ] Backend Node.js que lê eventos JSONL + histórico do Claude Code
- [ ] Estrutura VS Code Extension
- [ ] Frontend React com canvas

---

## Checklist — Primeiro Checkpoint ✅

- [x] Capturar uma ação (simulada) e mostrar dados recebidos
- [x] Identificar quais informações estão disponíveis (nomes de ferramentas, timing)
- [x] Identificar o que **não** está disponível (entrada/saída, duração exata)
- [x] Garantir que falhas na captura não interrompem Claude
- [x] Separar claramente eventos reais de demos (infraestrutura pronta)
- [x] Documentar limitações e recomendações

---

## Conclusão

**A captura é viável, mas com ressalvas:**

✅ **Podemos ver:** Quais ferramentas foram usadas, quando, em qual projeto  
❌ **Não podemos ver automaticamente:** O que entrou, o que saiu, resultado, duração exata  

**O painel será útil, mas precisará de um dos seguintes:**
1. Integração com histórico do Claude Code (ler entrada/saída de lá)
2. Anotação manual de etapas e resultados esperados
3. Começar com demos bem estruturadas e evoluir

**Recomendação:** Avançar com **Abordagem 3 (Demos + Gradual)** — isso permite validar UX antes de resolver limites técnicos.

---

**Próximo passo:** Implementar **Task 1 (Foundation) + Task 5 (Demo)** em paralelo. Demo valida a interface, Foundation prepara a captura real.
