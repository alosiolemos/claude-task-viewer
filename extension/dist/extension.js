// src/extension.ts
import * as vscode from "vscode";

// src/transcript-reader.ts
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
var TranscriptReader = class {
  transcriptPath;
  lastReadPosition = 0;
  lastModified = 0;
  constructor(sessionId, projectPath) {
    const home = os.homedir();
    const claudeProject = projectPath || "Projetos";
    this.transcriptPath = path.join(
      home,
      ".claude",
      "projects",
      claudeProject,
      `${sessionId}.jsonl`
    );
  }
  /**
   * Lê apenas as novas linhas desde a última leitura.
   * Retorna null se o arquivo não existe ou o formato é incompatível.
   */
  async readNewRecords() {
    if (!fs.existsSync(this.transcriptPath)) {
      return null;
    }
    try {
      const stat = fs.statSync(this.transcriptPath);
      const content = fs.readFileSync(this.transcriptPath, "utf8");
      const lines = content.split("\n").filter((l) => l.trim());
      let recordIndex = 0;
      const actions = [];
      for (const line of lines) {
        try {
          const record = JSON.parse(line);
          const action = this.parseRecord(record, recordIndex);
          if (action) {
            actions.push(action);
          }
          recordIndex++;
        } catch (e) {
        }
      }
      this.lastReadPosition = content.length;
      this.lastModified = stat.mtimeMs;
      return { actions };
    } catch (error) {
      return {
        actions: [],
        error: `Erro ao ler transcri\xE7\xE3o: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }
  parseRecord(record, index) {
    const timestamp = record.timestamp ? new Date(record.timestamp) : /* @__PURE__ */ new Date();
    if (record.type === "user-input") {
      return {
        recordIndex: index,
        timestamp,
        type: "user-input",
        description: this.extractUserMessage(record),
        input: record.input
      };
    }
    if (record.type === "tool-use") {
      const attachment = record.attachment || {};
      return {
        recordIndex: index,
        timestamp,
        type: "tool-use",
        toolName: attachment.toolName || "Ferramenta",
        description: this.describeAction(attachment),
        input: attachment.toolInput,
        output: attachment.toolResponse,
        error: attachment.error,
        filePath: this.extractFilePath(attachment)
      };
    }
    if (record.type === "attachment" && record.attachment?.type === "tool-result") {
      const attachment = record.attachment;
      return {
        recordIndex: index,
        timestamp,
        type: "tool-result",
        toolName: attachment.toolName || "Ferramenta",
        description: this.describeAction(attachment),
        input: attachment.toolInput,
        output: attachment.toolResponse,
        error: attachment.error,
        filePath: this.extractFilePath(attachment)
      };
    }
    return null;
  }
  extractUserMessage(record) {
    if (record.content) return record.content.split("\n")[0].slice(0, 100);
    if (record.input?.message) return record.input.message.split("\n")[0].slice(0, 100);
    return "Mensagem do usu\xE1rio";
  }
  describeAction(attachment) {
    const toolName = attachment.toolName || attachment.tool_name || "A\xE7\xE3o";
    const filePath = this.extractFilePath(attachment);
    const fileName = filePath ? filePath.split(/[\\\/]/).pop() : "";
    if (toolName === "Read" && fileName) return `Leu ${fileName}`;
    if (toolName === "Write" && fileName) return `Criou ${fileName}`;
    if (toolName === "Edit" && fileName) return `Editou ${fileName}`;
    if (toolName === "Bash") {
      const cmd = String(attachment.toolInput?.command || "").slice(0, 50);
      return cmd ? `Executou: ${cmd}` : "Executou comando";
    }
    if (toolName === "Bash") return "Executou comando";
    if (toolName === "Grep") return "Buscou texto";
    if (toolName === "Glob") return "Localizou arquivos";
    return toolName;
  }
  extractFilePath(attachment) {
    const input = attachment.toolInput || attachment.input || {};
    return input.file_path || input.filePath || input.path || "";
  }
};

// src/task-manager.ts
var TaskManager = class {
  currentTaskId = "";
  tasks = /* @__PURE__ */ new Map();
  onTasksChanged;
  constructor(onTasksChanged) {
    this.onTasksChanged = onTasksChanged;
  }
  /**
   * Processa novas ações e as agrupa em tarefas.
   * Se não há tarefa atual, cria uma nova.
   * Se há tarefa atual, adiciona as ações nela.
   */
  addActions(actions) {
    if (!actions.length) return;
    if (!this.currentTaskId) {
      const userAction = actions.find((a) => a.type === "user-input");
      if (userAction) {
        this.startNewTask(userAction.description);
      } else {
        this.startNewTask("Tarefa em progresso");
      }
    }
    const task = this.tasks.get(this.currentTaskId);
    if (task) {
      task.actions.push(...actions);
      task.state = this.inferTaskState(task.actions);
      this.notifyChange();
    }
  }
  /**
   * Inicia uma nova tarefa.
   */
  startNewTask(title) {
    const id = "task-" + Date.now() + "-" + Math.random().toString(36).slice(2, 9);
    this.currentTaskId = id;
    this.tasks.set(id, {
      id,
      title,
      actions: [],
      createdAt: /* @__PURE__ */ new Date(),
      state: "running"
    });
    this.notifyChange();
  }
  /**
   * Continua a tarefa atual (não faz nada, apenas marca para continuar).
   */
  continueCurrentTask() {
    if (!this.currentTaskId && this.tasks.size > 0) {
      const lastTask = Array.from(this.tasks.values()).sort(
        (a, b) => b.createdAt.getTime() - a.createdAt.getTime()
      )[0];
      this.currentTaskId = lastTask.id;
      this.notifyChange();
    }
  }
  /**
   * Retorna todas as tarefas.
   */
  getAllTasks() {
    return Array.from(this.tasks.values()).sort(
      (a, b) => b.createdAt.getTime() - a.createdAt.getTime()
    );
  }
  /**
   * Retorna a tarefa atual.
   */
  getCurrentTask() {
    return this.tasks.get(this.currentTaskId);
  }
  /**
   * Define qual tarefa está selecionada.
   */
  selectTask(taskId) {
    if (this.tasks.has(taskId)) {
      this.currentTaskId = taskId;
      this.notifyChange();
    }
  }
  /**
   * Infere o estado da tarefa baseado nas ações.
   */
  inferTaskState(actions) {
    if (!actions.length) return "running";
    const hasError = actions.some((a) => a.error || a.type === "tool-result");
    if (hasError) return "failed";
    const lastAction = actions[actions.length - 1];
    if (lastAction?.type === "user-input") return "completed";
    return "running";
  }
  notifyChange() {
    if (this.onTasksChanged) {
      this.onTasksChanged(this.getAllTasks());
    }
  }
};

// src/extension.ts
function activate(context) {
  let panel;
  let reader;
  let taskManager;
  let sessionId = "";
  const open = async () => {
    if (panel) {
      panel.reveal(vscode.ViewColumn.Beside);
      return;
    }
    const workspaceFolders = vscode.workspace.workspaceFolders;
    const selectedFolder = workspaceFolders?.[0];
    if (!selectedFolder) {
      vscode.window.showErrorMessage("Abra uma pasta no VS Code para usar o Painel Execu\xE7\xE3o");
      return;
    }
    const folderName = selectedFolder.uri.fsPath.split(/[\\\/]/).pop() || "Projetos";
    panel = vscode.window.createWebviewPanel(
      "painel-execucao",
      "Painel Execu\xE7\xE3o",
      vscode.ViewColumn.Beside,
      { enableScripts: true, retainContextWhenHidden: true }
    );
    try {
      const htmlPath = vscode.Uri.joinPath(context.extensionUri, "webview", "painel.html");
      const htmlContent = new TextDecoder().decode(await vscode.workspace.fs.readFile(htmlPath));
      panel.webview.html = htmlContent;
    } catch (e) {
      panel.webview.html = "<h1>Erro ao carregar interface</h1>";
    }
    sessionId = vscode.env.sessionId || "";
    reader = new TranscriptReader(sessionId, folderName);
    taskManager = new TaskManager(() => {
      const tasks = taskManager.getAllTasks();
      const currentTask = taskManager.getCurrentTask();
      panel?.webview.postMessage({
        command: "update-tasks",
        tasks: tasks.map((t) => ({
          ...t,
          createdAt: t.createdAt.toISOString()
        })),
        currentTaskId: currentTask?.id || null
      });
    });
    let refreshTimer;
    const refresh = async () => {
      const result = await reader.readNewRecords();
      if (result?.error) {
        panel?.webview.postMessage({
          command: "error",
          message: result.error
        });
        return;
      }
      if (result?.actions && result.actions.length > 0) {
        taskManager.addActions(result.actions);
      }
    };
    panel.webview.onDidReceiveMessage(async (message) => {
      if (message.command === "init") {
        await refresh();
      } else if (message.command === "refresh") {
        await refresh();
      } else if (message.command === "new-task") {
        const title = await vscode.window.showInputBox({
          prompt: "Nome da nova tarefa",
          value: "Nova tarefa"
        });
        if (title) {
          taskManager.startNewTask(title);
        }
      } else if (message.command === "continue-task") {
        taskManager.continueCurrentTask();
      }
    });
    refreshTimer = setInterval(refresh, 2e3);
    panel.onDidDispose(() => {
      if (refreshTimer) clearInterval(refreshTimer);
      panel = void 0;
      reader = void 0;
      taskManager = void 0;
    });
  };
  context.subscriptions.push(vscode.commands.registerCommand("painel-execucao.open", open));
}
function deactivate() {
}
export {
  activate,
  deactivate
};
