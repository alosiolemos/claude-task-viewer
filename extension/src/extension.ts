import * as vscode from 'vscode';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { randomBytes } from 'node:crypto';
import { IncrementalJsonlReader } from './transcript-reader';
import { TranscriptModel } from './transcript-model';
import * as tasks from './task-store';
import { buildDetails, buildPayload } from './view';
import * as gemini from './gemini';

const PRODUCT_NAME = 'Visualização Modular de Execução das Tarefas do Claude';
const CHOICE_KEY = 'painel-execucao.transcriptChoice';
const CONSENT_KEY = 'painel-execucao.geminiConsent';
const GEMINI_SECRET = 'painel-execucao.gemini.apiKey';
const DISCLOSURE = 'Use sua própria chave. Ao solicitar uma explicação, os dados selecionados desta etapa serão enviados ao Gemini. O uso está sujeito às cotas e condições da sua conta.';
const stateKey = (file: string) => 'painel-execucao.tasks:' + file.toLowerCase();

interface TranscriptInfo { file: string; mtime: number; size: number; title: string }

function projectsRoot(): string {
  const base = process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude');
  return path.join(base, 'projects');
}

/** Claude Code stores transcripts under projects/<workspace path with non-alphanumerics replaced by '-'>. */
function transcriptsDir(): string | undefined {
  const configured = vscode.workspace.getConfiguration('painel-execucao').get<string>('transcriptsDir', '').trim();
  if (configured) return fs.existsSync(configured) ? configured : undefined;
  const folder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!folder) return undefined;
  const encoded = folder.replace(/[^A-Za-z0-9]/g, '-').toLowerCase();
  const root = projectsRoot();
  let names: string[] = [];
  try { names = fs.readdirSync(root); } catch { return undefined; }
  const match = names.find(n => n.toLowerCase() === encoded);
  return match ? path.join(root, match) : undefined;
}

/** Reads only the tail of a transcript to find its latest ai-title. */
function readTitle(file: string, size: number): string {
  const length = Math.min(size, 512 * 1024);
  try {
    const fd = fs.openSync(file, 'r');
    const buf = Buffer.alloc(length);
    fs.readSync(fd, buf, 0, length, size - length);
    fs.closeSync(fd);
    const lines = buf.toString('utf8').split('\n').filter(l => l.includes('"ai-title"')).reverse();
    for (const line of lines) {
      try { const r = JSON.parse(line); if (typeof r.aiTitle === 'string') return r.aiTitle; } catch { /* partial first line */ }
    }
  } catch { /* unreadable */ }
  return '';
}

function listTranscripts(dir: string): TranscriptInfo[] {
  let names: string[] = [];
  try { names = fs.readdirSync(dir).filter(n => n.endsWith('.jsonl')); } catch { return []; }
  return names.map(n => {
    const file = path.join(dir, n);
    try { const s = fs.statSync(file); return { file, mtime: s.mtimeMs, size: s.size, title: '' }; } catch { return undefined; }
  }).filter((x): x is TranscriptInfo => !!x).sort((a, b) => b.mtime - a.mtime);
}

class Session {
  readonly reader: IncrementalJsonlReader;
  readonly model = new TranscriptModel();
  state: tasks.TaskState;

  constructor(readonly file: string, private readonly memento: vscode.Memento) {
    this.reader = new IncrementalJsonlReader(file);
    this.state = tasks.normalizeState(memento.get(stateKey(file)));
  }

  /** Returns true when anything visible may have changed. */
  poll(): boolean {
    const read = this.reader.read();
    if (read.reset) this.model.reset();
    const changed = this.model.ingest(read.records, read.malformed) > 0 || read.reset;
    if (tasks.assignNewEvents(this.state, this.model.events)) { this.persist(); return true; }
    return changed;
  }

  persist(): void {
    void this.memento.update(stateKey(this.file), this.state);
  }
}

