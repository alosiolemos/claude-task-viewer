# Painel Execução

Painel local em VS Code para acompanhar, auditar e comparar a execução de trabalhos do Claude Code, semelhante ao n8n.

**Status:** 🧪 Em desenvolvimento — Validação de captura de eventos

## O que é

Um painel visual que mostra:

- 📊 **Etapas planejadas vs reais** — veja o fluxo esperado e o que realmente aconteceu
- 🔍 **Entrada/saída de cada nó** — inspecione dados em cada etapa
- 📈 **Comparação entre execuções** — identifique divergências
- 🤖 **IA opcional (Gemini)** — explique anomalias, sem ser fonte de verdade

Tudo **local**, **sem internet**, **sem custos**, com interface em **português do Brasil**.

## Arquitetura

```
VS Code Extension (Webview React)
    ↓
    Backend Collector (Node.js local)
    ↓
    Armazenamento Local (JSON/SQLite)
    ↓
    Captura de Eventos (Hooks do Claude Code)
```

## Estrutura do Projeto

```
painel-execucao/
├── collector.js           # Script Node que registra eventos
├── reader.js              # Leitor de eventos capturados (debug)
├── PRODUCT.md             # Contexto de produto (Impeccable)
├── TESTE-CAPTURA.md       # Guia para validar captura real
├── tasks/
│   ├── plan.md           # Plano de implementação detalhado
│   └── todo.md           # Lista de tarefas verificável
├── src/
│   ├── backend/          # (Em desenvolvimento)
│   ├── extension/        # (Em desenvolvimento — VS Code Extension)
│   └── frontend/         # (Em desenvolvimento — React Webview)
└── README.md
```

## Como Contribuir / Desenvolver

### Fase Atual: Validação

Estamos validando se é possível capturar eventos reais do Claude Code.

**Para testar a captura:**

```bash
# 1. Ativar hook de teste
cp painel-execucao-test-hooks.json ~/.claude/painel-execucao-test-hooks.json

# 2. Reiniciar Claude Code

# 3. Executar ações no Claude Code (ler arquivo, bash, etc.)

# 4. Ver eventos capturados
node reader.js painel-execucao
```

Veja [TESTE-CAPTURA.md](TESTE-CAPTURA.md) para instruções completas.

### Próximas Fases

1. ✅ **Validação** — Confirmar captura real (em progresso)
2. 📋 **Foundation** — Setup, backend, extension, frontend base
3. 📊 **Visualização** — Grafo com React Flow, inspetor
4. 🔄 **Comparação** — Diff entre execuções
5. 🤖 **Gemini** — Explicações opcionais (desativado por padrão)
6. 📦 **Publicação** — Repositório público, documentação final

Veja [tasks/plan.md](tasks/plan.md) para o plano completo.

## Requisitos

- **Node.js 18+**
- **Claude Code** (extensão do VS Code)
- **Git** (para contribuir)

## Configuração Rápida (Depois)

```bash
# Instalar dependências
npm install

# Rodar extensão em desenvolvimento
npm run dev:extension

# Rodar backend collector
npm run dev:collector

# Ver interface em navegador (durante dev)
npm run dev:webview
```

(Scripts a serem adicionados conforme a implementação avança)

## Privacidade e Segurança

- ✅ **Captura desativada por padrão** — só ativa em projeto explicitamente marcado
- ✅ **Dados reduzidos** — senhas, tokens e caminhos privados removidos antes de gravar
- ✅ **Sem internet** — tudo local, nenhuma transmissão externa (Gemini opcional)
- ✅ **Falhas isoladas** — erros do coletor nunca interrompem Claude Code

## Gemini (Opcional)

Se quiser explicações por IA:

1. Copie `.env.example` para `.env.local` (ignorado pelo git)
2. Preencha `GEMINI_API_KEY` e `GEMINI_MODEL` com sua conta Gemini
3. Defina `GEMINI_ENABLED=true`

**Sem Gemini:**
- O painel funciona 100% offline
- Sem dependência de chave de API
- Sem custos extras

## Desinstalação

Para remover o painel completamente:

```bash
# 1. Remover hook de teste (se ativado)
rm ~/.claude/painel-execucao-test-hooks.json

# 2. Remover dados coletados
rm -rf ~/.painel-execucao/

# 3. Desinstalar extensão (depois, quando estiver no marketplace)
```

## Contribuindo

Este é um projeto pessoal em desenvolvimento. Contribuições, sugestões e relatos de bugs são bem-vindos via Issues.

## Licença

(A definir)

## Referências

- [Plano de Implementação](tasks/plan.md)
- [Contexto de Produto](PRODUCT.md)
- [Guia de Teste](TESTE-CAPTURA.md)

---

**Última atualização:** 2026-11-06
