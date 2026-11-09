# Visualização Modular de Execução das Tarefas do Claude — 0.8.3

Mostra, em cartões conectados dentro do VS Code, o que o Claude Code fez em cada tarefa: pedidos, leituras, edições, comandos, erros e respostas. Inspirada em visualizações de workflow como as do n8n, sem vínculo com o n8n.

## Instalar e abrir
1. Extensões › … › Instalar a partir do VSIX › `painel-execucao-0.8.3.vsix`.
2. Abra a pasta do projeto onde o Claude Code trabalha.
3. Ctrl+Shift+P › **Abrir Visualização de Execução do Claude**.

## Como funciona
- Lê diretamente a transcrição local do Claude Code (`~/.claude/projects/<projeto>/<sessão>.jsonl`, ou `CLAUDE_CONFIG_DIR`). Só leitura: nada é alterado nem copiado.
- Lê apenas as linhas novas, a cada 1,5 s (`painel-execucao.refreshInterval`).
- Se a pasta não for detectada, defina `painel-execucao.transcriptsDir` ou use o botão exibido no painel.
- **Trocar sessão** escolhe outra transcrição do projeto; o título vem do próprio Claude Code.

## Tarefas
- O que já existia na transcrição ao abrir o painel pela primeira vez fica em **Histórico legado**.
- Novas ações entram na **tarefa atual**. Mensagens de correção continuam a mesma tarefa.
- **Nova tarefa**: as próximas ações vão para uma nova tarefa. **Continuar esta tarefa**: torna atual a tarefa exibida.
- **Ocultar tarefas** / **Mostrar tarefas** recolhe a lista para dar mais espaço ao fluxo. A preferência fica salva e a seleção não muda.
- Associações, nomes, seleção e preferências ficam salvos no VS Code (somente IDs, sem cópia da transcrição).

## Detalhes da etapa
- Clique em um cartão: os detalhes abrem na parte inferior, em toda a largura da área de trabalho, sem cobrir o histórico.
- Altura ajustável pelo puxador (ou pelas setas do teclado), com recolher e fechar.
- Cabeçalho com ícone, ação, nome curto do arquivo e estado.
- Três colunas, cada uma com um único agrupador recolhido por padrão:
  - **ARQUIVO** → “Ver detalhes do arquivo”: nome legível, caminho completo e botão para copiar.
  - **ENTRADA** → “Ver detalhes da entrada”: descrição, parâmetros e, em edições, trecho antes e depois.
  - **SAÍDA / RESULTADO** → “Ver detalhes do resultado”: retorno registrado, alteração registrada ou erro.
  - Sem dados aparece “Não se aplica” ou “Sem resultado registrado”, sem botão vazio.
- Trechos muito longos aparecem integrais ao expandir; “Mostrar tudo” continua disponível para textos muito grandes.
- **Comentário do Claude** (recolhido por padrão): texto público escrito na mesma mensagem da ação, nunca raciocínio interno. Quando a mesma resposta traz várias ações, o rótulo é **Comentário da rodada**. O ícone ⓘ mostra a explicação, por passar o mouse, pelo teclado ou por toque.
- **Explicação com Gemini** (opcional, aberta por padrão, com botão “Explicar esta etapa” sempre acessível e selo “Gerada por IA” abaixo do título). O ícone ⓘ mostra o que é a explicação.
- **Detalhes técnicos** recolhidos por padrão.
- Cada seção guarda seu estado aberto/fechado por etapa; expandir, recolher ou abrir tooltips nunca chama o Gemini. Ícones e marcas são SVG locais, sem serviços externos.
- Atualizações não fecham os detalhes nem trocam a etapa selecionada.

## Explicação com Gemini (opcional)
- Sem chave, o painel funciona normalmente.
- **Configurações** › Gemini › **Adicionar chave**: a chave é digitada em caixa de senha e guardada no SecretStorage do VS Code. Nunca aparece na interface, nos registros ou no repositório. A tela mostra só “Configurado” ou “Não configurado”.
- Use sua própria chave. Ao solicitar uma explicação, os dados selecionados desta etapa serão enviados ao Gemini. O uso está sujeito às cotas e condições da sua conta.
- A explicação só é gerada quando você clica em **Explicar esta etapa**, para a etapa selecionada. Na primeira vez, uma confirmação mostra o que será enviado.
- Envia somente: nome da ferramenta, arquivo, entrada, resultado da etapa e o comentário público do Claude associado a ela (sem raciocínio interno), sanitizados (caminho do usuário removido, credenciais redigidas) e limitados a 2.000 caracteres cada. Não envia a conversa nem as mensagens do usuário.
- Um modelo (`gemini-2.5-flash`), uma chamada por pedido, sem novas tentativas e sem fallback pago. Uma etapa já explicada não é enviada de novo enquanto não mudar.
- O texto é identificado como explicação gerada por IA e separa o que foi feito, o resultado e o que isso significa. Se faltarem dados, o painel diz isso.
- **Remover chave** desativa a integração.

## Limites
- O formato da transcrição é interno do Claude Code e pode mudar; o painel avisa quando não reconhece o formato e não interpreta dados desconhecidos.
- “Respondeu ao usuário” indica o fim da rodada, não que o trabalho passou em testes.
- Linhas tracejadas mostram a ordem observada, não dependência entre ações.
- Ações de subagentes não aparecem como cartões próprios.
- As explicações ficam em memória enquanto a extensão estiver ativa.

MIT

## Apresentação e screenshots

[Claude Task Viewer no GitHub](https://github.com/alosiolemos/claude-task-viewer) — guia visual para quem quer entender as ações do Claude sem dominar programação. O nome interno da extensão permanece painel-execucao.