export function activate(context: vscode.ExtensionContext) {
  let panel: vscode.WebviewPanel | undefined;
  let session: Session | undefined;
  let timer: NodeJS.Timeout | undefined;
  let lastSignature = '';
  let newer: TranscriptInfo | undefined;
  const version = String(context.extension.packageJSON.version);

  const choice = () => context.workspaceState.get<string>(CHOICE_KEY, 'auto');

  const pickFile = (): string | undefined => {
    const dir = transcriptsDir();
    if (!dir) return undefined;
    const list = listTranscripts(dir);
    const chosen = choice();
    if (chosen !== 'auto' && list.some(t => t.file === chosen)) return chosen;
    return list[0]?.file;
  };

  const openSession = (file: string | undefined) => {
    session = file ? new Session(file, context.globalState) : undefined;
    lastSignature = '';
  };

  const geminiConfigured = async () => (await context.secrets.get(GEMINI_SECRET)) !== undefined;
  const postGeminiStatus = async () => {
    void panel?.webview.postMessage({ command: 'gemini', configured: await geminiConfigured() });
  };

  const send = (force = false) => {
    if (!panel) return;
    try { session?.poll(); } catch { /* unreadable transcript: keep last view */ }
    const dir = transcriptsDir();
    const latest = dir ? listTranscripts(dir)[0] : undefined;
    let currentMtime = 0;
    try { currentMtime = session ? fs.statSync(session.file).mtimeMs : 0; } catch { /* removed */ }
    newer = latest && session && latest.file !== session.file && latest.mtime > currentMtime ? latest : undefined;
    // Payload includes time-relative states, so an unchanged signature is the only reason to skip posting.
    const payload = session
      ? buildPayload(session.model.events, session.state, session.model.report(), session.model.title, path.basename(session.file))
      : buildPayload([], tasks.emptyState(), new TranscriptModel().report(), '', '');
    const message = {
      command: 'payload', version,
      payload: { ...payload, newerSession: newer ? (readTitle(newer.file, newer.size) || path.basename(newer.file)) : '' },
    };
    const signature = JSON.stringify(message);
    if (force || signature !== lastSignature) {
      lastSignature = signature;
      void panel.webview.postMessage(message);
    }
  };

  const chooseTranscript = async () => {
    const dir = transcriptsDir();
    if (!dir) { await chooseFolder(); return; }
    const list = listTranscripts(dir).slice(0, 40);
    const items: (vscode.QuickPickItem & { file: string })[] = [
      { label: 'Acompanhar a sessão mais recente', description: 'automático', file: 'auto' },
      ...list.map(t => ({
        label: readTitle(t.file, t.size) || path.basename(t.file),
        description: new Date(t.mtime).toLocaleString('pt-BR'),
        detail: path.basename(t.file) + ' · ' + Math.max(1, Math.round(t.size / 1024)) + ' KB',
        file: t.file,
      })),
    ];
    const picked = await vscode.window.showQuickPick(items, { title: 'Sessão do Claude a acompanhar', placeHolder: 'Escolha uma transcrição deste projeto' });
    if (!picked) return;
    await context.workspaceState.update(CHOICE_KEY, picked.file);
    openSession(pickFile());
    send(true);
  };

  const chooseFolder = async () => {
    const uri = await vscode.window.showOpenDialog({
      canSelectFiles: false, canSelectFolders: true, canSelectMany: false,
      title: 'Pasta de transcrições do Claude Code deste projeto',
      defaultUri: vscode.Uri.file(fs.existsSync(projectsRoot()) ? projectsRoot() : os.homedir()),
    });
    if (!uri?.[0]) return;
    await vscode.workspace.getConfiguration('painel-execucao').update('transcriptsDir', uri[0].fsPath, vscode.ConfigurationTarget.Workspace);
    await context.workspaceState.update(CHOICE_KEY, 'auto');
    openSession(pickFile());
    send(true);
  };

  const setGeminiKey = async () => {
    const value = await vscode.window.showInputBox({
      title: 'Chave de API do Gemini',
      prompt: 'Cole sua chave pessoal. Ela fica só no armazenamento seguro do VS Code e não aparece no painel.',
      password: true, ignoreFocusOut: true,
      validateInput: v => (v.trim().length < 10 ? 'A chave parece incompleta.' : undefined),
    });
    if (!value) return;
    await context.secrets.store(GEMINI_SECRET, value.trim());
    await postGeminiStatus();
  };

  const removeGeminiKey = async () => {
    const choiceMade = await vscode.window.showWarningMessage(
      'Remover a chave do Gemini? As explicações param de funcionar até você adicionar outra chave. O restante do painel não muda.',
      { modal: true }, 'Remover',
    );
    if (choiceMade !== 'Remover') return;
    await context.secrets.delete(GEMINI_SECRET);
    gemini.clearExplanations();
    await postGeminiStatus();
  };

  const confirmFirstUse = async (): Promise<boolean> => {
    if (context.globalState.get<boolean>(CONSENT_KEY)) return true;
    const choiceMade = await vscode.window.showWarningMessage(
      DISCLOSURE + '\n\nSerão enviados somente o nome da ferramenta, o arquivo, a entrada e o resultado desta etapa, sanitizados e limitados a 2.000 caracteres cada. Suas mensagens e o restante da conversa não são enviados.',
      { modal: true }, 'Enviar ao Gemini',
    );
    if (choiceMade !== 'Enviar ao Gemini') return false;
    await context.globalState.update(CONSENT_KEY, true);
    return true;
  };

  const explain = async (m: any) => {
    const reply = (fields: Record<string, unknown>) => {
      void panel?.webview.postMessage({ command: 'explanation', key: m.key, sig: m.sig, ...fields });
    };
    const event = session && typeof m.key === 'string' ? session.model.get(m.key) : undefined;
    if (!event || event.kind !== 'action') return reply({ status: 'unsupported' });
    const step = gemini.buildStep(event, session?.model.commentFor(event));
    if (!step) return reply({ status: 'insufficient' });
    const apiKey = await context.secrets.get(GEMINI_SECRET);
    if (!apiKey) return reply({ status: 'unconfigured' });
    const id = gemini.cacheId(event.key, step);
    const cached = gemini.cachedExplanation(id);
    if (cached) return reply({ status: 'ready', text: cached });
    if (!(await confirmFirstUse())) return reply({ status: 'cancelled' });
    reply({ status: 'loading' });
    try {
      const text = await gemini.explainStep(step, apiKey);
      gemini.storeExplanation(id, text);
      reply({ status: 'ready', text });
    } catch (error) {
      reply({ status: 'error', message: error instanceof gemini.GeminiError ? error.userMessage : 'Não foi possível gerar a explicação.' });
    }
  };

  const onMessage = async (m: any) => {
    if (!m || typeof m !== 'object') return;
    const s = session;
    switch (m.command) {
      case 'ready': send(true); void postGeminiStatus(); return;
      case 'chooseTranscript': await chooseTranscript(); return;
      case 'chooseFolder': await chooseFolder(); return;
      case 'openNewer':
        if (newer) { await context.workspaceState.update(CHOICE_KEY, 'auto'); openSession(newer.file); send(true); }
        return;
      case 'details': {
        const event = s && typeof m.key === 'string' ? s.model.get(m.key) : undefined;
        if (event && panel) void panel.webview.postMessage({ command: 'details', details: buildDetails(event, s?.model.commentFor(event)) });
        return;
      }
      case 'copy':
        if (typeof m.text === 'string' && m.text.length <= 4096) await vscode.env.clipboard.writeText(m.text);
        return;
      case 'geminiSet': await setGeminiKey(); return;
      case 'geminiRemove': await removeGeminiKey(); return;
      case 'explain': await explain(m); return;
    }
    if (!s) return;
    let changed = false;
    if (m.command === 'selectTask' && typeof m.taskId === 'string') changed = tasks.selectTask(s.state, m.taskId);
    if (m.command === 'continueTask' && typeof m.taskId === 'string') changed = tasks.continueTask(s.state, m.taskId);
    if (m.command === 'newTask') {
      const title = await vscode.window.showInputBox({ title: 'Nova tarefa', prompt: 'Nome da tarefa (opcional). Sem nome, será usado o próximo pedido enviado ao Claude.', placeHolder: 'Ex.: Ajustar o painel' });
      if (title === undefined) return;
      tasks.startNewTask(s.state, title);
      changed = true;
    }
    if (m.command === 'renameTask' && typeof m.taskId === 'string') {
      const current = s.state.tasks.find(t => t.id === m.taskId);
      if (!current) return;
      const title = await vscode.window.showInputBox({ title: 'Renomear tarefa', value: current.title });
      if (title) changed = tasks.renameTask(s.state, m.taskId, title);
    }
    if (changed) { s.persist(); send(true); }
  };

  const open = async () => {
    if (panel) { panel.reveal(); return; }
    panel = vscode.window.createWebviewPanel('painel-execucao', PRODUCT_NAME, vscode.ViewColumn.Beside, {
      enableScripts: true, retainContextWhenHidden: true,
      localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, 'webview')],
    });
    panel.iconPath = vscode.Uri.joinPath(context.extensionUri, 'resources', 'icon.svg');
    const nonce = randomBytes(16).toString('base64');
    const csp = `default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}'; img-src ${panel.webview.cspSource} data:;`;
    try {
      const raw = await vscode.workspace.fs.readFile(vscode.Uri.joinPath(context.extensionUri, 'webview', 'painel.html'));
      panel.webview.html = new TextDecoder().decode(raw).replace('{{CSP}}', csp).replace('{{NONCE}}', nonce);
    } catch {
      panel.webview.html = '<p>' + PRODUCT_NAME + ' ' + version + ': interface não encontrada. Reinstale o pacote.</p>';
    }
    panel.webview.onDidReceiveMessage(onMessage, undefined, context.subscriptions);
    openSession(pickFile());
    const interval = Math.max(500, Number(vscode.workspace.getConfiguration('painel-execucao').get('refreshInterval', 1500)) || 1500);
    timer = setInterval(() => send(false), interval);
    panel.onDidDispose(() => { if (timer) clearInterval(timer); timer = undefined; panel = undefined; session = undefined; }, undefined, context.subscriptions);
  };

  context.subscriptions.push(
    vscode.commands.registerCommand('painel-execucao.open', open),
    vscode.commands.registerCommand('painel-execucao.chooseTranscript', async () => { await open(); await chooseTranscript(); }),
    { dispose() { panel?.dispose(); } },
  );
}

export function deactivate() {}
