import { ActionComment, blockText, FormatReport, TranscriptEvent } from './transcript-model';
import { LEGACY_ID, TaskState, taskOfEvents } from './task-store';

export type NodeStatus = 'ok' | 'error' | 'pending' | 'info';

export interface ViewNode {
  key: string;
  kind: TranscriptEvent['kind'];
  icon: string;
  title: string;
  subtitle: string;
  status: NodeStatus;
  time: string;
  group: string;
}

export interface TaskSummary {
  id: string;
  title: string;
  legacy: boolean;
  active: boolean;
  state: 'answered' | 'running' | 'no-reply' | 'empty' | 'legacy';
  actions: number;
  failures: number;
  firstTime: string;
  lastTime: string;
}

export interface ViewPayload {
  sessionTitle: string;
  transcriptFile: string;
  tasks: TaskSummary[];
  selectedTaskId: string | null;
  activeTaskId: string | null;
  nodes: ViewNode[];
  summary: string;
  warnings: string[];
}

const basename = (p: unknown) => (typeof p === 'string' && p ? p.split(/[\\/]/).filter(Boolean).pop() || p : '');
const str = (v: unknown) => (typeof v === 'string' ? v : '');
const FILE_TOOLS = new Set(['Read', 'Write', 'Edit', 'MultiEdit', 'NotebookEdit']);

interface ToolLabel { icon: string; title: string; subtitle: (input: Record<string, any>) => string; what: (input: Record<string, any>) => string }

function label(tool: string, structured: any): ToolLabel {
  const file = (i: Record<string, any>) => basename(i.file_path ?? i.notebook_path ?? i.path);
  switch (tool) {
    case 'Read': return { icon: 'read', title: 'Leu arquivo', subtitle: file, what: i => 'Leu o arquivo ' + basename(i.file_path) + '.' };
    case 'Write': {
      const kind = structured && typeof structured === 'object' ? structured.type : undefined;
      const title = kind === 'create' ? 'Criou arquivo' : kind === 'update' ? 'Reescreveu arquivo' : 'Gravou arquivo';
      return { icon: 'write', title, subtitle: file, what: i => title + ' ' + basename(i.file_path) + '.' };
    }
    case 'Edit': case 'MultiEdit': return { icon: 'edit', title: 'Editou arquivo', subtitle: file, what: i => 'Alterou trechos de ' + basename(i.file_path) + '.' };
    case 'NotebookEdit': return { icon: 'edit', title: 'Editou notebook', subtitle: file, what: i => 'Alterou o notebook ' + basename(i.notebook_path) + '.' };
    case 'Bash': case 'PowerShell': return { icon: 'terminal', title: 'Executou comando', subtitle: i => str(i.description) || str(i.command), what: i => 'Executou um comando no terminal' + (str(i.description) ? ': ' + str(i.description) : '') + '.' };
    case 'Grep': return { icon: 'search', title: 'Buscou texto', subtitle: i => str(i.pattern), what: i => 'Procurou o texto “' + str(i.pattern) + '”' + (str(i.path) ? ' em ' + basename(i.path) : '') + '.' };
    case 'Glob': return { icon: 'files', title: 'Listou arquivos', subtitle: i => str(i.pattern), what: i => 'Listou arquivos que correspondem a ' + str(i.pattern) + '.' };
    case 'WebFetch': return { icon: 'web', title: 'Consultou página', subtitle: i => str(i.url), what: i => 'Consultou a página ' + str(i.url) + '.' };
    case 'WebSearch': return { icon: 'web', title: 'Pesquisou na web', subtitle: i => str(i.query), what: i => 'Pesquisou na web: ' + str(i.query) + '.' };
    case 'Agent': case 'Task': return { icon: 'agent', title: 'Delegou a subagente', subtitle: i => str(i.description), what: i => 'Pediu a um subagente: ' + str(i.description) + '.' };
    case 'Skill': return { icon: 'skill', title: 'Usou skill', subtitle: i => str(i.skill), what: i => 'Carregou a skill ' + str(i.skill) + '.' };
    case 'TodoWrite': return { icon: 'list', title: 'Atualizou lista de tarefas', subtitle: () => '', what: () => 'Atualizou a lista interna de tarefas.' };
    case 'AskUserQuestion': return { icon: 'question', title: 'Perguntou ao usuário', subtitle: () => '', what: () => 'Fez uma pergunta ao usuário.' };
    default: {
      const external = tool.startsWith('mcp__');
      const name = external ? tool.split('__').slice(2).join('__') || tool : tool;
      return { icon: 'tool', title: external ? 'Usou ferramenta externa' : 'Usou ' + tool, subtitle: () => name, what: () => 'Usou a ferramenta ' + tool + '.' };
    }
  }
}

