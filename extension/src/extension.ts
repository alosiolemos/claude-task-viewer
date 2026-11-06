import * as vscode from 'vscode';
import { PainelProvider } from './painel-provider';

export function activate(context: vscode.ExtensionContext) {
  const provider = new PainelProvider(context.extensionUri);

  const view = vscode.window.registerWebviewViewProvider(
    'painel-execucao.view',
    provider,
    {
      webviewOptions: {
        retainContextWhenHidden: true,
      },
    }
  );

  context.subscriptions.push(view);

  console.log('Painel Execução ativado');
}

export function deactivate() {}
