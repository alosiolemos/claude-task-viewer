# Claude Task Viewer

### Visualização modular das tarefas do Claude, dentro do VS Code

Veja **o que o Claude Code leu, editou e executou**, acompanhe os resultados e entenda cada etapa sem precisar decifrar uma conversa cheia de termos técnicos.

## A dor que este projeto procura resolver

Quem está começando a usar um assistente de programação pode pedir uma mudança e receber uma sequência de nomes de arquivos, comandos e respostas sem entender o que aconteceu. **O Claude leu o quê? Mudou qual arquivo? Essa ação deu certo? Por que foi para a próxima etapa?**

Criei este projeto porque também estou aprendendo e queria uma experiência mais fácil: ver cada passo, abrir o resultado e acompanhar a explicação sem precisar dominar JavaScript, Git ou outra linguagem. O objetivo é ajudar a entender o trabalho, não ensinar todos os conceitos de programação nem garantir que o código esteja correto.

A implementação foi construída com Claude Code, com apoio do Codex na revisão, nos testes e na preparação da publicação.

**[Baixar a versão 0.8.3](https://github.com/alosiolemos/claude-task-viewer/releases/tag/v0.8.3)** · [Como instalar e usar](docs/como-usar.md) · [Código e testes](docs/desenvolvimento.md)

![Uma tarefa do Claude representada em cartões conectados: solicitação, leitura, edição, verificação e resposta](docs/images/fluxo-tarefa.png)

*Interface real da versão 0.8.3, com dados ilustrativos. As capturas não contêm conversas, chaves ou arquivos pessoais.*

## O que você consegue acompanhar

| Você quer saber… | Onde encontra |
| --- | --- |
| O que ele está fazendo? | Cartões de leitura, edição, comandos e resposta |
| Qual arquivo foi usado? | Nome curto no cartão e caminho nos detalhes |
| O que entrou e o que saiu? | Colunas **Arquivo**, **Entrada** e **Saída / Resultado** |
| O que mudou em uma edição? | Trechos antes/depois e alteração registrada, quando disponíveis |
| Por que ele fez isso? | Comentário público do Claude associado à ação ou à rodada |
| Preciso de uma explicação mais simples? | **Explicar esta etapa**, com Gemini opcional e sua própria chave |

O painel **observa** o Claude. Ele não programa por você, não executa os comandos exibidos e não altera seus arquivos.

## Do pedido ao resultado

```mermaid
flowchart LR
    A[Recebeu solicitação] --> B[Leu arquivo]
    B --> C[Editou arquivo]
    C --> D[Executou verificação]
    D --> E[Respondeu ao usuário]
```

As linhas do painel representam a **ordem observada**, não uma dependência comprovada. Ações que pertencem à mesma resposta podem aparecer agrupadas em paralelo. Uma falha intermediária fica visível na ação; uma resposta final não significa, por si só, que o trabalho passou em testes.

## Clique para entender uma etapa

![Detalhes de uma edição: arquivo, entrada, resultado, comentário original do Claude e opção de explicação com Gemini](docs/images/detalhes-etapa.png)

As informações abrem **abaixo do fluxo**, em um painel de altura ajustável. Os conteúdos ficam recolhidos para facilitar a leitura; você expande somente o que precisa.

- **Arquivo:** nome, caminho completo e botão para copiar.
- **Entrada:** parâmetros e trechos anteriores/novos, quando registrados.
- **Saída / Resultado:** retorno, alteração ou erro registrado.
- **Comentário do Claude:** texto público da mesma mensagem; nunca raciocínio interno. Quando cobre várias ações, é identificado como comentário da rodada.
- **Explicação com Gemini:** interpretação opcional, identificada como gerada por IA e separada do comentário original.
- **Detalhes técnicos:** IDs e dados de referência, recolhidos por padrão.

## Instalar sem programar

Você precisa do **VS Code** e do **Claude Code gravando transcrições locais**. O fluxo de instalação e uso foi validado no Windows; outros sistemas ainda precisam de validação.

1. Abra a [página da versão 0.8.3](https://github.com/alosiolemos/claude-task-viewer/releases/tag/v0.8.3).
2. Em **Assets**, baixe **`painel-execucao-0.8.3.vsix`**. Esse é o instalador; não é necessário baixar o código-fonte.
3. No VS Code, abra **Extensões** (`Ctrl+Shift+X`), clique em **…** e escolha **Instalar a partir do VSIX / Install from VSIX**.
4. Selecione o arquivo baixado. Se o VS Code pedir, recarregue a janela.
5. Abra a mesma pasta em que está usando o Claude Code.
6. Pressione `Ctrl+Shift+P` e procure **Abrir Visualização de Execução do Claude**.

**Não precisa de terminal, npm, Python, servidor ou chave do Gemini para usar o painel básico.** O VSIX já vem pronto. Se aparecer um bloqueio de segurança do sistema, não desative a proteção: registre o erro para investigação.

## Usar no dia a dia

1. Confira a sessão exibida; use **Trocar sessão** se precisar escolher outra.
2. Clique em **Nova tarefa** antes de iniciar um trabalho diferente no Claude.
3. Envie seu pedido ao Claude normalmente e acompanhe os cartões surgirem.
4. Clique em um cartão para consultar os detalhes.
5. Correções do mesmo trabalho continuam na tarefa atual. Para retomar outra tarefa do histórico, selecione-a e use **Continuar esta tarefa**.

O conteúdo que já existia antes da primeira abertura fica em **Histórico legado**. Consultar uma tarefa antiga não muda automaticamente o destino das novas ações. **Ocultar tarefas** amplia a área do fluxo; **Mais recente** ajuda a voltar à última ação e **Ajustar à tela** mostra o conjunto.

> **Primeiro teste:** com uma nova tarefa criada no painel, peça ao Claude: “Leia o README.md e explique a finalidade do projeto. Não altere arquivos.” Observe a leitura e a resposta no mesmo fluxo.

[Veja o guia com solução de problemas e configuração do Gemini →](docs/como-usar.md)

## Gemini é opcional

Use **Configurações → Adicionar chave** para informar sua própria chave de API. Ela é armazenada no **SecretStorage do VS Code**; nenhuma chave do autor acompanha o projeto.

A explicação só é solicitada ao clicar em **Explicar esta etapa**. O aplicativo envia os dados selecionados da ação e o comentário público associado, sanitizados e com limites de tamanho. Na primeira solicitação, mostra o que será enviado. Não envia automaticamente a conversa inteira nem raciocínio interno.

A sanitização reduz exposição; não garante remover toda informação confidencial presente em código ou resultados. Revise os dados antes do envio. O uso da API depende das cotas, preços e condições da conta do usuário. A assinatura do Claude não inclui automaticamente essa API. Sem chave, os detalhes locais continuam funcionando.

## Como funciona e quais são os limites

```mermaid
flowchart LR
    A[Transcrição local do Claude] --> B[Leitura das novas linhas]
    B --> C[Ações organizadas por tarefa]
    C --> D[Fluxo e detalhes no VS Code]
    D -. Pedido explícito do usuário .-> E[Gemini opcional]
```

- Leitura direta dos registros locais em `~/.claude/projects`, respeitando `CLAUDE_CONFIG_DIR` e a pasta configurada no painel. A verificação padrão ocorre a cada **1,5 segundo**.
- Sem alteração ou cópia integral das transcrições. O VS Code guarda IDs, associações, títulos e preferências necessários para reconstruir a visualização.
- O formato dos registros é interno do Claude e pode mudar. Dados desconhecidos são sinalizados; sessões sem registro local não podem ser acompanhadas por essa leitura.
- A escolha entre **nova tarefa** e **continuação** é explícita; o painel não adivinha essa intenção pelo nome de uma pasta.
- Ações internas de subagentes ainda não aparecem como cartões próprios.
- Comentários só aparecem quando há texto público associado. O painel não inventa justificativas ou alterações ausentes dos registros.
- Explicações Gemini são interpretações e podem errar. O cache fica em memória enquanto a extensão estiver ativa.
- **Exportação para auditoria não está implementada nesta versão.** A ideia fica para uma evolução futura; o painel não é uma certificação de auditoria.

## Ideias para depois — ainda não disponíveis

- **Explicar tarefa inteira:** um botão para o Gemini resumir o objetivo, as ações, as correções, os resultados registrados e o que falta verificar. Somente a tarefa selecionada, por solicitação do usuário, com limites de envio e indicação de dados omitidos; nunca toda a conta ou sessões de outros projetos.
- **Exportar tarefa:** salvar um registro para consulta e comparação, sem tratar o arquivo como prova de sucesso ou certificação de auditoria.

Estas são possibilidades futuras. A versão 0.8.3 explica individualmente as etapas, e a exportação não está implementada.

## Para explorar e contribuir

- [Instalação, tarefas, Gemini e dúvidas comuns](docs/como-usar.md)
- [Arquitetura atual, testes e desenvolvimento](docs/desenvolvimento.md)
- [Referências e ferramentas relacionadas](docs/referencias.md)
- [Histórico de mudanças](CHANGELOG.md)
- [Reportar um problema ou sugerir melhoria](https://github.com/alosiolemos/claude-task-viewer/issues)

Ao abrir uma issue, informe a versão e descreva o que esperava ver. Não envie chaves, transcrições completas ou screenshots com dados privados.

**Nome do repositório:** Claude Task Viewer. O nome interno da extensão e dos instaladores continua `painel-execucao`, preservando a identidade das instalações existentes.

Projeto independente, inspirado em fluxos visuais como os do n8n. Sem vínculo oficial com Anthropic, Google ou n8n. Os nomes e marcas pertencem aos respectivos titulares. Código sob [licença MIT](LICENSE).