function toNode(event: TranscriptEvent): ViewNode {
  if (event.kind === 'prompt') {
    return { key: event.key, kind: 'prompt', icon: 'user', title: 'Recebeu solicitação', subtitle: firstLine(event.text), status: 'info', time: event.time, group: event.key };
  }
  if (event.kind === 'reply') {
    return { key: event.key, kind: 'reply', icon: 'reply', title: 'Respondeu ao usuário', subtitle: firstLine(event.text), status: 'info', time: event.time, group: event.key };
  }
  const l = label(event.tool || '', event.result?.structured);
  const status: NodeStatus = !event.result ? 'pending' : event.result.isError ? 'error' : 'ok';
  return { key: event.key, kind: 'action', icon: l.icon, title: l.title, subtitle: l.subtitle(event.input || {}), status, time: event.time, group: event.group || event.key };
}

function firstLine(text: string | undefined): string {
  const line = (text || '').replace(/<([a-zA-Z_-]+)[^>]*>[\s\S]*?<\/\1>/g, ' ').split('\n').map(s => s.trim()).find(Boolean) || '';
  return line.length > 140 ? line.slice(0, 139) + '…' : line;
}

function summarize(nodes: ViewNode[]): string {
  const actions = nodes.filter(n => n.kind === 'action');
  if (!nodes.length) return 'Nenhuma ação registrada nesta tarefa ainda.';
  const count = (title: string) => actions.filter(a => a.title === title).length;
  const parts: string[] = [];
  const add = (n: number, one: string, many: string) => { if (n) parts.push(n + ' ' + (n === 1 ? one : many)); };
  add(count('Leu arquivo'), 'leitura de arquivo', 'leituras de arquivo');
  add(count('Editou arquivo'), 'edição', 'edições');
  add(actions.filter(a => ['Criou arquivo', 'Reescreveu arquivo', 'Gravou arquivo'].includes(a.title)).length, 'arquivo gravado', 'arquivos gravados');
  add(count('Executou comando'), 'comando executado', 'comandos executados');
  const known = new Set(['Leu arquivo', 'Editou arquivo', 'Criou arquivo', 'Reescreveu arquivo', 'Gravou arquivo', 'Executou comando']);
  add(actions.filter(a => !known.has(a.title)).length, 'outra ação', 'outras ações');
  const failures = actions.filter(a => a.status === 'error').length;
  const pending = actions.filter(a => a.status === 'pending').length;
  const replies = nodes.filter(n => n.kind === 'reply').length;
  let text = 'Observado: ' + (parts.length ? parts.join(', ') : 'nenhuma ação de ferramenta') + '.';
  if (failures) text += ' ' + failures + (failures === 1 ? ' ação registrou erro.' : ' ações registraram erro.');
  if (pending) text += ' ' + pending + (pending === 1 ? ' ação ainda sem resultado.' : ' ações ainda sem resultado.');
  text += replies ? ' Resposta ao usuário registrada (isso não comprova que o trabalho passou em testes).' : ' Ainda sem resposta final registrada.';
  return text;
}

export function buildPayload(events: TranscriptEvent[], state: TaskState, report: FormatReport, sessionTitle: string, transcriptFile: string, now = Date.now()): ViewPayload {
  const owner = taskOfEvents(state, events);
  const byTask = new Map<string, TranscriptEvent[]>();
  for (const event of events) {
    const id = owner.get(event.key);
    if (!id) continue;
    if (!byTask.has(id)) byTask.set(id, []);
    byTask.get(id)!.push(event);
  }
  const summarizeTask = (id: string, title: string, legacy: boolean): TaskSummary => {
    const list = byTask.get(id) || [];
    const actions = list.filter(e => e.kind === 'action');
    const last = list[list.length - 1];
    let taskState: TaskSummary['state'] = legacy ? 'legacy' : 'empty';
    if (!legacy && last) {
      if (last.kind === 'reply') taskState = 'answered';
      else taskState = now - Date.parse(last.time) < 5 * 60 * 1000 ? 'running' : 'no-reply';
    }
    return {
      id, title, legacy, active: id === state.activeTaskId, state: taskState,
      actions: actions.length, failures: actions.filter(a => a.result?.isError).length,
      firstTime: list[0]?.time || '', lastTime: last?.time || '',
    };
  };
  const tasks = state.tasks.map(t => summarizeTask(t.id, t.title, false)).reverse();
  if (byTask.has(LEGACY_ID)) tasks.push(summarizeTask(LEGACY_ID, 'Registros anteriores ao painel', true));

  const selected = state.selectedTaskId;
  const nodes = (selected ? byTask.get(selected) || [] : []).map(toNode);
  const warnings: string[] = [];
  if (!report.recognized) warnings.push('Formato da transcrição não reconhecido. Nenhum dado foi interpretado; a versão do Claude Code pode ter mudado o formato.');
  if (report.malformed) warnings.push(report.malformed + ' linha(s) ilegível(is) foram ignoradas.');
  if (report.humanRule === 'approximate') warnings.push('Esta transcrição não marca a origem das mensagens; pedidos do usuário foram identificados por critério aproximado.');
  if (report.unknownTypes.length) warnings.push('Tipos de registro não reconhecidos foram ignorados: ' + report.unknownTypes.join(', ') + '.');
  return {
    sessionTitle, transcriptFile, tasks, selectedTaskId: selected, activeTaskId: state.activeTaskId,
    nodes, summary: summarize(nodes), warnings,
  };
}

