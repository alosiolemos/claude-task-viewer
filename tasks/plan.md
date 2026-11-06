# Plano de Implementação: Painel Execução

## Visão Geral

Construir um painel local em VS Code para acompanhar, auditar e comparar a execução de trabalhos do Claude Code. O painel mostra etapas planejadas vs reais com entrada/saída de cada nó, semelhante ao n8n, permitindo identificar falhas e divergências sem revisar toda a conversa.

**Stack:** JavaScript/TypeScript, Node.js local (collector), React + TypeScript (Webview), VS Code Extension API.

## Decisões de Arquitetura

1. **Separação clara:** Backend (Node collector isolado) ↔ Frontend (VS Code Webview React)
2. **Armazenamento local:** JSON/SQLite por projeto, fora de `node_modules`, com isolamento e limites
3. **Captura aditiva:** Hooks que se somam aos existentes, sem substituir; backup e desinstalação seguras
4. **Demo claramente marcada:** Eventos sintéticos no primeiro protótipo, depois captura real
5. **Gemini opcional, desativado:** Botão "Explicar" usa `.env.local` (não versionado); funciona sem IA
6. **React Flow opcional:** Avaliar licença e dependências antes de instalar

## Lista de Tarefas

### Fase 1: Foundation

- [ ] **Task 1:** Setup inicial (package.json raiz, tsconfig, estrutura de pastas)
- [ ] **Task 2:** Backend collector: estrutura Node.js, server HTTP, armazenamento de eventos
- [ ] **Task 3:** VS Code extension: package.json, manifest, Webview inicial
- [ ] **Task 4:** Frontend: layout base (header, canvas, painel lateral), tema light/dark

**Checkpoint 1 – Foundation:**
- [ ] `npm install` e `npm run build` passam sem erros
- [ ] Extension abre e Webview renderiza (mesmo que vazia)
- [ ] Código compila (sem TS errors)

---

### Fase 2: Demo e Captura Real

- [ ] **Task 5:** Frontend: componente de demo com eventos sintéticos (100 registros → 82 após transformação)
- [ ] **Task 6:** Investigar e implementar captura real: quais eventos Claude Code expõe via extensão API
- [ ] **Task 7:** Backend: persistência de eventos em arquivo JSON, API `/events` para listar
- [ ] **Task 8:** Frontend: polling/websocket de eventos, atualização em tempo real do painel

**Checkpoint 2 – Demo + Captura:**
- [ ] Demo renderiza com dados marcados como "Demonstração" (100 → 82 → corrigido)
- [ ] Um evento real do Claude Code aparece no painel após ativação no projeto
- [ ] Eventos persistem entre reinicios do Webview

---

### Fase 3: Visualização e Inspetor

- [ ] **Task 9:** Integração React Flow (ou similar): componente Canvas com nós
- [ ] **Task 10:** Renderização: etapas planejadas como nós (cor diferente), ações reais como nós
- [ ] **Task 11:** Estados visuais: planejado (cinza), executando (azul), concluído (verde), falhou (vermelho), sem evidência (tracejado)
- [ ] **Task 12:** Inspetor lateral: layout de abas (entrada/saída, metadados, validação)
- [ ] **Task 13:** Inspetor: population com dados reais (entrada, parâmetros, saída, erros, duração)

**Checkpoint 3 – Visualização:**
- [ ] Grafo renderiza etapas planejadas e reais em cores diferentes
- [ ] Estados visuais aparecem corretamente
- [ ] Inspetor mostra entrada/saída/erros ao clicar em um nó
- [ ] Responsivo e legível em Webview do VS Code

---

### Fase 4: Comparação e Auditoria

- [ ] **Task 14:** Backend: armazenar múltiplas execuções com ID único, versionamento
- [ ] **Task 15:** Frontend: seletor "Comparar" (execução A vs B)
- [ ] **Task 16:** Diff visual: mostrar diferenças entrada/saída lado a lado
- [ ] **Task 17:** Gerador de "Pedido de Correção": texto copiável com exec ID, nó, esperado/obtido

