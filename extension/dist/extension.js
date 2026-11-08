// src/extension.ts
import * as vscode2 from "vscode";

// src/painel-provider.ts
import * as vscode from "vscode";

// src/event-reader.ts
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
var EventReader = class {
  getEventsPath(projectName = "painel-execucao") {
    const homeDir = os.homedir();
    return path.join(homeDir, ".painel-execucao", "data", projectName, "events.jsonl");
  }
  async readEvents(projectName = "painel-execucao") {
    const eventsPath = this.getEventsPath(projectName);
    if (!fs.existsSync(eventsPath)) {
      return [];
    }
    try {
      const content = fs.readFileSync(eventsPath, "utf8");
      const lines = content.trim().split("\n").filter((l) => l);
      return lines.map((line) => {
        try {
          return JSON.parse(line);
        } catch {
          return null;
        }
      }).filter(Boolean);
    } catch {
      return [];
    }
  }
  async watchEvents(projectName = "painel-execucao", callback) {
    const eventsPath = this.getEventsPath(projectName);
    const watcher = fs.watch(path.dirname(eventsPath), async () => {
      const events = await this.readEvents(projectName);
      callback(events);
    });
    return () => watcher.close();
  }
};

// src/painel-provider.ts
var PainelProvider = class {
  constructor(extensionUri) {
    this.extensionUri = extensionUri;
    this.eventReader = new EventReader();
  }
  extensionUri;
  view;
  eventReader;
  refreshInterval;
  async resolveWebviewView(webviewView) {
    this.view = webviewView;
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this.extensionUri]
    };
    webviewView.webview.html = await this.getWebviewContent();
    webviewView.webview.onDidReceiveMessage((message) => {
      this.handleMessage(message);
    });
    webviewView.onDidChangeVisibility(() => {
      if (webviewView.visible) {
        this.startAutoRefresh();
      } else {
        this.stopAutoRefresh();
      }
    });
    this.startAutoRefresh();
  }
  startAutoRefresh() {
    if (this.refreshInterval) return;
    this.refreshInterval = setInterval(() => {
      this.refreshEvents();
    }, 2e3);
    this.refreshEvents();
  }
  stopAutoRefresh() {
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
      this.refreshInterval = void 0;
    }
  }
  async refreshEvents() {
    const events = await this.eventReader.readEvents();
    this.view?.webview.postMessage({
      command: "events-updated",
      events
    });
  }
  async getWebviewContent() {
    const htmlPath = vscode.Uri.joinPath(
      this.extensionUri,
      "webview",
      "index.html"
    );
    try {
      let html = await vscode.workspace.fs.readFile(htmlPath);
      return new TextDecoder().decode(html);
    } catch (e) {
      return `
        <html>
          <head><title>Painel Execu\xE7\xE3o</title></head>
          <body>
            <p>Webview HTML n\xE3o encontrado.</p>
            <p>Execute: npm run ext:build</p>
          </body>
        </html>
      `;
    }
  }
  async handleMessage(message) {
    switch (message.command) {
      case "load-events":
        const events = await this.eventReader.readEvents();
        this.view?.webview.postMessage({
          command: "events-loaded",
          events
        });
        break;
    }
  }
};

// src/extension.ts
function activate(context) {
  const provider = new PainelProvider(context.extensionUri);
  const view = vscode2.window.registerWebviewViewProvider(
    "painel-execucao.view",
    provider,
    {
      webviewOptions: {
        retainContextWhenHidden: true
      }
    }
  );
  context.subscriptions.push(view);
  console.log("Painel Execu\xE7\xE3o ativado");
}
function deactivate() {
}
export {
  activate,
  deactivate
};
