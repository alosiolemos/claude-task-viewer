# Teste de Captura de Eventos — Painel Execução

Este guia valida se o Claude Code consegue capturar eventos reais para o Painel Execução.

## O que será testado

1. ✅ Captura de evento de sessão (startup)
2. ✅ Captura de eventos de ferramentas (Read, Bash, Glob, Grep, Artifact, Edit, Write)
3. ✅ Redação de dados sensíveis
4. ✅ Armazenamento em JSON local
5. ✅ Falhas não interrompem o Claude Code

## Pré-requisitos

- Node.js 18+ instalado
- Claude Code em uso
- Pasta `painel-execucao` clonada/criada

## Como Testar

### Passo 1: Ativar o Hook (Temporário)

**OPÇÃO A — Aplicar o hook manualmente (recomendado para teste)**

Abra um terminal e execute:

```bash
cd "C:\Users\alois\OneDrive\Documentos\Projetos\estudos\painel-execucao"

# Copiar hook para a pasta de testes
cp painel-execucao-test-hooks.json ~/.claude/painel-execucao-test-hooks.json
```

**OPÇÃO B — Editar settings.json para incluir o hook (permanente até reverter)**

⚠️ Cuidado: Isso altera a configuração global do Claude Code.

```bash
# Leia o arquivo atual
cat ~/.claude/settings.json
```

Se quiser registrar o hook manualmente, adicione a hooks file ao settings.json. Mas por enquanto, deixe como está.

### Passo 2: Reiniciar Claude Code

Feche e reabra o Claude Code para que o hook seja carregado.

### Passo 3: Executar Ações no Claude Code

No Claude Code, dentro de um projeto (por exemplo, este painel-execucao):

1. **Ler um arquivo:**
   ```
   Use a ferramenta Read para ler qualquer arquivo.
   ```

2. **Executar um comando bash:**
   ```
   Use a ferramenta Bash para listar arquivos (ls -la).
   ```

3. **Procurar por algo:**
   ```
   Use Grep ou Glob para procurar padrões.
   ```

4. **Editar um arquivo:**
   ```
   Use Edit para fazer uma modificação.
   ```

Cada ação deve disparar o hook e registrar um evento.

### Passo 4: Visualizar Eventos Capturados

Após executar algumas ações, abra um terminal e execute:

```bash
cd "C:\Users\alois\OneDrive\Documentos\Projetos\estudos\painel-execucao"

# Ver eventos capturados
node reader.js painel-execucao
```

### Esperado

```
📊 Painel Execução — Leitor de Eventos

📂 Projeto: painel-execucao
📁 Diretório: C:\Users\alois\.painel-execucao\data\painel-execucao

✅ Status do Coletor:
   Habilitado: true
   Última verificação: 2026-11-06T18:30:45.123Z
   PID: 12345

📋 Eventos capturados: 5

[1] 2026-11-06T18:30:30.456Z
    Tipo: session
    Evento de Sessão: start
    ✅ Captura ativa

[2] 2026-11-06T18:30:35.789Z
    Tipo: tool
    Ferramenta: Read
    Status: start
    ✅ Captura ativa

[3] 2026-11-06T18:30:40.321Z
    Tipo: tool
    Ferramenta: Bash
    Status: start
    ✅ Captura ativa

✅ Total de eventos: 3
```

## Investigação: Quais Dados Estão Disponíveis?

Após capturar eventos, analise o arquivo bruto:

```bash
cat ~/.painel-execucao/data/painel-execucao/events.jsonl
```

Você verá linhas como:

```json
{"timestamp":"2026-11-06T18:30:30.456Z","projectName":"painel-execucao","captureVersion":"1.0","event":{"type":"session","event":"start","available":true}}
{"timestamp":"2026-11-06T18:30:35.789Z","projectName":"painel-execucao","captureVersion":"1.0","event":{"type":"tool","toolName":"Read","status":"start","available":true}}
```

### Limitações Identificadas

Baseado no teste, documente:

1. **Quais informações estão disponíveis no hook?**
   - Nome da ferramenta? ✅/❌
   - Entrada/argumentos? ✅/❌
   - Saída/resultado? ✅/❌
   - Status (start/result/error)? ✅/❌
   - Timestamp? ✅/❌
   - Projeto/contexto? ✅/❌

2. **Quando o evento é disparado?**
   - Antes da execução? (permite interceptar)
   - Depois da execução? (permite capturar resultado)
   - Ambos? (permite rastrear duração)

3. **Há dados perdidos ou reduzidos?**
   - Caminhos de arquivo aparecem? (precisam redação)
   - Tokens/senhas aparecem? (precisam redação)
   - Conteúdo de arquivo completo? (grande demais?)

4. **Falhas do hook quebram o Claude Code?**
   - Ao deliberadamente retornar erro do collector.js
   - O Claude Code deve continuar funcionando normalmente

## Desinstalação (Remover Hook de Teste)

```bash
# Remover arquivo de hook
rm ~/.claude/painel-execucao-test-hooks.json

# Limpar dados coletados (opcional)
rm -rf ~/.painel-execucao/data/painel-execucao

# Ou apenas arquivos de log
rm ~/.painel-execucao/data/painel-execucao/events.jsonl
```

Reinicie o Claude Code para confirmar que voltou ao normal.

## Próximos Passos (Baseado nos Achados)

Após este teste, você terá:

1. ✅ Evidência de quais dados podem ser capturados
2. ✅ Confirmação de que falhas não quebram Claude
3. ✅ Lista de limitações reais (não presumidas)
4. ✅ Fundamento para decidir se o backend/Webview faz sentido

Se os eventos forem muito limitados, o painel pode focar em:
- Dados capturados pelo histórico de chat (via MCP ou plugin)
- Demonstrações sintéticas com dados simulados
- Integração com `.claude/settings.json` para etapas planejadas

Se os eventos forem ricos, avançar para backend + Webview normalmente.

## Questões para Investigação

Após rodar o teste, responda:

- [ ] Capturou eventos de sessão? (sim/não)
- [ ] Capturou eventos de ferramentas específicas? (quais?)
- [ ] Quais informações estão disponíveis em cada evento?
- [ ] Há campos vazios ou reduzidos?
- [ ] Falhas do hook quebraram o Claude? (esperado: não)
- [ ] Dados sensíveis aparecem antes da redação? (esperado: não)
