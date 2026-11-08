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
        const executions = convertAllEventsToExecutions(events);
        if (executions.length > 0) {
          panel?.webview.postMessage({
            command: "workflow-loaded",
            executions
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
    const executions = convertAllEventsToExecutions(events);
    if (executions.length > 0) {
      panel.webview.postMessage({
        command: "workflow-updated",
        executions
      });
    }
  }, 2e3);
  panel.onDidDispose(() => {
    panel = void 0;
    clearInterval(refreshInterval);
  });
}
function inferDemandForEvent(event) {
  const filePath = event.event?.tool_input?.file_path?.toLowerCase() || "";
  if (filePath.includes("teste-auditoria") || filePath.includes("auditoria")) return "Auditoria";
  if (filePath.includes("teste") && !filePath.includes("teste-auditoria")) return "Teste";
  if (filePath.includes("processamento")) return "Processamento";
  return null;
}
function groupEventsByDemand(events) {
  const grouped = {};
  events.forEach((evt) => {
    const demand = inferDemandForEvent(evt);
    const key = demand || "Eventos n\xE3o associados";
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(evt);
  });
  return grouped;
}
function groupEventsIntoStages(demandTitle, events) {
  const stages = [];
  const stageMap = {};
  events.forEach((evt) => {
    const filePath = evt.event?.tool_input?.file_path?.toLowerCase() || "";
    let stageKey = null;
    if (demandTitle === "Auditoria") {
      if (filePath.includes("entrada") && evt.event?.tool_name === "Write") stageKey = "1-criar-entrada";
      else if (filePath.includes("entrada") && evt.event?.tool_name === "Read") stageKey = "2-processar";
      else if ((filePath.includes("ativos") || filePath.includes("excluido")) && evt.event?.tool_name === "Write") stageKey = "2-processar";
      else if ((filePath.includes("ativos") || filePath.includes("excluido")) && evt.event?.tool_name === "Read") stageKey = "3-validar";
      else if (filePath.includes("relatorio") || filePath.includes("report")) stageKey = "4-gerar-relatorio";
    }
    if (!stageKey) return;
    if (!stageMap[stageKey]) stageMap[stageKey] = [];
    stageMap[stageKey].push(evt);
  });
  let stageIdx = 0;
  Object.entries(stageMap).sort((a, b) => a[0].localeCompare(b[0])).forEach(([key, evts]) => {
    const stageId = "stage-" + stageIdx;
    const lastEvent = evts[evts.length - 1];
    const firstEvent = evts[0];
    const hasError = evts.some((e) => e.event?.error);
    let stageName = "Etapa";
    if (key.includes("criar-entrada")) stageName = "Criar Entrada";
    else if (key.includes("processar")) stageName = "Processar Registros";
    else if (key.includes("validar")) stageName = "Validar Resultado";
    else if (key.includes("gerar-relatorio")) stageName = "Gerar Relat\xF3rio";
    stages.push({
      id: stageId,
      name: stageName,
      description: `${evts.length} a\xE7\xE3o(\xF5es)`,
      state: hasError ? "failed" : "completed",
      actions: evts.map((evt) => ({
        toolUseId: evt.event?.tool_use_id,
        toolName: evt.event?.tool_name,
        input: evt.event?.tool_input || {},
        output: evt.event?.tool_response || {},
        status: evt.event?.error ? "failed" : "success",
        timestamp: new Date(evt.timestamp)
      })),
      input: firstEvent?.event?.tool_input,
      output: lastEvent?.event?.tool_response,
      error: lastEvent?.event?.error || void 0,
      startedAt: new Date(firstEvent?.timestamp),
      endedAt: new Date(lastEvent?.timestamp)
    });
    stageIdx++;
  });
  return stages;
}
function convertEventsToWorkflow(demandTitle, events) {
  if (!events || events.length === 0) return null;
  const stages = groupEventsIntoStages(demandTitle, events);
  const executionId = "exec-" + demandTitle.toLowerCase().replace(/\s+/g, "-") + "-" + Date.now();
  let firstEventTime = null;
  events.forEach((evt) => {
    if (!firstEventTime && evt.timestamp) {
      firstEventTime = new Date(evt.timestamp).getTime();
    }
  });
  return {
    id: "run-real-" + executionId,
    projectName: "painel-execucao",
    demandId: "demand-" + demandTitle.toLowerCase(),
    executionId,
    workflow: {
      id: "workflow-real",
      name: demandTitle,
      description: `${events.length} evento(s) capturado(s)`,
      stageIds: stages.map((s) => s.id)
    },
    stages,
    captureSource: "real",
    createdAt: new Date(firstEventTime || Date.now()),
    updatedAt: /* @__PURE__ */ new Date()
  };
}
function convertAllEventsToExecutions(events) {
  if (!events || events.length === 0) return [];
  const grouped = groupEventsByDemand(events);
  const executions = [];
  for (const [demand, demandEvents] of Object.entries(grouped)) {
    if (demand === "Eventos n\xE3o associados") continue;
    const workflow = convertEventsToWorkflow(demand, demandEvents);
    if (workflow) executions.push(workflow);
  }
  return executions.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}
function deactivate() {
}
export {
  activate,
  deactivate
};
