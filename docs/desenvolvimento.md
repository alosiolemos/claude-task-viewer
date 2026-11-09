# Desenvolvimento e validação

[← Voltar à apresentação](../README.md)

## Estrutura atual

```text
extension/src/
  extension.ts          Integração com VS Code, sessão e SecretStorage
  transcript-reader.ts  Leitura incremental do JSONL
  transcript-model.ts   Pedidos, ações, resultados e comentários públicos
  task-store.ts         Identidade, associação e seleção de tarefas
  view.ts               Dados apresentados ao usuário
  gemini.ts             Contexto sanitizado e chamada opcional ao Gemini
extension/webview/
  painel.html           HTML, CSS, JavaScript e conectores SVG
scripts/
  build.mjs             Bundle da extensão, sem build React
  package.mjs           Geração do VSIX
  capture-docs.cjs       Capturas da interface com dados inventados
```

O leitor observa a transcrição em modo somente leitura e correlaciona chamadas e resultados pelos identificadores presentes. A interface recebe dados pela ponte de mensagens do VS Code. Não existe servidor HTTP de produção, banco externo ou integração que mande ordens ao Claude.

Os arquivos `collector.js`, `reader.js`, `webview/` e os módulos antigos `event-reader`, `executions`, `painel-provider` e `task-manager` são remanescentes das primeiras versões. Não fazem parte do fluxo ativo da interface atual; não são instruções de instalação. O empacotamento seleciona somente o bundle, o HTML e os recursos necessários. Documentos de planejamento antigos registram abordagens anteriores.

## Preparar o ambiente de desenvolvimento

A instalação para usuários finais é pelo VSIX; estes comandos são apenas para quem pretende alterar o código.

```bash
git clone https://github.com/alosiolemos/claude-task-viewer.git
cd claude-task-viewer
npm install
npm test
npm run build
npm run package
```

Confira os requisitos `engines` dos pacotes. O VS Code mínimo declarado é 1.85; a execução do bundle usa o runtime do editor. Ferramentas de desenvolvimento e empacotamento podem exigir uma versão de Node mais recente que a do bundle.

O frontend é HTML/CSS/JavaScript com SVG. Não usa React, React Flow, Vite ou Rollup em produção. O bundle TypeScript da extensão ainda é produzido com **esbuild** no ambiente de desenvolvimento. Usuários do VSIX não precisam executar o compilador. Não contorne políticas corporativas ou de segurança se ferramentas de desenvolvimento forem bloqueadas.

## Testes

- `npm test`: leitor, modelo, tarefas, detalhes, Gemini e integração com API simulada do VS Code.
- `npm run test:ui`: interface real no navegador com dados sintéticos e ponte VS Code simulada; requer Playwright e Microsoft Edge disponíveis. Use `PAINEL_PLAYWRIGHT_PATH` para indicar a instalação de Playwright quando necessário.
- Testes de navegador não substituem a conferência na webview real.
- `node scripts/capture-docs.cjs`: gera as imagens deste README usando dados inventados, sem ler sessões pessoais. Usa o mesmo requisito de navegador dos testes de UI.

Validação da base publicada: **41 testes unitários e 52 verificações de interface** passaram no Windows. O usuário conferiu a interface instalada até a versão 0.8.3. Não houve teste de macOS/Linux nem nova chamada real à API Gemini na preparação desta publicação.

Testes que consultam transcrições reais são opcionais e locais: nunca inclua seu conteúdo em fixtures ou screenshots públicos. O número de chamadas, ações e testes não é uma garantia de ausência de defeitos.

## Privacidade e contribuição

- Chaves somente no SecretStorage; nunca em código, logs, screenshots ou issues.
- Explanação Gemini por pedido explícito, com dados da etapa sanitizados e limitados.
- Transcrições e arquivos do usuário podem conter dados sensíveis. Não publique os registros ao contribuir.
- Não persista uma segunda cópia completa da conversa apenas para renderizar a interface.
- O nome público do repositório pode mudar sem mudar `name`, `publisher` e as chaves internas de configuração da extensão.

Exportação para auditoria, suporte completo a subagentes e novos assistentes ficam fora da versão atual. Contribuições devem preservar simplicidade, leitura local e uma instalação pronta para quem não programa.
