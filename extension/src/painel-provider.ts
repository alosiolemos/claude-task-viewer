import * as vscode from 'vscode';
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
    const htmlPath = vscode.Uri.joinPath(
      this.extensionUri,
      'webview',
      'dist',
      'index.html'
    );

    try {
      let html = await vscode.workspace.fs.readFile(htmlPath);
      return new TextDecoder().decode(html);
    } catch (e) {
      return `
        <html>
          <head><title>Painel Execução</title></head>
          <body>
            <p>Webview HTML not found. Build the extension first.</p>
            <p>Run: npm run ext:build</p>
          </body>
        </html>
      `;
    }
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
