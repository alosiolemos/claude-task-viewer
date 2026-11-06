# Painel Execução — Produto

**Visão:** Painel local em VS Code para acompanhar, auditar e comparar a execução de trabalhos do Claude Code (e futuramente Codex), mostrando etapas planejadas vs reais com entrada/saída de cada nó.

## Modo

**Operate** — o visitante (usuário auditor) completa uma tarefa de auditoria e comparação. Scanabilidade, consistência com VS Code, e clareza sobre estado/evidências superam expressão. A interface recede; os dados falam.

## Necessidades principais

1. **Acompanhamento visual modular** — semelhante ao n8n, mostrando:
   - Etapas planejadas (grafo do fluxo esperado)
   - Ações reais capturadas automaticamente
   - Entrada/saída de cada nó
   - Estados: planejado, executando, concluído, falhou, cancelado, sem evidência

2. **Captura automática** — sem arrastar arquivos, integração com eventos do Claude Code em projeto específico, com controle ligar/desligar visível.

3. **Inspetor lateral** — ao clicar em uma etapa/ação, mostra:
   - Projeto, sessão, execução, etapa, ID
   - Entrada e parâmetros
   - Ação, ferramenta, arquivos envolvidos
   - Saída, erros, código de retorno
   - Horário e duração
   - Validação e evidência
   - Relação pai-filho, tentativas

4. **Comparação e auditoria** — permite comparar execuções anteriores vs atuais, marcar divergências, gerar pedido de correção copiável.

5. **IA opcional (Gemini)** — botão "Explicar esta etapa", apenas para resumir erros e sugerir hipóteses, nunca fonte de verdade.

## Público

- Usuário desenvoltor/auditor em português do Brasil
- Dentro do VS Code (Webview)
- Focado em clareza, auditoria sem distrações, sem experimentação

## Requisitos técnicos

- **Stack:** JavaScript/TypeScript, Node.js local, React, VS Code Extension API
- **Interface:** Webview React com React Flow para nós (após validar licença)
- **Armazenamento:** Fora da pasta versionada, isolado por projeto, com limites de tamanho e retenção
- **Segurança:** Captura desativada por padrão, redação de segredos antes de gravar, sem monitoramento de desktop, Webview com CSP restrita

## Captura e eventos

- Inicialmente: eventos do Claude Code apenas
- Preparar adaptadores para Codex (não declarar pronto sem testar)
- Confirmar antes da implementação: quais eventos realmente estão disponíveis na API de extensões VS Code

## Gemini (opcional, desativado)

- Camada de explicação apenas, nunca transformação de dados
- Arquivo `.env.local` para chave real (ignorado pelo git, `.env.example` sem chave)
- `GEMINI_ENABLED=false` por padrão
- Sem fallback pago, sem upgrade automático
- Anonimização de dados sensíveis antes de enviar
- Mostrar carga exata e pedir confirmação na primeira ativação

## Repositório público

- Nome: `painel-execucao`
- GitHub user: `alosiolemos`
- Somente código e demonstrações sintéticas
- `.gitignore` exclui `.env*`, `node_modules`, `build`, `logs`, dados locais
- README com instalação, uso, privacidade, limitações, desinstalação
- Revisão de segredos antes do push

## Entregas

1. Estrutura mínima + Webview com eventos de demonstração (claramente identificados)
2. Captura de evento real do Claude Code, persistência e atualização
3. Grafo de etapas, inspetor, estados de falha
4. Comparação entre execuções e pedido de correção copiável
5. Gemini opcional, com testes de sanitização
6. Documentação, segurança, preparação para repositório público