export interface DetailItem { label: string; text: string; code?: boolean }

export interface ResultView {
  kind: 'text' | 'image' | 'error' | 'pending' | 'none' | 'reply';
  label: string;
  text: string;
  patch: string;
}

export interface CommentView { label: string; text: string; note: string }

export interface ViewDetails {
  key: string;
  icon: string;
  title: string;
  state: string;
  status: NodeStatus | 'info';
  explainable: boolean;
  what: string;
  fileName: string;
  filePath: string;
  entry: DetailItem[];
  result: ResultView;
  comment: CommentView | null;
  technical: string;
}

const PARAM_LABELS: Record<string, string> = {
  command: 'Comando', description: 'Descrição', pattern: 'Padrão procurado', path: 'Pasta', glob: 'Filtro de arquivos',
  query: 'Pesquisa', url: 'Endereço', prompt: 'Instrução', skill: 'Skill', subagent_type: 'Tipo de agente',
  timeout: 'Tempo limite (ms)', output_mode: 'Formato da saída', head_limit: 'Limite de resultados',
};

function humanKey(key: string): string {
  return PARAM_LABELS[key] ?? key.replace(/_/g, ' ').replace(/^./, c => c.toUpperCase());
}

function entryFor(tool: string, input: Record<string, any>, hasFile: boolean): DetailItem[] {
  const items: DetailItem[] = [];
  const push = (label: string, value: unknown, code = false) => {
    if (value === undefined || value === null || String(value) === '') return;
    items.push({ label, text: String(value), code });
  };
  switch (tool) {
    case 'Read':
      if (input.offset || input.limit) push('Linhas', (input.offset ? 'a partir da linha ' + input.offset : 'desde o início') + (input.limit ? ', até ' + input.limit + ' linhas' : ''));
      break;
    case 'Write': push('Conteúdo gravado', input.content, true); break;
    case 'Edit':
      push('Trecho antes', input.old_string, true);
      push('Trecho depois', input.new_string, true);
      if (input.replace_all) push('Substituição', 'Todas as ocorrências');
      break;
    case 'MultiEdit':
      if (Array.isArray(input.edits)) input.edits.forEach((e: any, i: number) => {
        push('Alteração ' + (i + 1) + ' · antes', e?.old_string, true);
        push('Alteração ' + (i + 1) + ' · depois', e?.new_string, true);
      });
      break;
    case 'NotebookEdit': push('Conteúdo novo', input.new_source, true); break;
    default:
      for (const [key, value] of Object.entries(input)) {
        if (key === 'file_path' || key === 'notebook_path' || (key === 'path' && !['Grep', 'Glob'].includes(tool))) continue;
        if (typeof value === 'string') push(humanKey(key), value, key === 'command' || value.length > 120 || value.includes('\n'));
        else if (value !== undefined && value !== null) items.push({ label: humanKey(key), text: JSON.stringify(value, null, 2), code: true });
      }
  }
  if (!items.length) {
    return hasFile ? [{ label: 'Arquivo', text: 'Arquivo indicado ao lado' }] : [{ label: 'Parâmetros', text: 'Nenhum parâmetro registrado.' }];
  }
  return items;
}

function patchOf(structured: any): string {
  if (!structured || !Array.isArray(structured.structuredPatch)) return '';
  return structured.structuredPatch.map((h: any) => (Array.isArray(h?.lines) ? h.lines.join('\n') : '')).filter(Boolean).join('\n…\n');
}

