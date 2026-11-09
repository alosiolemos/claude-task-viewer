# Painel Execução — 0.3.1

Correção da seleção que voltava sozinha, de eventos de teste invisíveis e do empacotamento.

## Instalar
Instale painel-execucao-0.3.1.vsix no VS Code por Extensions > ... > Install from VSIX.
Recarregue a janela após encerrar o trabalho em andamento.
Ctrl+Shift+P > Abrir Painel Execução. A versão aparece no cabeçalho.

## Comportamento
A seleção e os títulos personalizados permanecem durante atualizações e reaberturas.
Read, Write e comandos são exibidos, incluindo eventos fora da auditoria.
A demonstração abre apenas por solicitação explícita.
Eventos com execution_id usam associação explícita. Eventos legados são agrupados por projeto, sessão e pasta completa.
Esse agrupamento histórico não comprova a separação de demandas por pedido.
Ações sem vínculo continuam em “Ações não associadas”.
Conexões só aparecem quando declaradas, não por simples sequência temporal.
Sem evento de término da demanda, o painel informa “Término não informado”.

## Dados e limites
Registros originais ficam em ~/.painel-execucao/data/ e não são apagados.
A interface guarda somente preferências, títulos e seleção; não duplica os eventos no localStorage.
Exibe até 100 execuções e as últimas 120 etapas de cada uma.
Arquivos de eventos maiores que 20 MB são preservados, mas não carregados, com aviso.
Nenhuma integração Gemini, sincronização ou telemetria foi acrescentada.
A extensão não ativa hooks automaticamente: permanece usando a captura já configurada.

## Desenvolvimento
Na raiz: npm install, npm test, npm run build, npm run package.
O empacotamento compila a interface, copia seus assets e usa a versão real do manifesto.
tests/ui-smoke.cjs verifica o aplicativo compilado em navegador com uma ponte VS Code simulada.
Isso não equivale à validação nativa da extensão instalada.

MIT

