import * as vscode from 'vscode';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { randomBytes } from 'node:crypto';
import { IncrementalJsonlReader } from './transcript-reader';
import { TranscriptModel } from './transcript-model';
import * as tasks from './task-store';
import { buildDetails, buildPayload, TaskSummary } from './view';
import * as gemini from './gemini';
import { buildTaskData, taskCacheId, explainTask } from './task-summary';
import * as history from './history';
import { buildExport, ExportSource, fileNameFor, previewExport, toHtml, toJson } from './export';

const PRODUCT_NAME = 'Visualização Modular de Execução das Tarefas do Claude';
const CHOICE_KEY = 'painel-execucao.transcriptChoice';
const VIEWING_KEY = 'painel-execucao.viewing.v1';
const CONSENT_KEY = 'painel-execucao.geminiConsent';
const TASK_CONSENT_KEY = 'painel-execucao.geminiTaskConsent.v1';
const taskRequests = new Set<string>();
const GEMINI_SECRET = 'painel-execucao.gemini.apiKey';
const DISCLOSURE = 'Use sua própria chave. Ao solicitar uma explicação, os dados selecionados desta etapa serão enviados ao Gemini. O uso está sujeito às cotas e condições da sua conta.';
const TASKS_PREFIX = 'painel-execucao.tasks:';
const META_PREFIX = 'painel-execucao.meta:';
const stateKey = (file: string) => TASKS_PREFIX + file.toLowerCase();
const metaKey = (file: string) => META_PREFIX + file.toLowerCase();
const sameFile = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

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

function readSlice(file: string, size: number, fromEnd: boolean, max = 512 * 1024): string {
  const length = Math.min(size, max);
  try {
    const fd = fs.openSync(file, 'r');
    try {
      const buf = Buffer.alloc(length);
      fs.readSync(fd, buf, 0, length, fromEnd ? size - length : 0);
      return buf.toString('utf8');
    } finally { fs.closeSync(fd); }
  } catch { return ''; }
}

/** Reads only the tail of a transcript to find its latest conversation name (user-given name first). */
function readTitle(file: string, size: number): string {
  const lines = readSlice(file, size, true).split('\n').reverse();
  let ai = '';
  for (const line of lines) {
    if (!line.includes('"custom-title"') && (ai || !line.includes('"ai-title"'))) continue;
    try {
      const r = JSON.parse(line);
      if (r.type === 'custom-title' && typeof r.customTitle === 'string' && r.customTitle.trim()) return r.customTitle.trim();
      if (!ai && r.type === 'ai-title' && typeof r.aiTitle === 'string') ai = r.aiTitle;
    } catch { /* partial first line */ }
  }
  return ai;
}

