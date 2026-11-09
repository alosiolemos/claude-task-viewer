# Claude Task Viewer — produto atual

## Objetivo

Ajudar quem não programa a entender o que o Claude Code está fazendo: qual arquivo leu, o que editou, qual resultado foi registrado e o que ele explicou publicamente.

Este é um visualizador local no VS Code. Não é executor de workflows, orquestrador, editor de arquivos ou certificador de auditoria. A referência visual de fluxos como os do n8n é apenas inspiração, sem vínculo oficial.

## Experiência principal

1. Abrir a pasta e escolher a sessão do Claude.
2. Criar uma tarefa ou continuar a tarefa atual explicitamente.
3. Ver cartões conectados pela ordem observada.
4. Clicar numa ação e abrir os detalhes abaixo do fluxo.
5. Expandir Arquivo, Entrada e Saída / Resultado conforme necessário.
6. Consultar o comentário original e, opcionalmente, pedir uma explicação ao Gemini.

A linguagem deve ser simples. Não presumir conhecimento de JavaScript, Git, JSON ou ferramentas de terminal. Identificadores técnicos e caminhos completos ficam em detalhes secundários.

## Implementação de referência

- Transcrições locais do Claude Code, somente leitura e leitura incremental.
- HTML/CSS/JavaScript e SVG na Webview; sem frontend React em produção.
- Identificação por sessão e associações persistidas de tarefas. Pastas não definem a tarefa.
- Uma aba reutilizável, seleção e navegação preservadas durante atualizações.
- Comentários somente a partir de texto público; não exibir raciocínio interno.
- Gemini opcional por etapa, com chave pessoal no SecretStorage, sanitização e envio explícito.
- Instalação por VSIX pronto, sem pedir npm ou compilação ao usuário.

## Fora da versão 0.8.3

- Explicação com Gemini da tarefa inteira: ideia futura, com limites e revisão do envio.
- Exportação da tarefa selecionada (HTML/JSON) para consulta, implementada na 0.10.0; não é certificação de auditoria.
- Comparador de execuções, plano vs. realizado, suporte completo a subagentes e Codex.
- Mudanças automáticas de tarefa baseadas em interpretação semântica.

## Critérios para evoluir

Preservar simplicidade e o layout aprovado. Dados desconhecidos devem ser sinalizados. Erro de uma ação não prova falha da tarefa inteira; resposta final não prova sucesso. Não reintroduzir infraestrutura desnecessária. Referências atuais: README.md, docs/como-usar.md e docs/desenvolvimento.md.
