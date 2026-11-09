// src/extension.ts
import * as vscode from "vscode";
import { randomBytes } from "node:crypto";

// src/event-reader.ts
import { promises as fs } from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
var EventReader = class {
  lastIssue = "";
  async readEvents() {
    const root = path.join(os.homedir(), ".painel-execucao", "data");
    this.lastIssue = "";
    let folders;
    try {
      folders = await fs.readdir(root, { withFileTypes: true });
    } catch (error) {
      if (error.code === "ENOENT") return [];
      throw error;
    }
    const events = [];
    for (const folder of folders) {
      if (!folder.isDirectory() || folder.isSymbolicLink()) continue;
      const file = path.join(root, folder.name, "events.jsonl");
      try {
        const stat = await fs.stat(file);
        if (stat.size > 20 * 1024 * 1024) {
          this.lastIssue = "Um hist\xF3rico excede 20 MB e n\xE3o foi carregado. Seus arquivos foram preservados.";
          continue;
        }
        const text = await fs.readFile(file, "utf8");
        for (const line of text.split("\n")) {
          if (!line.trim()) continue;
          try {
            const record = JSON.parse(line);
            if (record && typeof record === "object" && record.event && typeof record.event === "object") {
              events.push({ ...record, projectName: record.projectName || folder.name });
            }
          } catch {
            this.lastIssue = "H\xE1 linhas incompletas ou inv\xE1lidas nos registros; os demais eventos foram carregados.";
          }
        }
      } catch (error) {
        if (error.code !== "ENOENT") throw error;
      }
    }
    return events;
  }
};

