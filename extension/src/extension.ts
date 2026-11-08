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

    // Substituir caminhos de recursos
    const baseUri = vscode.Uri.joinPath(context.extensionUri, 'webview', 'dist');
    htmlString = htmlString.replace(/href="\//g, `href="${baseUri.with({ scheme: 'vscode-resource' })}/`);
    htmlString = htmlString.replace(/src="\//g, `src="${baseUri.with({ scheme: 'vscode-resource' })}/`);

    panel.webview.html = htmlString;
  } catch (e) {
    panel.webview.html = `<html><body>
      <p>❌ Erro ao carregar Painel Execução</p>
      <p>Execute: npm run web:build</p>
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

/**
 * Converter eventos JSONL para estrutura de workflow
 */
function convertEventsToWorkflow(events: any[]) {
  return {
    id: 'run-real-' + Date.now(),
    projectName: 'painel-execucao',
    demandId: 'demand-real',
    executionId: 'exec-' + Date.now(),
    workflow: {
      id: 'workflow-real',
      name: 'Execução em Tempo Real',
      description: 'Eventos capturados do Claude Code',
      stageIds: events.map((_, i) => 'stage-' + i),
    },
    stages: events.map((evt, idx) => ({
      id: 'stage-' + idx,
      name: evt.event.tool_name || 'Ferramenta',
      description: evt.event.tool_use_id?.substring(0, 20),
      state: 'completed',
      actions: [
        {
          toolUseId: evt.event.tool_use_id,
          toolName: evt.event.tool_name,
          input: evt.event.tool_input || {},
          output: evt.event.tool_response || {},
          status: 'success',
          timestamp: new Date(evt.timestamp),
        },
      ],
      startedAt: new Date(evt.timestamp),
      endedAt: new Date(evt.timestamp),
      output: evt.event.tool_response,
    })),
    captureSource: 'real',
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

export function deactivate() {}
