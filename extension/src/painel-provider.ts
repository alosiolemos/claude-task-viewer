import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { EventReader } from './event-reader';

export class PainelProvider implements vscode.WebviewViewProvider {
  private view?: vscode.WebviewView;
  private eventReader: EventReader;

  constructor(private extensionUri: vscode.Uri) {
    this.eventReader = new EventReader();
  }

  async resolveWebviewView(webviewView: vscode.WebviewView) {
    this.view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this.extensionUri],
    };

    webviewView.webview.html = await this.getWebviewContent();

    webviewView.webview.onDidReceiveMessage((message) => {
      this.handleMessage(message);
    });
  }

  private async getWebviewContent(): Promise<string> {
    const webviewUri = this.view?.webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, 'webview', 'dist', 'index.html')
    );

    return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Painel Execução</title>
  <script>const vscodeApi = acquireVsCodeApi();</script>
  <link rel="stylesheet" href="${this.view?.webview.asWebviewUri(
    vscode.Uri.joinPath(this.extensionUri, 'webview', 'dist', 'style.css')
  )}">
</head>
<body>
  <div id="root"></div>
  <script src="${this.view?.webview.asWebviewUri(
    vscode.Uri.joinPath(this.extensionUri, 'webview', 'dist', 'index.js')
  )}"></script>
</body>
</html>`;
  }

  private async handleMessage(message: any) {
    switch (message.command) {
      case 'load-events':
        const events = await this.eventReader.readEvents();
        this.view?.webview.postMessage({
          command: 'events-loaded',
          events,
        });
        break;
    }
  }
}