**Checkpoint 4 – Comparação:**
- [ ] Duas execuções aparecem em lista
- [ ] Seletor "Comparar" mostra diff
- [ ] Pedido de correção copia texto correto para clipboard

---

### Fase 5: Gemini Opcional

- [ ] **Task 18:** Setup: `.env.example` com `GEMINI_ENABLED=false`, instruções para `.env.local`
- [ ] **Task 19:** Backend: sanitização de dados (remover caminhos sensíveis, IDs privados, manter contagens/tipos)
- [ ] **Task 20:** Frontend: botão "Explicar esta etapa", chamada ao backend com dados sanitizados
- [ ] **Task 21:** Testes: falha de quota 429, chave vazia, desativação sem erros

**Checkpoint 5 – Gemini:**
- [ ] Botão "Explicar" funciona (ou silenciosamente desativado se sem chave/IA off)
- [ ] Não envia dados sensíveis (validar logs)
- [ ] Não quebra interface se API falhar

---

### Fase 6: Documentação e Segurança

- [ ] **Task 22:** README: instalação, uso, ativação da captura, privacidade, desinstalação
- [ ] **Task 23:** Auditoria de segurança: redação de segredos antes de gravar, limites de tamanho, CSP da Webview
- [ ] **Task 24:** Preparação repositório: `.gitignore`, limpeza de dados reais, verificação de segredos
- [ ] **Task 25:** Push ao GitHub: confirmar conta `alosiolemos`, criar repo `painel-execucao`, primeiro push

**Checkpoint 6 – Pronto:**
- [ ] README completo e instalável
- [ ] `.env.local` está em `.gitignore`, `.env.example` sem chave real
- [ ] Nenhum arquivo sensível ou de log no repo
- [ ] Repositório público acessível

---

## Riscos e Mitigações

| Risco | Impacto | Mitigação |
|-------|---------|-----------|
| API de extensão VS Code não expõe eventos esperados | Alto | **Investigar early** (Task 6): confirmar eventos reais vs inventados antes de prosseguir |
| React Flow incompatível ou muito pesado | Médio | Avaliar alternativa (SVG puro) se licença/deps forem problema |
| Armazenamento de eventos cresce infinitamente | Médio | Implementar limites de tamanho, limpeza automática por projeto, UI de exclusão manual |
| Gemini API muda ou cota esgota | Baixo | Fallback local sempre ativo; IA é só explicação, nunca lógica |
| Segredos vazam em logs/armazenamento | Alto | Implementar redação (Task 23), testar com dados sensíveis fake, revisar antes de push |

## Perguntas em Aberto

1. **Quais eventos o Claude Code realmente expõe?** Confirmados apenas após leitura da VS Code Extension API (Task 6).
2. **React Flow é a melhor opção?** Avaliar alternativas (SVG D3, Canvas, etc.) conforme requisitos ficarem claros.
3. **Limite de armazenamento por projeto?** Sugerido: 100MB, com aviso ao usuario e UI para limpeza.
4. **Qual modelo Gemini usar?** Confirmar com o usuário antes de Task 20 (deve ter faixa gratuita).
5. **Precisa suportar exportação de execuções?** Out of scope no piloto; mencionar em README.

## Estimativas

| Fase | Tamanho Esperado | Prioridade |
|------|---|---|
| Foundation | Pequeno (1-2h) | 1️⃣ |
| Demo + Captura | Médio (3-4h) | 1️⃣ |
| Visualização | Médio-Grande (4-5h) | 2️⃣ |
| Comparação | Pequeno-Médio (2-3h) | 2️⃣ |
| Gemini | Pequeno (1-2h) | 3️⃣ |
| Docs + Segurança | Pequeno-Médio (2-3h) | 1️⃣ |

**Total estimado: 15-19 horas de agência, sequencial com checkpoints.**
