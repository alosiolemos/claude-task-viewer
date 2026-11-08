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
var currentExecutionId = "exec-" + Date.now();
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
    const distUri = panel.webview.asWebviewUri(
      vscode.Uri.joinPath(context.extensionUri, "webview", "dist")
    );
    htmlString = htmlString.replace(/href="\/assets\//g, `href="${distUri.toString()}/assets/`);
    htmlString = htmlString.replace(/src="\/assets\//g, `src="${distUri.toString()}/assets/`);
    panel.webview.html = htmlString;
  } catch (e) {
    panel.webview.html = `<html><body>
      <p>\u274C Erro ao carregar Painel Execu\xE7\xE3o</p>
      <p>Execute: cd webview && npm run build</p>
    </body></html>`;
  }
  panel.webview.onDidReceiveMessage(async (message) => {
    switch (message.command) {
      case "load-workflow":
        const events = await eventReader.readEvents();
        const workflow = convertEventsToWorkflow(events);
        if (workflow) {
          panel?.webview.postMessage({
            command: "workflow-loaded",
            workflow
          });
        }
        break;
    }
  });
  const refreshInterval = setInterval(async () => {
    if (!panel) {
      clearInterval(refreshInterval);
      return;
    }
    const events = await eventReader.readEvents();
    const workflow = convertEventsToWorkflow(events);
    if (workflow) {
      panel.webview.postMessage({
        command: "workflow-updated",
        workflow
      });
    }
  }, 2e3);
  panel.onDidDispose(() => {
    panel = void 0;
    clearInterval(refreshInterval);
  });
}
function convertEventsToWorkflow(events) {
  if (!events || events.length === 0) {
    return null;
  }
  const stages = [];
  const toolGroups = {};
  let firstEventTime = null;
  events.forEach((evt) => {
    const toolName = evt.event?.tool_name || "Unknown";
    if (!toolGroups[toolName]) {
      toolGroups[toolName] = [];
    }
    toolGroups[toolName].push(evt);
    if (!firstEventTime && evt.timestamp) {
      firstEventTime = new Date(evt.timestamp).getTime();
    }
  });
  let stageIdx = 0;
  Object.entries(toolGroups).forEach(([toolName, toolEvents]) => {
    const stageId = "stage-" + stageIdx;
    const lastEvent = toolEvents[toolEvents.length - 1];
    const hasError = toolEvents.some((e) => e.event?.error);
    stages.push({
      id: stageId,
      name: toolName,
      description: `${toolEvents.length} chamada(s)`,
      state: hasError ? "failed" : "completed",
      actions: toolEvents.map((evt) => ({
        toolUseId: evt.event?.tool_use_id,
        toolName: evt.event?.tool_name,
        input: evt.event?.tool_input || {},
        output: evt.event?.tool_response || {},
        status: evt.event?.error ? "failed" : "success",
        timestamp: new Date(evt.timestamp)
      })),
      input: toolEvents[0]?.event?.tool_input,
      output: lastEvent?.event?.tool_response,
      error: lastEvent?.event?.error || void 0,
      startedAt: new Date(toolEvents[0]?.timestamp),
      endedAt: new Date(lastEvent?.timestamp)
    });
    stageIdx++;
  });
  const executionId = currentExecutionId;
  return {
    id: "run-real-" + executionId,
    projectName: "painel-execucao",
    demandId: "demand-real",
    executionId,
    workflow: {
      id: "workflow-real",
      name: "Execu\xE7\xE3o em Tempo Real",
      description: `${events.length} evento(s) capturado(s)`,
      stageIds: stages.map((s) => s.id)
    },
    stages,
    captureSource: "real",
    createdAt: new Date(firstEventTime || Date.now()),
    updatedAt: /* @__PURE__ */ new Date()
  };
}
function deactivate() {
}
export {
  activate,
  deactivate
};
