import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { EventReader } from './event-reader';

let panel: vscode.WebviewPanel | undefined;
const eventReader = new EventReader();

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
        panel?.webview.postMessage({
          command: 'workflow-loaded',
          workflow: convertEventsToWorkflow(events),
        });
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
    panel.webview.postMessage({
      command: 'workflow-updated',
      workflow: convertEventsToWorkflow(events),
    });
  }, 2000);

  // Limpar ao fechar
  panel.onDidDispose(() => {
    panel = undefined;
    clearInterval(refreshInterval);
  });
}

function convertEventsToWorkflow(events: any[]) {
  if (!events || events.length === 0) {
    return { stages: [] };
  }

  // Agrupar ações por ferramenta
  const stages: any[] = [];
  const toolGroups: { [toolName: string]: any[] } = {};

  events.forEach((evt: any) => {
    const toolName = evt.event?.tool_name || 'Unknown';
    if (!toolGroups[toolName]) {
      toolGroups[toolName] = [];
    }
    toolGroups[toolName].push(evt);
  });

  // Criar stages agrupados
  let stageIdx = 0;
  Object.entries(toolGroups).forEach(([toolName, toolEvents]: [string, any]) => {
    const stageId = 'stage-' + stageIdx;
    const lastEvent = (toolEvents as any[])[toolEvents.length - 1];

    stages.push({
      id: stageId,
      name: toolName,
      description: `${(toolEvents as any[]).length} execução(ões)`,
      state: lastEvent?.event?.error ? 'failed' : 'completed',
      actions: (toolEvents as any[]).map((evt: any) => ({
        toolUseId: evt.event?.tool_use_id,
        toolName: evt.event?.tool_name,
        input: evt.event?.tool_input || {},
        output: evt.event?.tool_response || evt.event?.error || {},
        status: evt.event?.error ? 'failed' : 'success',
        timestamp: new Date(evt.timestamp),
      })),
      input: (toolEvents as any[])[0]?.event?.tool_input,
      output: lastEvent?.event?.tool_response,
      error: lastEvent?.event?.error,
      startedAt: new Date((toolEvents as any[])[0]?.timestamp),
      endedAt: new Date(lastEvent?.timestamp),
    });
    stageIdx++;
  });

  return {
    id: 'run-real-' + Date.now(),
    projectName: 'painel-execucao',
    demandId: 'demand-real',
    executionId: 'exec-' + Date.now(),
    workflow: {
      id: 'workflow-real',
      name: 'Execução em Tempo Real',
      description: 'Eventos capturados do Claude Code',
      stageIds: stages.map((s) => s.id),
    },
    stages,
    captureSource: 'real',
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

export function deactivate() {}
