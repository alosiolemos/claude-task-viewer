# Tarefas: Painel Execução

## Fase 1: Foundation

- [ ] Task 1: Setup inicial (package.json raiz, tsconfig, estrutura)
- [ ] Task 2: Backend collector (Node.js, HTTP server, storage)
- [ ] Task 3: VS Code extension (manifest, package.json, Webview)
- [ ] Task 4: Frontend base (layout, tema light/dark)

## ✅ Checkpoint 1: Foundation
- [ ] `npm install` e `npm run build` sem erros
- [ ] Extension abre, Webview renderiza
- [ ] Código compila (sem TS errors)

---

## Fase 2: Demo + Captura Real

- [ ] Task 5: Frontend demo (100 → 82 registros, claramente marcado)
- [ ] Task 6: Investigar captura real (VS Code Extension API)
- [ ] Task 7: Backend persistência (JSON, API /events)
- [ ] Task 8: Frontend polling/atualização em tempo real

## ✅ Checkpoint 2: Demo + Captura
- [ ] Demo renderiza e é marcado como "Demonstração"
- [ ] Um evento real do Claude aparece no painel
- [ ] Eventos persistem entre reinicios

---

## Fase 3: Visualização e Inspetor

- [ ] Task 9: React Flow integração ou alternativa
- [ ] Task 10: Renderização etapas (planejadas vs reais)
- [ ] Task 11: Estados visuais (planejado/executando/concluído/falhou/sem evidência)
- [ ] Task 12: Inspetor lateral (layout de abas)
- [ ] Task 13: Inspetor população (dados reais)

## ✅ Checkpoint 3: Visualização
- [ ] Grafo renderiza com cores/estados corretos
- [ ] Inspetor mostra entrada/saída/erros ao clicar
- [ ] Responsivo na Webview

---

## Fase 4: Comparação e Auditoria

- [ ] Task 14: Backend múltiplas execuções (versionamento)
- [ ] Task 15: Frontend seletor "Comparar"
- [ ] Task 16: Diff visual entrada/saída
- [ ] Task 17: Gerador pedido de correção copiável

## ✅ Checkpoint 4: Comparação
- [ ] Duas execuções em lista
- [ ] Seletor funciona
- [ ] Pedido de correção copia corretamente

---

## Fase 5: Gemini Opcional

- [ ] Task 18: Setup `.env.example` e instruções `.env.local`
- [ ] Task 19: Backend sanitização de dados
- [ ] Task 20: Frontend botão "Explicar esta etapa"
- [ ] Task 21: Testes quota/desativação/sem chave

## ✅ Checkpoint 5: Gemini
- [ ] Botão funciona (ou desativado sem erros)
- [ ] Não envia dados sensíveis
- [ ] Não quebra interface em falha

---

## Fase 6: Docs e Segurança

- [ ] Task 22: README (instalação, uso, privacidade)
- [ ] Task 23: Auditoria segurança (redação, limites, CSP)
- [ ] Task 24: Preparação repositório (.gitignore, limpeza)
- [ ] Task 25: Push ao GitHub

## ✅ Checkpoint 6: Pronto
- [ ] README completo
- [ ] `.env.local` em `.gitignore`
- [ ] Nenhum dado sensível no repo
- [ ] Repositório público `painel-execucao` acessível
