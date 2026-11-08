// src/extension.ts
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

// src/extension.ts
var panel;
var eventReader = new EventReader();
function activate(context) {
  const command = vscode.commands.registerCommand("painel-execucao.open", () => {
    openPanel(context);
  });
  context.subscriptions.push(command);
  console.log("Painel Execu\xE7\xE3o ativado");
}
async function openPanel(context) {
  if (panel) {
    panel.reveal(vscode.ViewColumn.Beside);
    return;
  }
  panel = vscode.window.createWebviewPanel(
    "painel-execucao-canvas",
    "Painel Execu\xE7\xE3o \u2014 Workflow",
    vscode.ViewColumn.Beside,
    {
      enableScripts: true,
      retainContextWhenHidden: true,
      localResourceRoots: [
        vscode.Uri.joinPath(context.extensionUri, "webview", "dist")
      ]
    }
  );
  panel.iconPath = vscode.Uri.joinPath(context.extensionUri, "resources", "icon.svg");
  const htmlPath = vscode.Uri.joinPath(context.extensionUri, "webview", "dist", "index.html");
  try {
    let html = await vscode.workspace.fs.readFile(htmlPath);
    let htmlString = new TextDecoder().decode(html);
    const baseUri = vscode.Uri.joinPath(context.extensionUri, "webview", "dist");
    htmlString = htmlString.replace(/href="\//g, `href="${baseUri.with({ scheme: "vscode-resource" })}/`);
    htmlString = htmlString.replace(/src="\//g, `src="${baseUri.with({ scheme: "vscode-resource" })}/`);
    panel.webview.html = htmlString;
  } catch (e) {
    panel.webview.html = `<html><body>
      <p>\u274C Erro ao carregar Painel Execu\xE7\xE3o</p>
      <p>Execute: npm run web:build</p>
    </body></html>`;
  }
  panel.webview.onDidReceiveMessage(async (message) => {
    switch (message.command) {
      case "load-workflow":
        const events = await eventReader.readEvents();
        panel?.webview.postMessage({
          command: "workflow-loaded",
          workflow: convertEventsToWorkflow(events)
        });
        break;
    }
  });
  const refreshInterval = setInterval(async () => {
    if (!panel) {
      clearInterval(refreshInterval);
      return;
    }
    const events = await eventReader.readEvents();
    panel.webview.postMessage({
      command: "workflow-updated",
      workflow: convertEventsToWorkflow(events)
    });
  }, 2e3);
  panel.onDidDispose(() => {
    panel = void 0;
    clearInterval(refreshInterval);
  });
}
function convertEventsToWorkflow(events) {
  return {
    id: "run-real-" + Date.now(),
    projectName: "painel-execucao",
    demandId: "demand-real",
    executionId: "exec-" + Date.now(),
    workflow: {
      id: "workflow-real",
      name: "Execu\xE7\xE3o em Tempo Real",
      description: "Eventos capturados do Claude Code",
      stageIds: events.map((_, i) => "stage-" + i)
    },
    stages: events.map((evt, idx) => ({
      id: "stage-" + idx,
      name: evt.event.tool_name || "Ferramenta",
      description: evt.event.tool_use_id?.substring(0, 20),
      state: "completed",
      actions: [
        {
          toolUseId: evt.event.tool_use_id,
          toolName: evt.event.tool_name,
          input: evt.event.tool_input || {},
          output: evt.event.tool_response || {},
          status: "success",
          timestamp: new Date(evt.timestamp)
        }
      ],
      startedAt: new Date(evt.timestamp),
      endedAt: new Date(evt.timestamp),
      output: evt.event.tool_response
    })),
    captureSource: "real",
    createdAt: /* @__PURE__ */ new Date(),
    updatedAt: /* @__PURE__ */ new Date()
  };
}
function deactivate() {
}
export {
  activate,
  deactivate
};
