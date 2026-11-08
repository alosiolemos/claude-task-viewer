import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { EventReader } from './event-reader';

let panel: vscode.WebviewPanel | undefined;
const eventReader = new EventReader();
let currentExecutionId = 'exec-' + Date.now();

export function activate(context: vscode.ExtensionContext) {
  // Registrar comando para abrir painel
  const command = vscode.commands.registerCommand('painel-execucao.open', () => {
    openPanel(context);
  });

  context.subscriptions.push(command);

  // Auto-abrir painel ao ativar extensão (opcional)
  // openPanel(context);

  console.log('Painel Execução ativado');
}

async function openPanel(context: vscode.ExtensionContext) {
  if (panel) {
    panel.reveal(vscode.ViewColumn.Beside);
    return;
  }

  panel = vscode.window.createWebviewPanel(
    'painel-execucao-canvas',
    'Painel Execução — Workflow',
    vscode.ViewColumn.Beside,
    {
      enableScripts: true,
      retainContextWhenHidden: true,
      localResourceRoots: [
        vscode.Uri.joinPath(context.extensionUri, 'webview', 'dist'),
      ],
    }
  );

  // Definir ícone
  panel.iconPath = vscode.Uri.joinPath(context.extensionUri, 'resources', 'icon.svg');

  // Carregar HTML
  const htmlPath = vscode.Uri.joinPath(context.extensionUri, 'webview', 'dist', 'index.html');
  try {
    let html = await vscode.workspace.fs.readFile(htmlPath);
    let htmlString = new TextDecoder().decode(html);

    // Substituir caminhos de recursos com webview URI scheme
    const distUri = panel.webview.asWebviewUri(
      vscode.Uri.joinPath(context.extensionUri, 'webview', 'dist')
    );
    htmlString = htmlString.replace(/href="\/assets\//g, `href="${distUri.toString()}/assets/`);
    htmlString = htmlString.replace(/src="\/assets\//g, `src="${distUri.toString()}/assets/`);

    panel.webview.html = htmlString;
  } catch (e) {
    panel.webview.html = `<html><body>
      <p>❌ Erro ao carregar Painel Execução</p>
      <p>Execute: cd webview && npm run build</p>
    </body></html>`;
  }

  // Lidar com mensagens do webview
  panel.webview.onDidReceiveMessage(async (message) => {
    switch (message.command) {
      case 'load-workflow':
        const events = await eventReader.readEvents();
        const workflow = convertEventsToWorkflow(events);
        if (workflow) {
          panel?.webview.postMessage({
            command: 'workflow-loaded',
            workflow,
          });
        }
        break;
    }
  });

  // Auto-refresh
  const refreshInterval = setInterval(async () => {
    if (!panel) {
      clearInterval(refreshInterval);
      return;
    }
    const events = await eventReader.readEvents();
    const workflow = convertEventsToWorkflow(events);
    if (workflow) {
      panel.webview.postMessage({
        command: 'workflow-updated',
        workflow,
      });
    }
  }, 2000);

  // Limpar ao fechar
  panel.onDidDispose(() => {
    panel = undefined;
    clearInterval(refreshInterval);
  });
}

function inferDemandTitle(events: any[]): string {
  const files = events
    .map((e) => e.event?.tool_input?.file_path?.toLowerCase() || '')
    .filter((f) => f);

  if (files.some((f) => f.includes('auditoria'))) return 'Auditoria';
  if (files.some((f) => f.includes('teste'))) return 'Teste';
  if (files.some((f) => f.includes('processamento'))) return 'Processamento';
  return 'Execução em Tempo Real';
}

function groupEventsIntoStages(events: any[]): any[] {
  const stages: any[] = [];
  const stageMap: { [key: string]: any[] } = {};

  events.forEach((evt: any) => {
    const filePath = evt.event?.tool_input?.file_path?.toLowerCase() || '';
    const toolName = evt.event?.tool_name || 'Unknown';
    let stageKey = toolName;

    if (filePath.includes('entrada') && toolName === 'Write') stageKey = '1-criar-entrada';
    else if (filePath.includes('entrada') || filePath.includes('ativos') || filePath.includes('excluido')) stageKey = '2-processar';
    else if ((toolName === 'Read') && (filePath.includes('ativos') || filePath.includes('excluido'))) stageKey = '3-validar';
    else if (filePath.includes('relatorio') || filePath.includes('report')) stageKey = '4-gerar-relatorio';

    if (!stageMap[stageKey]) stageMap[stageKey] = [];
    stageMap[stageKey].push(evt);
  });

  let stageIdx = 0;
  Object.entries(stageMap)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .forEach(([key, evts]: [string, any]) => {
      const stageId = 'stage-' + stageIdx;
      const lastEvent = (evts as any[])[evts.length - 1];
      const firstEvent = (evts as any[])[0];
      const hasError = (evts as any[]).some((e: any) => e.event?.error);

      let stageName = key.split('-').pop() || key;
      if (key.includes('criar-entrada')) stageName = 'Criar Entrada';
      else if (key.includes('processar')) stageName = 'Processar Registros';
      else if (key.includes('validar')) stageName = 'Validar Resultado';
      else if (key.includes('gerar-relatorio')) stageName = 'Gerar Relatório';
      else if (firstEvent?.event?.tool_input?.file_path) {
        const fileName = firstEvent.event.tool_input.file_path.split(/[\\/]/).pop();
        const toolName = firstEvent.event?.tool_name;
        stageName = `${toolName} ${fileName}`;
      }

      stages.push({
        id: stageId,
        name: stageName,
        description: `${(evts as any[]).length} ação(ões)`,
        state: hasError ? 'failed' : 'completed',
        actions: (evts as any[]).map((evt: any) => ({
          toolUseId: evt.event?.tool_use_id,
          toolName: evt.event?.tool_name,
          input: evt.event?.tool_input || {},
          output: evt.event?.tool_response || {},
          status: evt.event?.error ? 'failed' : 'success',
          timestamp: new Date(evt.timestamp),
        })),
        input: firstEvent?.event?.tool_input,
        output: lastEvent?.event?.tool_response,
        error: lastEvent?.event?.error || undefined,
        startedAt: new Date(firstEvent?.timestamp),
        endedAt: new Date(lastEvent?.timestamp),
      });
      stageIdx++;
    });

  return stages;
}

function convertEventsToWorkflow(events: any[]) {
  if (!events || events.length === 0) return null;

  const stages = groupEventsIntoStages(events);
  const demandTitle = inferDemandTitle(events);
  const executionId = currentExecutionId;
  let firstEventTime: number | null = null;

  events.forEach((evt: any) => {
    if (!firstEventTime && evt.timestamp) {
      firstEventTime = new Date(evt.timestamp).getTime();
    }
  });

  return {
    id: 'run-real-' + executionId,
    projectName: 'painel-execucao',
    demandId: 'demand-' + demandTitle.toLowerCase(),
    executionId,
    workflow: {
      id: 'workflow-real',
      name: demandTitle,
      description: `${events.length} evento(s) capturado(s)`,
      stageIds: stages.map((s) => s.id),
    },
    stages,
    captureSource: 'real',
    createdAt: new Date(firstEventTime || Date.now()),
    updatedAt: new Date(),
  };
}

export function deactivate() {}