// src/executions.ts
import { createHash } from "node:crypto";
var hash = (value) => createHash("sha256").update(value).digest("hex").slice(0, 20);
var norm = (value) => typeof value === "string" ? value.replace(/\\/g, "/").replace(/\/+/g, "/") : "";
var base = (value) => value.split("/").filter(Boolean).pop() || "";
var time = (value) => {
  const n = Date.parse(String(value || ""));
  return Number.isFinite(n) ? n : 0;
};
var failure = (e) => e.hook_event_name === "PostToolUseFailure" || !!e.error || e.tool_response?.isError === true || e.tool_response?.status === "error" || typeof e.tool_response?.exitCode === "number" && e.tool_response.exitCode !== 0;
function legacyTitle(folder) {
  const leaf = base(folder);
  if (leaf === "teste-auditoria") return "Auditoria \u2014 10 registros";
  if (leaf === "teste-refresh") return "Teste refresh";
  return leaf ? leaf.replace(/[-_]/g, " ") : "A\xE7\xF5es n\xE3o associadas";
}
function describe(e) {
  const file = base(norm(e.tool_input?.file_path || e.tool_input?.path));
  const tool = e.tool_name || "A\xE7\xE3o";
  if (tool === "Read") return file ? "Ler " + file : "Ler arquivo";
  if (tool === "Write") return file ? "Criar " + file : "Criar arquivo";
  if (tool === "Edit") return file ? "Editar " + file : "Editar arquivo";
  if (tool === "Bash" || tool === "PowerShell") {
    const command = String(e.tool_input?.command || "").replace(/\s+/g, " ").trim();
    return "Executar " + (command ? command.slice(0, 65) : "comando");
  }
  return tool === "Grep" ? "Buscar texto" : tool === "Glob" ? "Localizar arquivos" : tool;
}
function buildExecutions(records) {
  const groups = /* @__PURE__ */ new Map();
  const active = /* @__PURE__ */ new Map();
  const sorted = records.filter((r) => r && r.event && typeof r.event === "object").slice().sort((a, b) => time(a.timestamp) - time(b.timestamp));
  for (const record of sorted) {
    const e = record.event;
    const project = String(record.projectName || "Projeto");
    const session = String(e.session_id || "legado");
    const context = project + "|" + session;
    if (e.hook_event_name === "UserPromptSubmit") {
      active.set(context, {
        id: String(e.execution_id || "prompt-" + hash(context + "|" + record.timestamp)),
        title: String(e.execution_title || e.prompt || "Nova demanda").split("\n")[0].slice(0, 100)
      });
    }
    let explicit = e.execution_id || e.executionId || record.executionId;
    if (!explicit && session !== "legado") {
      const active_exec = active.get(context)?.id;
      if (active_exec) explicit = active_exec;
    }
    const file = norm(e.tool_input?.file_path || e.tool_input?.path);
    const folder = file.includes("/") ? file.slice(0, file.lastIndexOf("/")) : "";
    const key = explicit ? context + "|execution|" + explicit : context + "|folder|" + folder;
    if (!groups.has(key)) groups.set(key, {
      project,
      title: String(e.execution_title || active.get(context)?.title || legacyTitle(folder)),
      explicit: !!explicit,
      events: []
    });
    groups.get(key).events.push(record);
  }
  const runs = [];
  for (const [key, group] of groups) {
    const actions = /* @__PURE__ */ new Map();
    for (const record of group.events) {
      const e = record.event;
      if (!e.tool_name) continue;
      const id = String(e.tool_use_id || "record-" + hash(JSON.stringify(record)));
      const previous = actions.get(id);
      if (previous) previous.last = record;
      else actions.set(id, { first: record, last: record });
    }
    if (!actions.size) continue;
    const executionId = "exec-" + hash(key);
    const stages = /* @__PURE__ */ new Map();
    for (const [callId, pair] of actions) {
      const e = pair.last.event;
      const declaredStage = e.step_id || e.stage_id;
      const stageId = declaredStage ? executionId + "-step-" + hash(String(declaredStage)) : executionId + "-call-" + hash(callId);
      const pending = e.hook_event_name === "PreToolUse";
      const failed = failure(e);
      const action = {
        toolUseId: callId,
        toolName: String(e.tool_name),
        input: e.tool_input || {},
        output: e.tool_response || (e.error ? { error: e.error } : {}),
        status: failed ? "error" : pending ? "pending" : "success",
        timestamp: new Date(time(pair.last.timestamp))
      };
      if (!stages.has(stageId)) stages.set(stageId, {
        id: stageId,
        name: String(e.step_name || e.stage_name || describe(e)),
        description: declaredStage ? "Etapa declarada pelo agente." : "A\xE7\xE3o capturada. V\xEDnculo de etapa n\xE3o informado.",
        state: pending ? "running" : failed ? "failed" : "completed",
        actions: [],
        startedAt: pair.first.event?.hook_event_name === "PreToolUse" ? new Date(time(pair.first.timestamp)) : void 0
      });
      const stage = stages.get(stageId);
      stage.actions.push(action);
      stage.input ??= action.input;
      stage.output = action.output;
      if (failed) {
        stage.state = "failed";
        stage.error = String(e.error || e.tool_response?.error || "A ferramenta informou erro.");
      } else if (pending && stage.state !== "failed") stage.state = "running";
      if (!pending) stage.endedAt = new Date(time(pair.last.timestamp));
    }
    const entries = [...actions.values()];
    const hasError = entries.some((p) => failure(p.last.event));
    const hasPending = entries.some((p) => p.last.event?.hook_event_name === "PreToolUse");
    const ended = group.events.some((r) => ["Stop", "execution_end"].includes(r.event?.hook_event_name || r.event?.type));
    const state = hasError ? "failed" : hasPending ? "running" : ended ? "completed" : "waiting";
    const first = Math.min(...group.events.map((r) => time(r.timestamp)));
    const last = Math.max(...group.events.map((r) => time(r.timestamp)));
    const source = group.events.every((r) => r.event?.session_id && r.event?.hook_event_name) ? "real" : "unverified";
    const allStages = [...stages.values()];
    const shown = allStages.slice(-120);
    runs.push({
      id: executionId,
      executionId,
      demandId: executionId,
      projectName: group.project,
      workflow: { id: executionId, name: group.title, description: group.explicit ? "Execu\xE7\xE3o identificada pelo agente." : "Hist\xF3rico agrupado por sess\xE3o e pasta; a demanda n\xE3o foi declarada.", stageIds: shown.map((s) => s.id) },
      title: group.title,
      summary: actions.size + " a\xE7\xE3o(\xF5es) capturada(s)" + (allStages.length > 120 ? " \xB7 \xFAltimas 120 exibidas" : ""),
      state,
      captureSource: source,
      createdAt: new Date(first),
      updatedAt: new Date(last),
      stages: shown,
      totalActions: actions.size,
      association: group.explicit ? "explicit" : "historical"
    });
  }
  return runs.sort((a, b) => time(b.updatedAt) - time(a.updatedAt) || a.executionId.localeCompare(b.executionId));
}