function resultFor(event: TranscriptEvent, patch: string): ResultView {
  if (!event.result) return { kind: 'pending', label: 'Sem resultado registrado ainda', text: '', patch: '' };
  const content = event.result.content;
  const hasImage = Array.isArray(content) && content.some((b: any) => b && typeof b === 'object' && b.type === 'image');
  const text = blockText(content).replace(/\[imagem\]/g, '');
  const hasText = text.trim().length > 0;
  if (event.result.isError) return { kind: 'error', label: 'Erro registrado', text: hasText ? text : 'A ferramenta indicou erro sem mensagem.', patch: '' };
  if (hasImage) return { kind: 'image', label: 'Resultado de imagem', text: hasText ? text : 'A imagem foi enviada à ferramenta; o conteúdo visual não é exibido no painel.', patch };
  if (!hasText && !patch) return { kind: 'none', label: 'Sem retorno registrado', text: '', patch: '' };
  return { kind: 'text', label: 'Retorno registrado', text, patch };
}

function commentView(comment: ActionComment | undefined): CommentView {
  if (!comment) return { label: 'COMENTÁRIO DO CLAUDE', text: '', note: '' };
  if (comment.scope === 'round') {
    return {
      label: 'COMENTÁRIO DA RODADA', text: comment.text,
      note: 'Texto público desta mesma resposta do Claude, que cobre ' + comment.actions + ' ações; esta etapa é uma delas. Não comprova o resultado.',
    };
  }
  return { label: 'COMENTÁRIO DO CLAUDE', text: comment.text, note: 'Texto público escrito pelo Claude nesta resposta. Não comprova o resultado.' };
}

/** Same labels and entry items shown in the details dock, for reuse outside the webview (export). */
export function describeAction(event: TranscriptEvent): { title: string; what: string; filePath: string; entry: DetailItem[]; patch: string } {
  const input = event.input || {};
  const l = label(event.tool || '', event.result?.structured);
  const filePath = FILE_TOOLS.has(event.tool || '') ? str(input.file_path) || str(input.notebook_path) : '';
  return { title: l.title, what: l.what(input), filePath, entry: entryFor(event.tool || '', input, !!filePath), patch: patchOf(event.result?.structured) };
}

export function buildDetails(event: TranscriptEvent, comment?: ActionComment): ViewDetails {
  if (event.kind !== 'action') {
    const prompt = event.kind === 'prompt';
    return {
      key: event.key, icon: prompt ? 'user' : 'reply', status: 'info', explainable: false,
      state: prompt ? 'Pedido recebido' : 'Resposta final',
      title: prompt ? 'Recebeu solicitação' : 'Respondeu ao usuário',
      what: prompt ? 'Mensagem enviada pelo usuário.' : 'Resposta final da rodada enviada ao usuário.',
      fileName: '', filePath: '',
      entry: prompt ? [{ label: 'Mensagem do usuário', text: event.text || '' }] : [],
      result: prompt
        ? { kind: 'none', label: 'Não se aplica a mensagens do usuário', text: '', patch: '' }
        : { kind: 'reply', label: 'Resposta', text: event.text || '', patch: '' },
      comment: null,
      technical: 'Registro: ' + event.key.slice(2) + '\nHorário: ' + event.time,
    };
  }
  const input = event.input || {};
  const l = label(event.tool || '', event.result?.structured);
  const isFile = FILE_TOOLS.has(event.tool || '');
  const filePath = isFile ? str(input.file_path) || str(input.notebook_path) : '';
  const patch = patchOf(event.result?.structured);
  const status: NodeStatus = !event.result ? 'pending' : event.result.isError ? 'error' : 'ok';
  const state = !event.result ? 'Sem resultado ainda' : event.result.isError ? 'Erro registrado' : 'Concluída';
  return {
    key: event.key, icon: l.icon, title: l.title, state, status, explainable: true,
    what: l.what(input), fileName: basename(filePath), filePath,
    entry: entryFor(event.tool || '', input, !!filePath),
    result: resultFor(event, patch),
    comment: commentView(comment),
    technical: 'Ferramenta: ' + event.tool + '\nID da chamada: ' + event.key.slice(2) + '\nGrupo (mesma mensagem do modelo): ' + (event.group || '-') +
      '\nIniciada: ' + event.time + (event.result ? '\nResultado: ' + event.result.time : '\nResultado: ainda não registrado'),
  };
}