/** Working folder recorded near the start of a transcript, used only to name the project. */
function readCwd(file: string, size: number): string {
  for (const line of readSlice(file, size, false, 64 * 1024).split('\n')) {
    if (!line.includes('"cwd"')) continue;
    try { const r = JSON.parse(line); if (typeof r.cwd === 'string') return r.cwd; } catch { /* partial last line */ }
  }
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

/**
 * A transcript and its task associations. The followed session receives new actions (capture). A
 * consultation session shows a task from another transcript and is read-only: it never assigns events,
 * never changes associations and never persists task state.
 */
class Session {
  readonly reader: IncrementalJsonlReader;
  readonly model = new TranscriptModel();
  state: tasks.TaskState;
  available = true;

  constructor(readonly file: string, private readonly memento: vscode.Memento, readonly followed = true) {
    this.reader = new IncrementalJsonlReader(file);
    this.state = tasks.normalizeState(memento.get(stateKey(file)));
  }

  /** Returns true when anything visible may have changed. */
  poll(): boolean {
    this.available = fs.existsSync(this.file);
    const read = this.reader.read();
    if (read.reset) this.model.reset();
    const changed = this.model.ingest(read.records, read.malformed) > 0 || read.reset;
    if (!this.followed) {
      this.state = tasks.normalizeState(this.memento.get(stateKey(this.file)));
      return changed;
    }
    if (tasks.assignNewEvents(this.state, this.model.events)) { this.persist(); return true; }
    return changed;
  }

  persist(): void {
    if (this.followed) void this.memento.update(stateKey(this.file), this.state);
  }
}

interface Displayed { s: Session; taskId: string | null; other: boolean; state: tasks.TaskState }

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

  // ---------- consultation of a task from another transcript (never changes the capture target) ----------
  let viewing = context.workspaceState.get<{ file: string; taskId: string } | null>(VIEWING_KEY, null) ?? null;
  if (!viewing || typeof viewing.file !== 'string' || typeof viewing.taskId !== 'string') viewing = null;
  let viewSession: Session | undefined;
  const setViewing = (target: { file: string; taskId: string } | null) => {
    viewing = target;
    if (!target || (viewSession && !sameFile(viewSession.file, target.file))) viewSession = undefined;
    void context.workspaceState.update(VIEWING_KEY, target);
    lastSignature = '';
  };
  const displayed = (): Displayed | undefined => {
    if (viewing && (!session || !sameFile(viewing.file, session.file))) {
      if (!viewSession) {
        viewSession = new Session(viewing.file, context.globalState, false);
        try { viewSession.poll(); } catch { viewSession.available = false; }
      }
      return { s: viewSession, taskId: viewing.taskId, other: true, state: { ...viewSession.state, selectedTaskId: viewing.taskId } };
    }
    return session ? { s: session, taskId: session.state.selectedTaskId, other: false, state: session.state } : undefined;
  };

  // ---------- small per-transcript identification for the cross-session history ----------
  const fallbackProject = (file: string) => {
    const dir = path.dirname(file);
    const current = transcriptsDir();
    const folder = vscode.workspace.workspaceFolders?.[0];
    if (current && sameFile(current, dir) && folder) return folder.name || path.basename(folder.uri.fsPath);
    return path.basename(dir);
  };
  const readMeta = (file: string) => history.normalizeMeta(context.globalState.get(metaKey(file)));
  const originOf = (s: Session) => {
    const meta = readMeta(s.file);
    return {
      conversation: s.model.title || meta?.conversation || '',
      project: s.model.cwd ? history.projectNameOf(s.model.cwd, fallbackProject(s.file)) : meta?.projectName || fallbackProject(s.file),
      sessionId: history.sessionIdOf(s.file),
    };
  };
  const updateMeta = (s: Session, summaries: TaskSummary[]) => {
    // Without the transcript there is nothing new to learn; keep the identification already saved.
    if (!s.available || !s.model.report().records) return;
    const prev = readMeta(s.file);
    const o = originOf(s);
    const next = history.metaFromSummaries(prev, prev?.file || s.file, o.conversation, o.project, summaries);
    if (JSON.stringify(prev) !== JSON.stringify(next)) void context.globalState.update(metaKey(s.file), next);
  };
  const availability = new Map<string, { at: number; ok: boolean }>();
  const exists = (file: string) => {
    const hit = availability.get(file);
    if (hit && Date.now() - hit.at < 30_000) return hit.ok;
    const ok = fs.existsSync(file);
    availability.set(file, { at: Date.now(), ok });
    return ok;
  };
  /** Tasks the panel has already followed, in any session or project. Reads transcripts only once, to name old sessions. */
  const trackedHistory = (): history.HistoryEntry[] => {
    const keys = typeof context.globalState.keys === 'function' ? context.globalState.keys() : [];
    const tracked: history.TrackedSession[] = [];
    for (const key of keys) {
      if (!key.startsWith(TASKS_PREFIX)) continue;
      const lowered = key.slice(TASKS_PREFIX.length);
      let meta = history.normalizeMeta(context.globalState.get(META_PREFIX + lowered));
      const live = session && sameFile(session.file, lowered) ? session : undefined;
      const file = live?.file || meta?.file || lowered;
      const available = live ? live.available : exists(file);
      if (!meta && available) {
        let size = 0;
        try { size = fs.statSync(file).size; } catch { /* removed meanwhile */ }
        const cwd = readCwd(file, size);
        meta = { v: 1, file, sessionId: history.sessionIdOf(file), conversation: readTitle(file, size), projectName: history.projectNameOf(cwd, fallbackProject(file)), projectKey: history.projectKeyOf(file), tasks: {} };
        void context.globalState.update(META_PREFIX + lowered, meta);
      }
      tracked.push({ file, state: live ? live.state : tasks.normalizeState(context.globalState.get(key)), meta, available });
    }
    return history.buildHistory(tracked);
  };

  // Explanations already generated in this window, kept for export only (memory, never persisted).
  const stepNotes = new Map<string, { id: string; text: string; at: string }>();
  const taskNotes = new Map<string, { revision: string; text: string; at: string; incomplete: boolean }>();
  const noteKey = (file: string, id: string) => file.toLowerCase() + '|' + id;

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
    const d = displayed();
    if (d?.other) { try { d.s.poll(); } catch { d.s.available = false; } d.state = { ...d.s.state, selectedTaskId: d.taskId }; }
    // Payload includes time-relative states, so an unchanged signature is the only reason to skip posting.
    const payload = d
      ? buildPayload(d.s.model.events, d.state, d.s.model.report(), d.s.model.title, path.basename(d.s.file))
      : buildPayload([], tasks.emptyState(), new TranscriptModel().report(), '', '');
    if (session) {
      const followedTasks = d && !d.other ? payload.tasks
        : buildPayload(session.model.events, { ...session.state, selectedTaskId: null }, session.model.report(), '', '').tasks;
      updateMeta(session, followedTasks);
    }
    if (d?.other) {
      updateMeta(d.s, payload.tasks);
      payload.activeTaskId = null; // the capture destination belongs to the followed session
      if (!d.s.available) payload.warnings.unshift('A transcrição original desta tarefa não foi encontrada. A identificação continua no histórico, mas os detalhes estão indisponíveis.');
    }
    const selectedId = d?.taskId ?? null;
    const summaryData = d && selectedId ? buildTaskData(d.s.model.events, d.state, selectedId, e => d.s.model.commentFor(e)) : undefined;
    const taskSummaryMeta = d && selectedId && summaryData ? {
      scope: path.basename(d.s.file) + '|' + selectedId,
      revision: taskCacheId(d.s.file, selectedId, summaryData),
      partial: summaryData.partial, totalEvents: summaryData.totalEvents,
      includedEvents: summaryData.includedEvents, omittedEvents: summaryData.omittedEvents, truncatedFields: summaryData.truncatedFields,
    } : null;
    const origin = d ? { ...originOf(d.s), taskId: selectedId, available: d.s.available, other: d.other } : null;
    const meta = d && selectedId ? readMeta(d.s.file)?.tasks[selectedId] : undefined;
    // A task known only by the history (transcript gone) still shows its saved identification.
    if (d && selectedId && !payload.tasks.some(t => t.id === selectedId) && meta) {
      payload.tasks.push({ id: selectedId, title: meta.title || 'Tarefa sem título', legacy: selectedId === tasks.LEGACY_ID, active: false, state: meta.state === 'unknown' ? 'empty' : meta.state, actions: meta.actions, failures: meta.failures, firstTime: meta.firstTime, lastTime: meta.lastTime });
    }
    const activeTask = session?.state.tasks.find(t => t.id === session!.state.activeTaskId);
    const message = {
      command: 'payload', version,
      payload: {
        ...payload, taskSummaryMeta, newerSession: newer ? (readTitle(newer.file, newer.size) || path.basename(newer.file)) : '',
        origin,
        history: trackedHistory(),
        currentProjectKey: session ? history.projectKeyOf(session.file) : (dir || '').toLowerCase(),
        selectedRef: d && selectedId ? history.refOf(history.sessionIdOf(d.s.file), selectedId) : null,
        activeRef: session && activeTask ? history.refOf(history.sessionIdOf(session.file), activeTask.id) : null,
        activeTitle: activeTask ? activeTask.title : '',
        activeConversation: session ? originOf(session).conversation : '',
        viewingOther: !!d?.other,
      },
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
    setViewing(null);
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
    setViewing(null);
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
    stepNotes.clear(); taskNotes.clear();
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
    const shown = displayed()?.s;
    const event = shown && typeof m.key === 'string' ? shown.model.get(m.key) : undefined;
    if (!shown || !event || event.kind !== 'action') return reply({ status: 'unsupported' });
    const step = gemini.buildStep(event, shown.model.commentFor(event));
    if (!step) return reply({ status: 'insufficient' });
    const apiKey = await context.secrets.get(GEMINI_SECRET);
    if (!apiKey) return reply({ status: 'unconfigured' });
    const id = gemini.cacheId(event.key, step);
    const remember = (text: string) => {
      const k = noteKey(shown.file, event.key);
      const prev = stepNotes.get(k);
      stepNotes.set(k, { id, text, at: prev && prev.id === id && prev.text === text ? prev.at : new Date().toISOString() });
    };
    const cached = gemini.cachedExplanation(id);
    if (cached) { remember(cached); return reply({ status: 'ready', text: cached }); }
    if (!(await confirmFirstUse())) return reply({ status: 'cancelled' });
    reply({ status: 'loading' });
    try {
      const text = await gemini.explainStep(step, apiKey);
      gemini.storeExplanation(id, text);
      remember(text);
      reply({ status: 'ready', text });
    } catch (error) {
      reply({ status: 'error', message: error instanceof gemini.GeminiError ? error.userMessage : 'Não foi possível gerar a explicação.' });
    }
  };

  const explainWholeTask = async (m: any) => {
    const shown = displayed();
    const selectedSession = shown?.s;
    const taskId = typeof m.taskId === 'string' ? m.taskId : '';
    const scope = selectedSession ? path.basename(selectedSession.file) + '|' + taskId : '';
    let revision = typeof m.revision === 'string' ? m.revision : '';
    let snapshot: Record<string, unknown> | undefined;
    const reply = (fields: Record<string, unknown>) => void panel?.webview.postMessage({ command:'task-explanation', scope, taskId, revision, meta:snapshot, ...fields });
    if (!shown || !selectedSession || shown.taskId !== taskId) return reply({status:'unsupported'});
    selectedSession.poll();
    const data = buildTaskData(selectedSession.model.events,selectedSession.state,taskId,e=>selectedSession.model.commentFor(e));
    if (!data) return reply({status:'insufficient'});
    revision = taskCacheId(selectedSession.file,taskId,data);
    snapshot={partial:data.partial,totalEvents:data.totalEvents,includedEvents:data.includedEvents,omittedEvents:data.omittedEvents,truncatedFields:data.truncatedFields};
    const apiKey = await context.secrets.get(GEMINI_SECRET);
    if (!apiKey) return reply({status:'unconfigured'});
    const remember = (text: string, incomplete: boolean) => {
      if (text) taskNotes.set(noteKey(selectedSession.file, taskId), { revision, text, at: new Date().toISOString(), incomplete });
    };
    const cached = gemini.cachedExplanation(revision);
    if (cached) { if (taskNotes.get(noteKey(selectedSession.file, taskId))?.revision !== revision) remember(cached, false); return reply({status:'ready',text:cached}); }
    if (taskRequests.has(revision)) return reply({status:'loading'});
    taskRequests.add(revision);
    try {
      if (!context.globalState.get<boolean>(TASK_CONSENT_KEY)) {
        const choice = await vscode.window.showWarningMessage(
          'Explicar a tarefa selecionada com Gemini? Serão enviados o pedido, as ações, entradas, resultados, comentários públicos e respostas desta tarefa, sanitizados e limitados a 48.000 caracteres no total. Outras tarefas e raciocínio interno não são enviados. A sanitização pode não remover todos os dados confidenciais; revise os detalhes antes de enviar. O uso está sujeito às cotas e condições da sua conta.\n\n' +
          data.includedEvents + ' de ' + data.totalEvents + ' registros selecionados; ' + data.omittedEvents + ' omitidos e ' + data.truncatedFields + ' campos limitados.',
          {modal:true}, 'Enviar ao Gemini');
        if (choice !== 'Enviar ao Gemini') return reply({status:'cancelled'});
        await context.globalState.update(TASK_CONSENT_KEY,true);
      }
      reply({status:'loading'});
      const text = await explainTask(data,apiKey);
      gemini.storeExplanation(revision,text);
      remember(text,false);
      reply({status:'ready',text});
    } catch(error) {
      if (error instanceof gemini.GeminiError && error.partialText) remember(error.partialText,true);
      reply({status:error instanceof gemini.GeminiError && error.partialText ? 'incomplete' : 'error',text:error instanceof gemini.GeminiError ? error.partialText : '',message:error instanceof gemini.GeminiError ? error.userMessage : 'Não foi possível explicar a tarefa.'});
    } finally {taskRequests.delete(revision);}
  };

  const onMessage = async (m: any) => {
    if (!m || typeof m !== 'object') return;
    const s = session;
    switch (m.command) {
      case 'ready': send(true); void postGeminiStatus(); return;
      case 'chooseTranscript': await chooseTranscript(); return;
      case 'chooseFolder': await chooseFolder(); return;
      case 'openNewer':
        if (newer) { await context.workspaceState.update(CHOICE_KEY, 'auto'); setViewing(null); openSession(newer.file); send(true); }
        return;
      case 'details': {
        const shown = displayed()?.s;
        const event = shown && typeof m.key === 'string' ? shown.model.get(m.key) : undefined;
        if (shown && event && panel) void panel.webview.postMessage({ command: 'details', details: buildDetails(event, shown.model.commentFor(event)) });
        return;
      }
      case 'exportPreview': await exportPreview(); return;
      case 'exportSave': await exportSave(m); return;
      case 'copy':
        if (typeof m.text === 'string' && m.text.length <= 4096) await vscode.env.clipboard.writeText(m.text);
        return;
      case 'geminiSet': await setGeminiKey(); return;
      case 'geminiRemove': await removeGeminiKey(); return;
      case 'explain': await explain(m); return;
      case 'explainTask': await explainWholeTask(m); return;
    }
    // A history entry from another transcript is only consulted: the followed session and its active task stay as they are.
    if (m.command === 'selectTask' && typeof m.ref === 'string') {
      const entry = trackedHistory().find(e => e.ref === m.ref);
      if (!entry) return;
      if (!s || !sameFile(entry.file, s.file)) { setViewing({ file: entry.file, taskId: entry.taskId }); send(true); return; }
      m = { command: 'selectTask', taskId: entry.taskId };
    }
    if (!s) return;
    let changed = false;
    const wasViewing = !!viewing;
    if (['selectTask', 'continueTask', 'newTask'].includes(m.command)) setViewing(null);
    if (m.command === 'selectTask' && typeof m.taskId === 'string') changed = tasks.selectTask(s.state, m.taskId) || wasViewing;
    if (m.command === 'continueTask' && typeof m.taskId === 'string') changed = tasks.continueTask(s.state, m.taskId);
    if (m.command === 'newTask') {
      const title = await vscode.window.showInputBox({ title: 'Nova tarefa', prompt: 'Nome da tarefa (opcional). Sem nome, será usado o próximo pedido enviado ao Claude.', placeHolder: 'Ex.: Ajustar o painel' });
      if (title === undefined) { if (wasViewing) send(true); return; }
      tasks.startNewTask(s.state, title);
      changed = true;
    }
    if (m.command === 'renameTask' && typeof m.taskId === 'string') {
      if (displayed()?.other) return; // consultation is read-only
      const current = s.state.tasks.find(t => t.id === m.taskId);
      if (!current) return;
      const title = await vscode.window.showInputBox({ title: 'Renomear tarefa', value: current.title });
      if (title) changed = tasks.renameTask(s.state, m.taskId, title);
    }
    if (changed) { s.persist(); send(true); }
  };

  // ---------- export of the selected task (local records only; never calls Gemini) ----------
  const exportSource = async (): Promise<{ source: ExportSource; ref: string } | undefined> => {
    const d = displayed();
    if (!d || !d.taskId) return undefined;
    const s = d.s;
    try { s.poll(); } catch { s.available = false; }
    const taskId = d.taskId;
    const state = d.other ? { ...s.state, selectedTaskId: taskId } : s.state;
    const legacy = taskId === tasks.LEGACY_ID;
    const info = state.tasks.find(t => t.id === taskId);
    const meta = readMeta(s.file)?.tasks[taskId];
    if (!info && !legacy && !meta) return undefined;
    const owner = tasks.taskOfEvents(state, s.model.events);
    const events = s.model.events.filter(e => owner.get(e.key) === taskId);
    const o = originOf(s);
    const data = buildTaskData(s.model.events, state, taskId, e => s.model.commentFor(e));
    const revision = data ? taskCacheId(s.file, taskId, data) : '';
    const tn = taskNotes.get(noteKey(s.file, taskId));
    const apiKey = await context.secrets.get(GEMINI_SECRET);
    const source: ExportSource = {
      toolName: PRODUCT_NAME, version, exportedAt: new Date().toISOString(),
      task: { id: taskId, title: legacy ? history.LEGACY_TITLE : info?.title || meta?.title || 'Tarefa sem título', legacy },
      origin: { conversation: o.conversation, project: o.project, sessionId: o.sessionId, transcriptAvailable: s.available },
      events,
      commentFor: e => s.model.commentFor(e),
      stepExplanation: e => {
        const note = stepNotes.get(noteKey(s.file, e.key));
        if (!note) return undefined;
        const step = gemini.buildStep(e, s.model.commentFor(e));
        return { text: note.text, generatedAt: note.at, model: gemini.GEMINI_MODEL, stale: !step || gemini.cacheId(e.key, step) !== note.id };
      },
      taskExplanation: tn ? { text: tn.text, generatedAt: tn.at, model: gemini.GEMINI_MODEL, stale: tn.revision !== revision, incomplete: tn.incomplete } : undefined,
      warnings: buildPayload(s.model.events, { ...state, selectedTaskId: null }, s.model.report(), '', '').warnings,
      secrets: apiKey ? [apiKey] : [],
    };
    return { source, ref: history.refOf(o.sessionId, taskId) };
  };

  const exportPreview = async () => {
    const built = await exportSource();
    void panel?.webview.postMessage(built
      ? { command: 'exportPreview', ref: built.ref, preview: previewExport(built.source) }
      : { command: 'exportPreview', ref: null, error: 'Selecione uma tarefa para exportar.' });
  };

  const exportSave = async (m: any) => {
    const reply = (fields: Record<string, unknown>) => void panel?.webview.postMessage({ command: 'exportResult', ...fields });
    const format: 'html' | 'json' = m.format === 'json' ? 'json' : 'html';
    const built = await exportSource();
    if (!built || built.ref !== m.ref) return reply({ status: 'changed', message: 'A tarefa selecionada mudou. Revise a exportação novamente.' });
    const hide: Record<string, boolean> = {};
    if (m.hide && typeof m.hide === 'object') for (const [k, v] of Object.entries(m.hide)) hide[k] = v === true;
    const terms = Array.isArray(m.terms) ? m.terms.filter((t: unknown) => typeof t === 'string').slice(0, 200) : [];
    const doc = buildExport(built.source, { hide, terms });
    const folder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || os.homedir();
    const target = await vscode.window.showSaveDialog({
      title: 'Exportar tarefa', saveLabel: 'Exportar',
      defaultUri: vscode.Uri.file(path.join(folder, fileNameFor(doc, format))),
      filters: format === 'html' ? { 'Relatório HTML': ['html'] } : { 'Registros JSON': ['json'] },
    });
    if (!target) return reply({ status: 'cancelled' });
    try {
      const text = format === 'html' ? toHtml(doc) : toJson(doc);
      await vscode.workspace.fs.writeFile(target, new TextEncoder().encode(text));
    } catch {
      return reply({ status: 'error', message: 'Não foi possível salvar o arquivo. Verifique a pasta escolhida e tente de novo.' });
    }
    const name = path.basename(target.fsPath);
    reply({ status: 'saved', name });
    const action = format === 'html' ? 'Abrir no navegador' : 'Abrir no editor';
    void Promise.resolve(vscode.window.showInformationMessage('Tarefa exportada: ' + name, action)).then(choice => {
      if (choice !== action) return;
      if (format === 'html') void vscode.env.openExternal(target);
      else void vscode.window.showTextDocument(target);
    });
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
    panel.onDidDispose(() => { if (timer) clearInterval(timer); timer = undefined; panel = undefined; session = undefined; viewSession = undefined; }, undefined, context.subscriptions);
  };

  context.subscriptions.push(
    vscode.commands.registerCommand('painel-execucao.open', open),
    vscode.commands.registerCommand('painel-execucao.chooseTranscript', async () => { await open(); await chooseTranscript(); }),
    { dispose() { panel?.dispose(); } },
  );
}

export function deactivate() {}