// src/extension.ts
function activate(context) {
  let panel;
  const reader = new EventReader();
  const open = async () => {
    if (panel) {
      panel.reveal(vscode.ViewColumn.Beside);
      return;
    }
    const view = vscode.window.createWebviewPanel("painel-execucao-canvas", "Painel Execu\xE7\xE3o \u2014 Workflow", vscode.ViewColumn.Beside, {
      enableScripts: true,
      retainContextWhenHidden: true,
      localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, "webview", "dist")]
    });
    panel = view;
    let disposed = false;
    let reading = false;
    let previous = "";
    const version = String(context.extension.packageJSON.version);
    const send = async (initial = false) => {
      if (disposed || reading) return;
      reading = true;
      try {
        const events = await reader.readEvents();
        const executions = buildExecutions(events);
        const signature = JSON.stringify({ executions, issue: reader.lastIssue });
        if (initial || signature !== previous) {
          await view.webview.postMessage({ command: initial ? "workflow-loaded" : "workflow-updated", executions, version, issue: reader.lastIssue });
          previous = signature;
        }
      } catch {
        await view.webview.postMessage({ command: "capture-error", message: "N\xE3o foi poss\xEDvel ler os eventos locais.", version });
      } finally {
        reading = false;
      }
    };
    view.webview.onDidReceiveMessage((message) => {
      if (message && message.command === "load-workflow") void send(true);
    }, void 0, context.subscriptions);
    view.iconPath = vscode.Uri.joinPath(context.extensionUri, "resources", "icon.svg");
    try {
      const file = vscode.Uri.joinPath(context.extensionUri, "webview", "dist", "index.html");
      const html = new TextDecoder().decode(await vscode.workspace.fs.readFile(file));
      const dist = view.webview.asWebviewUri(vscode.Uri.joinPath(context.extensionUri, "webview", "dist")).toString();
      const nonce = randomBytes(16).toString("hex");
      const csp = "default-src 'none'; img-src " + view.webview.cspSource + " data:; style-src " + view.webview.cspSource + " 'unsafe-inline'; script-src 'nonce-" + nonce + "' " + view.webview.cspSource + "; font-src " + view.webview.cspSource + "; connect-src 'none';";
      view.webview.html = html.replace("<head>", '<head><meta http-equiv="Content-Security-Policy" content="' + csp + '">').replace(/(src|href)="(?:\/|\.\/)assets\//g, '$1="' + dist + "/assets/").replace(/<script /g, '<script nonce="' + nonce + '" ');
    } catch {
      view.webview.html = "<html><body><h2>Painel Execu\xE7\xE3o " + version + "</h2><p>Instala\xE7\xE3o incompleta: os recursos da interface n\xE3o foram encontrados. Reinstale o .vsix desta vers\xE3o.</p></body></html>";
    }
    const config = vscode.workspace.getConfiguration("painel-execucao");
    const delay = Math.max(1e3, Number(config.get("refreshInterval", 2e3)) || 2e3);
    const timer = config.get("autoRefresh", true) ? setInterval(() => void send(), delay) : void 0;
    view.onDidDispose(() => {
      disposed = true;
      if (timer) clearInterval(timer);
      panel = void 0;
    }, void 0, context.subscriptions);
  };
  context.subscriptions.push(vscode.commands.registerCommand("painel-execucao.open", open));
  context.subscriptions.push({ dispose() {
    panel?.dispose();
  } });
}
function deactivate() {
}
export {
  activate,
  deactivate
};
