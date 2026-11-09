import * as vscode from 'vscode';
import * as path from 'path';
import { TranscriptReader } from './transcript-reader';
import { TaskManager, Task } from './task-manager';

export function activate(context: vscode.ExtensionContext) {
  let panel: vscode.WebviewPanel | undefined;
  let reader: TranscriptReader | undefined;
  let taskManager: TaskManager | undefined;
  let sessionId: string = '';

  const open = async () => {
    if (panel) {
      panel.reveal(vscode.ViewColumn.Beside);
      return;
    }

    // Solicitar sesão ao usuário
    const workspaceFolders = vscode.workspace.workspaceFolders;
    const selectedFolder = workspaceFolders?.[0];

    if (!selectedFolder) {
      vscode.window.showErrorMessage('Abra uma pasta no VS Code para usar o Painel Execução');
      return;
    }

    const folderName = selectedFolder.uri.fsPath.split(/[\\\/]/).pop() || 'Projetos';

    panel = vscode.window.createWebviewPanel(
      'painel-execucao',
      'Painel Execução',
      vscode.ViewColumn.Beside,
      { enableScripts: true, retainContextWhenHidden: true }
    );

    // Carregar HTML
    try {
      const htmlPath = vscode.Uri.joinPath(context.extensionUri, 'webview', 'painel.html');
      const htmlContent = new TextDecoder().decode(await vscode.workspace.fs.readFile(htmlPath));
      panel.webview.html = htmlContent;
    } catch (e) {
      panel.webview.html = '<h1>Erro ao carregar interface</h1>';
    }

    // Criar leitor
    sessionId = vscode.env.sessionId || '';
    reader = new TranscriptReader(sessionId, folderName);
    taskManager = new TaskManager(() => {
      const tasks = taskManager!.getAllTasks();
      const currentTask = taskManager!.getCurrentTask();
      panel?.webview.postMessage({
        command: 'update-tasks',
        tasks: tasks.map(t => ({
          ...t,
          createdAt: t.createdAt.toISOString(),
        })),
        currentTaskId: currentTask?.id || null,
      });
    });

    let refreshTimer: NodeJS.Timeout | undefined;

    const refresh = async () => {
      const result = await reader!.readNewRecords();
      if (result?.error) {
        panel?.webview.postMessage({
          command: 'error',
          message: result.error,
        });
        return;
      }

      if (result?.actions && result.actions.length > 0) {
        taskManager!.addActions(result.actions);
      }
    };

    panel.webview.onDidReceiveMessage(async message => {
      if (message.command === 'init') {
        await refresh();
      } else if (message.command === 'refresh') {
        await refresh();
      } else if (message.command === 'new-task') {
        const title = await vscode.window.showInputBox({
          prompt: 'Nome da nova tarefa',
          value: 'Nova tarefa',
        });
        if (title) {
          taskManager!.startNewTask(title);
        }
      } else if (message.command === 'continue-task') {
        taskManager!.continueCurrentTask();
      }
    });

    // Auto-refresh a cada 2 segundos
    refreshTimer = setInterval(refresh, 2000);

    panel.onDidDispose(() => {
      if (refreshTimer) clearInterval(refreshTimer);
      panel = undefined;
      reader = undefined;
      taskManager = undefined;
    });
  };

  context.subscriptions.push(vscode.commands.registerCommand('painel-execucao.open', open));
}

export function deactivate() {}
