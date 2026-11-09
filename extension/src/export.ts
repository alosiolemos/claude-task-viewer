import { ActionComment, blockText, TranscriptEvent } from './transcript-model';
import { redact } from './gemini';
import { describeAction, DetailItem } from './view';

/**
 * Export of ONE selected task for consultation and audit. Uses only records already read from the local
 * transcript and explanations already generated in this window. It never calls Gemini, never reads the
 * project's current files and applies no Gemini size limits. Everything omitted is declared in the document.
 */
export const EXPORT_FORMAT = 'claude-task-viewer.task-export';
export const EXPORT_FORMAT_VERSION = 1;

export const CATEGORIES = ['prompts', 'replies', 'inputs', 'results', 'comments', 'gemini'] as const;
export type Category = typeof CATEGORIES[number];
export const CATEGORY_LABELS: Record<Category, string> = {
  prompts: 'Pedidos do usuário',
  replies: 'Respostas do Claude',
  inputs: 'Entradas das ações (comandos, descrições, arquivos, trechos e parâmetros)',
  results: 'Resultados e mensagens de erro',
  comments: 'Comentários públicos do Claude',
  gemini: 'Explicações do Gemini (geradas por IA)',
};

export const DISCLAIMER = 'Este relatório reproduz registros da transcrição local do Claude Code. Ele não certifica que o código está correto, que testes passaram ou que o trabalho foi concluído. Uma resposta final não comprova sucesso e um erro intermediário não comprova falha da tarefa inteira.';
export const SANITIZE_NOTE = 'A sanitização automática e os termos ocultados reduzem o risco, mas não garantem a remoção de toda informação confidencial. Revise o arquivo antes de compartilhá-lo.';

export interface ExplanationNote { text: string; generatedAt: string; model: string; stale: boolean; incomplete?: boolean }

export interface ExportSource {
  toolName: string;
  version: string;
  exportedAt: string;
  task: { id: string; title: string; legacy: boolean };
  origin: { conversation: string; project: string; sessionId: string; transcriptAvailable: boolean };
  /** Only the events associated with the selected task, in transcript order. */
  events: TranscriptEvent[];
  commentFor: (e: TranscriptEvent) => ActionComment | undefined;
  stepExplanation: (e: TranscriptEvent) => ExplanationNote | undefined;
  taskExplanation?: ExplanationNote;
  warnings: string[];
  /** Exact values that must never appear in the file (the Gemini key, when configured). */
  secrets: string[];
}

export interface ExportOptions { hide?: Partial<Record<Category, boolean>>; terms?: string[] }

interface AiView { source: 'ai-generated'; provider: 'Gemini'; model: string; generatedAt: string; stale: boolean; incomplete: boolean; text: string | null; hidden: boolean }

export interface ExportRecord {
  order: number;
  type: 'prompt' | 'action' | 'reply';
  source: 'observed';
  time: string;
  text?: string | null;
  hidden?: boolean;
  tool?: string;
  label?: string;
  description?: string;
  file?: string;
  status?: 'ok' | 'error' | 'pending';
  group?: string;
  input?: unknown;
  inputHidden?: boolean;
  /** Readable labels for the HTML report only; removed from JSON. */
  inputView?: DetailItem[];
  result?: { time: string; isError: boolean; text: string | null; patch: string | null; hasImage: boolean; hidden: boolean } | null;
  claudeComment?: { source: 'claude-public-text'; scope: 'step' | 'round'; actionsInGroup: number; firstInGroup: boolean; text: string | null; hidden: boolean } | null;
  geminiExplanation?: AiView | null;
}

export interface ExportDoc {
  format: string;
  formatVersion: number;
  tool: { name: string; version: string };
  exportedAt: string;
  task: { id: string; title: string; legacy: boolean };
  origin: { conversation: string; project: string; sessionId: string; transcriptAvailable: boolean };
  notices: { disclaimer: string; sanitization: string };
  counts: { prompts: number; actions: number; replies: number; errors: number; pending: number; comments: number; geminiSteps: number; geminiTask: boolean; images: number };
  sanitization: { automaticReplacements: number; hiddenTermReplacements: number; hiddenCategories: Category[] };
  omissions: string[];
  records: ExportRecord[];
  taskExplanation: AiView | null;
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export const REDACTED = '[redigido]';
/** Field names whose values are credentials, whatever the value looks like (apiKey, credentials.password, accessToken…). */
const SENSITIVE_SUFFIX = /(password|passwd|passphrase|pwd|secret|token|apikey|accesskey|privatekey|credential|credentials|authorization|cookie)$/;
const SENSITIVE_CONTAINER = /^(credentials?|secrets?|auth)$/;
export function isSensitiveKey(key: string): boolean {
  return SENSITIVE_SUFFIX.test(key.toLowerCase().replace(/[^a-z0-9]/g, ''));
}
/**
 * The same rule inside free text (JSON, YAML, .env, command lines): "password": "x", apiKey=x, Authorization: Bearer x.
 * Nested objects ({…}) are not consumed here; their own keys are matched one by one.
 */
const KEYED_IN_TEXT = /(["']?)([A-Za-z0-9_.-]*(?:password|passwd|passphrase|pwd|secret|token|api[_-]?key|access[_-]?key|private[_-]?key|credentials?|authorization|cookie))\1(\s*[:=]\s*)("(?:[^"\\\n]|\\.)*"|'[^'\n]*'|[^\s,;{}[\]"']+(?:[ \t]+[A-Za-z0-9._~+/=-]{8,})?)/gi;

function makeCleaner(secrets: string[], terms: string[]) {
  let automatic = 0, hiddenTerms = 0;
  const exact = secrets.filter(s => typeof s === 'string' && s.length >= 8);
  const patterns = terms.map(t => t.trim()).filter(t => t.length >= 2).map(t => new RegExp(escapeRe(t), 'gi'));
  const clean = (value: string): string => {
    let out = String(value ?? '');
    for (const s of exact) if (out.includes(s)) { automatic += out.split(s).length - 1; out = out.split(s).join('[chave-redigida]'); }
    out = out.replace(KEYED_IN_TEXT, (_m, q: string, key: string, sep: string, val: string) => {
      automatic++;
      const quote = val[0] === '"' || val[0] === "'" ? val[0] : '';
      return q + key + q + sep + quote + REDACTED + quote;
    });
    const r = redact(out);
    out = r.text; automatic += r.count;
    for (const re of patterns) out = out.replace(re, () => { hiddenTerms++; return '[ocultado]'; });
    return out;
  };
  /** Structured values: a sensitive field name redacts its value, and everything below a credentials container. */
  const deep = (v: unknown, sensitive = false): unknown => {
    if (sensitive && (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean')) { automatic++; return REDACTED; }
    if (typeof v === 'string') return clean(v);
    if (Array.isArray(v)) return v.map(x => deep(x, sensitive));
    if (v && typeof v === 'object') {
      return Object.fromEntries(Object.entries(v).map(([k, x]) => {
        const lowered = k.toLowerCase().replace(/[^a-z0-9]/g, '');
        const keySensitive = sensitive || isSensitiveKey(k) || (SENSITIVE_CONTAINER.test(lowered) && x !== null && typeof x === 'object');
        return [k, deep(x, keySensitive)];
      }));
    }
    return v;
  };
  return { clean, deep, stats: () => ({ automatic, hiddenTerms }) };
}

/** Result text exactly as recorded: no trimming; image blocks are left out (declared separately). */
function resultText(content: unknown): string {
  if (!Array.isArray(content)) return blockText(content);
  return content.filter((b: any) => !(b && typeof b === 'object' && b.type === 'image')).map((b: any) => blockText([b])).join('\n');
}

const plural = (n: number, one: string, many: string) => n + ' ' + (n === 1 ? one : many);

export function buildExport(src: ExportSource, options: ExportOptions = {}): ExportDoc {
  const hide = options.hide || {};
  const hiddenCategories = CATEGORIES.filter(c => hide[c]);
  const { clean, deep, stats } = makeCleaner(src.secrets, options.terms || []);
  const ai = (note: ExplanationNote, hidden: boolean): AiView => ({
    source: 'ai-generated', provider: 'Gemini', model: note.model, generatedAt: note.generatedAt,
    stale: note.stale, incomplete: !!note.incomplete, text: hidden ? null : clean(note.text), hidden,
  });

  const records: ExportRecord[] = [];
  const seenGroups = new Set<string>();
  const counts = { prompts: 0, actions: 0, replies: 0, errors: 0, pending: 0, comments: 0, geminiSteps: 0, geminiTask: false, images: 0 };
  let staleNotes = 0;
  src.events.forEach((e, i) => {
    const base = { order: i + 1, source: 'observed' as const, time: e.time };
    if (e.kind === 'prompt' || e.kind === 'reply') {
      const prompt = e.kind === 'prompt';
      const hidden = !!hide[prompt ? 'prompts' : 'replies'];
      counts[prompt ? 'prompts' : 'replies']++;
      records.push({ ...base, type: e.kind, text: hidden ? null : clean(e.text || ''), hidden });
      return;
    }
    counts.actions++;
    const d = describeAction(e);
    const status = !e.result ? 'pending' : e.result.isError ? 'error' : 'ok';
    if (status === 'error') counts.errors++;
    if (status === 'pending') counts.pending++;
    const content = e.result?.content;
    const hasImage = Array.isArray(content) && content.some((b: any) => b && typeof b === 'object' && b.type === 'image');
    if (hasImage) counts.images++;
    const comment = src.commentFor(e);
    const group = e.group || '';
    const firstInGroup = !seenGroups.has(group);
    seenGroups.add(group);
    if (comment && firstInGroup) counts.comments++;
    const note = src.stepExplanation(e);
    if (note) { counts.geminiSteps++; if (note.stale) staleNotes++; }
    // Everything derived from the action input (description, file, parameters) comes from the sanitized copy,
    // and disappears entirely when the user hides inputs. Only the generic action label remains.
    const safeInput = hide.inputs ? null : deep(e.input || {}) as Record<string, unknown>;
    const shown = safeInput ? describeAction({ ...e, input: safeInput }) : null;
    records.push({
      ...base, type: 'action', tool: e.tool || '', label: d.title, status, group,
      description: shown ? shown.what : d.title + '.', file: shown ? shown.filePath : '',
      input: safeInput, inputHidden: !!hide.inputs,
      inputView: shown ? shown.entry.map(item => ({ ...item, text: item.text === 'Arquivo indicado ao lado' ? 'Somente o arquivo indicado acima.' : item.text })) : [],
      result: e.result ? {
        time: e.result.time, isError: e.result.isError, hasImage, hidden: !!hide.results,
        text: hide.results ? null : clean(resultText(content)),
        patch: hide.results ? null : clean(d.patch),
      } : null,
      claudeComment: comment ? {
        source: 'claude-public-text', scope: comment.scope, actionsInGroup: comment.actions, firstInGroup,
        text: hide.comments ? null : clean(comment.text), hidden: !!hide.comments,
      } : null,
      geminiExplanation: note ? ai(note, !!hide.gemini) : null,
    });
  });
  const taskExplanation = src.taskExplanation ? ai(src.taskExplanation, !!hide.gemini) : null;
  counts.geminiTask = !!taskExplanation;

  const title = clean(src.task.title);
  const origin = { ...src.origin, conversation: clean(src.origin.conversation), project: clean(src.origin.project) };
  const { automatic, hiddenTerms } = stats();
  const omissions: string[] = [];
  if (!src.origin.transcriptAvailable) omissions.push('A transcrição original não foi encontrada. Só a identificação da tarefa está disponível; pedido, ações e respostas não puderam ser exportados.');
  else if (!src.events.length) omissions.push('Nenhum registro associado a esta tarefa até a exportação.');
  for (const c of hiddenCategories) omissions.push('Ocultado por sua escolha: ' + CATEGORY_LABELS[c] + '.' + (c === 'inputs' ? ' As ações aparecem só pelo tipo, por exemplo “Executou comando”.' : ''));
  if (hiddenTerms) omissions.push(plural(hiddenTerms, 'ocorrência', 'ocorrências') + ' de termos indicados por você foram substituídas por [ocultado].');
  omissions.push(automatic
    ? 'A sanitização automática substituiu ' + plural(automatic, 'valor', 'valores') + ' com aparência de chave, token, senha ou sequência longa por marcadores como [redigido].'
    : 'A sanitização automática não encontrou chaves ou credenciais reconhecíveis.');
  omissions.push('Valores de campos com nome de credencial (por exemplo password, apiKey, token, credentials, Authorization) são substituídos por [redigido], mesmo dentro de textos e objetos.');
  omissions.push('O caminho da sua pasta pessoal aparece abreviado como ~.');
  omissions.push('Pedidos, entradas e resultados preservam espaços e quebras de linha como registrados. Respostas e comentários do Claude aparecem como o painel os registra, sem espaços nas extremidades.');
  if (counts.pending) omissions.push(plural(counts.pending, 'ação estava', 'ações estavam') + ' sem resultado registrado no momento da exportação.');
  if (counts.images) omissions.push(plural(counts.images, 'resultado continha', 'resultados continham') + ' imagem; o conteúdo visual não é exportado.');
  if (!counts.geminiSteps && !counts.geminiTask) omissions.push('Nenhuma explicação do Gemini estava disponível para esta tarefa. A exportação não solicita novas explicações.');
  omissions.push('Explicações do Gemini só ficam disponíveis enquanto a janela do VS Code em que foram geradas estiver aberta.');
  if (staleNotes || taskExplanation?.stale) omissions.push('Há explicações do Gemini geradas antes de mudanças nos registros; elas estão marcadas como desatualizadas.');
  if (taskExplanation?.incomplete) omissions.push('A explicação da tarefa recebida do Gemini estava incompleta.');
  if (src.task.legacy) omissions.push('Registros anteriores ao painel: agrupamento herdado da sessão, sem divisão em tarefas.');
  for (const w of src.warnings) omissions.push('Aviso de leitura: ' + w);
  omissions.push('O raciocínio interno do modelo não é guardado pelo painel e não foi incluído.');
  omissions.push('Conteúdos de arquivos aparecem como foram registrados na transcrição; os arquivos atuais do projeto não foram lidos.');

  return {
    format: EXPORT_FORMAT, formatVersion: EXPORT_FORMAT_VERSION,
    tool: { name: src.toolName, version: src.version }, exportedAt: src.exportedAt,
    task: { id: src.task.id, title, legacy: src.task.legacy }, origin,
    notices: { disclaimer: DISCLAIMER, sanitization: SANITIZE_NOTE },
    counts, sanitization: { automaticReplacements: automatic, hiddenTermReplacements: hiddenTerms, hiddenCategories },
    omissions, records, taskExplanation,
  };
}

/** What the review dialog shows before saving. */
export function previewExport(src: ExportSource) {
  const doc = buildExport(src);
  return {
    title: doc.task.title, taskId: doc.task.id, conversation: doc.origin.conversation, project: doc.origin.project,
    transcriptAvailable: doc.origin.transcriptAvailable, counts: doc.counts,
    automaticReplacements: doc.sanitization.automaticReplacements,
    results: doc.records.filter(r => r.result).length,
    inputs: doc.records.filter(r => r.type === 'action').length,
  };
}

export function toJson(doc: ExportDoc): string {
  const records = doc.records.map(({ inputView, ...rest }) => rest);
  return JSON.stringify({ ...doc, records }, null, 2) + '\n';
}

export function fileNameFor(doc: ExportDoc, extension: 'html' | 'json'): string {
  const slug = doc.task.title.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 50).replace(/-+$/, '') || 'tarefa';
  return 'tarefa-' + slug + '-' + doc.exportedAt.slice(0, 10) + '.' + extension;
}

// ---------- HTML ----------
const esc = (v: unknown) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
const when = (iso: string) => { const d = new Date(iso); return isNaN(d.getTime()) ? (iso ? esc(iso) : 'horário não registrado') : esc(d.toLocaleString('pt-BR')); };
const HIDDEN = '<p class="hidden-note">[Ocultado na exportação por sua escolha]</p>';
const STATUS_TEXT = { ok: 'Concluída', error: 'Erro registrado', pending: 'Sem resultado registrado' };

function block(text: string | null | undefined, code: boolean): string {
  if (text === null || text === undefined) return HIDDEN;
  if (!text.trim()) return '<p class="muted">Sem conteúdo registrado.</p>';
  return code ? '<pre>' + esc(text) + '</pre>' : '<div class="prose">' + esc(text) + '</div>';
}

function aiHtml(note: AiView, heading: string): string {
  const flags = [note.stale ? 'desatualizada: os registros mudaram depois que foi gerada' : '', note.incomplete ? 'resposta incompleta' : ''].filter(Boolean);
  return '<aside class="gemini"><p class="src">' + esc(heading) + ' · <strong>Interpretação gerada por IA</strong> (' + esc(note.provider + ' ' + note.model) + ')' +
    (note.generatedAt ? ' · ' + when(note.generatedAt) : '') + '</p>' +
    (flags.length ? '<p class="flag">' + esc(flags.join('; ')) + '</p>' : '') +
    (note.hidden ? HIDDEN : '<div class="prose">' + esc(note.text) + '</div>') +
    '<p class="muted small">Não é registro observado nem comentário do Claude. Pode conter erros.</p></aside>';
}

function recordHtml(r: ExportRecord): string {
  const head = (kind: string) => '<div class="rec-head"><span class="num">#' + r.order + '</span><span class="kind">' + kind + '</span><span class="badge obs">Registro observado</span><time>' + when(r.time) + '</time></div>';
  if (r.type === 'prompt') return '<li class="rec prompt">' + head('Pedido do usuário') + block(r.hidden ? null : r.text, false) + '</li>';
  if (r.type === 'reply') return '<li class="rec reply">' + head('Resposta do Claude ao usuário') + block(r.hidden ? null : r.text, false) +
    '<p class="muted small">Texto final da rodada. Não comprova que o trabalho deu certo.</p></li>';
  const status = r.status || 'pending';
  let html = '<li class="rec action st-' + status + '">' + head('Ação') +
    '<h3>' + esc(r.label) + ' <span class="chip ' + status + '">' + STATUS_TEXT[status] + '</span></h3>' +
    '<p class="desc">' + esc(r.description) + '</p>' +
    '<p class="meta">Ferramenta: <code>' + esc(r.tool) + '</code>' + (r.file ? ' · Arquivo: <code>' + esc(r.file) + '</code>' : '') + '</p>';
  html += '<div class="io"><section><h4>Entrada</h4>';
  if (r.inputHidden) html += HIDDEN;
  else for (const item of r.inputView || []) html += '<p class="lbl">' + esc(item.label) + '</p>' + block(item.text, !!item.code);
  html += '</section><section><h4>' + (status === 'error' ? 'Erro registrado' : 'Resultado') + '</h4>';
  if (!r.result) html += '<p class="muted">Sem resultado registrado até a exportação.</p>';
  else {
    html += '<p class="muted small">Registrado em ' + when(r.result.time) + '</p>';
    if (r.result.hidden) html += HIDDEN;
    else {
      html += block(r.result.text, true);
      if (r.result.patch) html += '<p class="lbl">Alteração registrada pelo Claude Code</p>' + block(r.result.patch, true);
    }
    if (r.result.hasImage) html += '<p class="muted small">Continha imagem; o conteúdo visual não é exportado.</p>';
  }
  html += '</section></div>';
  const c = r.claudeComment;
  if (c && c.firstInGroup) {
    html += '<aside class="claude"><p class="src"><strong>Comentário público do Claude</strong>' +
      (c.scope === 'round' ? ' · mesma resposta, cobre ' + c.actionsInGroup + ' ações' : '') + '</p>' +
      (c.hidden ? HIDDEN : '<div class="prose">' + esc(c.text) + '</div>') +
      '<p class="muted small">Texto que o Claude escreveu junto com a ação. Indica intenção; não comprova o resultado.</p></aside>';
  } else if (c) html += '<p class="muted small">Comentário do Claude: o mesmo da primeira ação desta resposta.</p>';
  if (r.geminiExplanation) html += aiHtml(r.geminiExplanation, 'Explicação desta etapa');
  return html + '</li>';
}

const CSS = `
:root{--fg:#1d1d1f;--muted:#5f6368;--line:#d9dce1;--bg:#fff;--soft:#f6f7f9;--ok:#1e7f43;--err:#b3261e;--warn:#8a6100;--claude:#c15f3c;--gemini:#1a62d6}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:15px/1.55 "Segoe UI",system-ui,-apple-system,Roboto,Arial,sans-serif}
main{max-width:980px;margin:0 auto;padding:32px 24px 56px}
h1{font-size:1.7em;line-height:1.25;margin:4px 0 16px;overflow-wrap:anywhere}h2{font-size:1.2em;margin:32px 0 12px;padding-bottom:6px;border-bottom:1px solid var(--line)}
h3{font-size:1.05em;margin:6px 0 4px}h4{margin:0 0 6px;font-size:.92em;color:var(--muted);text-transform:uppercase;letter-spacing:.03em}
.kicker{margin:0;color:var(--muted);font-size:.9em}code,pre{font-family:Consolas,"Cascadia Mono",Menlo,monospace;font-size:.88em}
dl.ident{display:grid;grid-template-columns:max-content 1fr;gap:4px 16px;margin:0}dl.ident dt{color:var(--muted)}dl.ident dd{margin:0;overflow-wrap:anywhere}
.notice{border:1px solid var(--line);border-left:4px solid var(--warn);background:var(--soft);padding:12px 16px;border-radius:4px;margin-top:20px}.notice p{margin:4px 0}
ul.stats{display:flex;flex-wrap:wrap;gap:8px;padding:0;margin:0;list-style:none}ul.stats li{border:1px solid var(--line);border-radius:4px;padding:6px 10px;background:var(--soft)}
.legend{display:grid;gap:8px;grid-template-columns:repeat(auto-fit,minmax(220px,1fr))}.legend div{border:1px solid var(--line);border-left-width:4px;padding:8px 12px;border-radius:4px}
.legend .l-obs{border-left-color:var(--muted)}.legend .l-claude{border-left-color:var(--claude)}.legend .l-gemini{border-left-color:var(--gemini)}
ol.timeline{list-style:none;padding:0;margin:0}.rec{border:1px solid var(--line);border-radius:6px;padding:12px 16px;margin:0 0 12px;background:var(--bg)}
.rec.prompt{border-left:4px solid #6b7280}.rec.reply{border-left:4px solid #6b7280}.rec.st-error{border-color:color-mix(in srgb,var(--err) 50%,var(--line))}
.rec-head{display:flex;flex-wrap:wrap;gap:6px 12px;align-items:center;font-size:.88em;color:var(--muted)}.rec-head .num{font-weight:700;color:var(--fg)}.rec-head .kind{font-weight:600;color:var(--fg)}
.rec-head time{margin-left:auto}.badge{border:1px solid var(--line);border-radius:10px;padding:0 8px;font-size:.92em}
.chip{font-size:.75em;font-weight:600;border-radius:10px;padding:1px 8px;border:1px solid currentColor;vertical-align:middle}.chip.ok{color:var(--ok)}.chip.error{color:var(--err)}.chip.pending{color:var(--warn)}
.desc{margin:2px 0}.meta{margin:2px 0 10px;color:var(--muted);font-size:.9em;overflow-wrap:anywhere}
.io{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:12px}.io section{min-width:0}
.lbl{margin:8px 0 2px;color:var(--muted);font-size:.86em}
pre{margin:0;padding:8px 10px;background:var(--soft);border:1px solid var(--line);border-radius:4px;white-space:pre-wrap;overflow-wrap:anywhere;word-break:break-word}
.prose{white-space:pre-wrap;overflow-wrap:anywhere}.muted{color:var(--muted)}.small{font-size:.85em;margin:6px 0 0}
.hidden-note{font-style:italic;color:var(--muted);margin:2px 0}
aside.claude,aside.gemini{margin-top:12px;padding:10px 14px;border-radius:4px;border:1px solid var(--line);border-left-width:4px}
aside.claude{border-left-color:var(--claude);background:color-mix(in srgb,var(--claude) 6%,var(--bg))}aside.gemini{border-left-color:var(--gemini);background:color-mix(in srgb,var(--gemini) 6%,var(--bg))}
aside .src{margin:0 0 6px;font-size:.9em}.flag{margin:0 0 6px;color:var(--warn);font-weight:600;font-size:.9em}
ul.omissions li{margin-bottom:4px}footer{margin-top:40px;color:var(--muted);font-size:.85em;border-top:1px solid var(--line);padding-top:12px}
@media (prefers-color-scheme:dark){:root{--fg:#e6e6e6;--muted:#a0a4aa;--line:#3a3d42;--bg:#1b1c1e;--soft:#25272a;--ok:#6cc58c;--err:#f2867d;--warn:#e0b44c;--claude:#e08a68;--gemini:#7aa7f5}}
@media print{:root{--fg:#000;--muted:#444;--line:#bbb;--bg:#fff;--soft:#f3f3f3}main{max-width:none;padding:0}.rec,aside,.notice{break-inside:avoid-page}pre{max-height:none}h2{break-after:avoid}.rec-head{break-after:avoid}}
`;

export function toHtml(doc: ExportDoc): string {
  const c = doc.counts;
  const stats = [
    plural(c.prompts, 'pedido', 'pedidos'), plural(c.actions, 'ação', 'ações'), plural(c.replies, 'resposta', 'respostas'),
    plural(c.errors, 'ação com erro', 'ações com erro'), plural(c.pending, 'ação sem resultado', 'ações sem resultado'),
    plural(c.comments, 'comentário do Claude', 'comentários do Claude'), plural(c.geminiSteps + (c.geminiTask ? 1 : 0), 'explicação do Gemini', 'explicações do Gemini'),
  ].map(s => '<li>' + esc(s) + '</li>').join('');
  const conversation = doc.origin.conversation || 'Conversa sem título';
  return '<!DOCTYPE html>\n<html lang="pt-BR"><head><meta charset="utf-8">' +
    '<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; style-src \'unsafe-inline\'; img-src data:; form-action \'none\'; base-uri \'none\'">' +
    '<meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex">' +
    '<title>' + esc('Relatório da tarefa — ' + doc.task.title) + '</title><style>' + CSS + '</style></head><body><main>' +
    '<header><p class="kicker">Relatório de tarefa do Claude Code · gerado por ' + esc(doc.tool.name) + '</p><h1>' + esc(doc.task.title) + '</h1>' +
    '<dl class="ident"><dt>Conversa</dt><dd>' + esc(conversation) + '</dd><dt>Projeto</dt><dd>' + esc(doc.origin.project || 'Projeto não identificado') + '</dd>' +
    '<dt>ID da tarefa</dt><dd><code>' + esc(doc.task.id) + '</code></dd><dt>Sessão do Claude</dt><dd><code>' + esc(doc.origin.sessionId) + '</code></dd>' +
    '<dt>Exportado em</dt><dd>' + when(doc.exportedAt) + '</dd><dt>Ferramenta</dt><dd>' + esc(doc.tool.name + ' — versão ' + doc.tool.version) + '</dd>' +
    '<dt>Transcrição</dt><dd>' + (doc.origin.transcriptAvailable ? 'Disponível no momento da exportação' : 'Indisponível: detalhes não exportados') + '</dd></dl></header>' +
    '<section class="notice" aria-label="Avisos"><p><strong>Este relatório não certifica a correção do código.</strong> ' + esc(doc.notices.disclaimer) + '</p><p>' + esc(doc.notices.sanitization) + '</p></section>' +
    '<h2>Resumo dos registros</h2><ul class="stats">' + stats + '</ul>' +
    '<h2>Como ler este relatório</h2><div class="legend">' +
    '<div class="l-obs"><strong>Registro observado</strong><br>Pedido, ação, entrada, resultado ou resposta como aparecem na transcrição.</div>' +
    '<div class="l-claude"><strong>Comentário do Claude</strong><br>Texto público que o Claude escreveu junto com as ações. Indica intenção, não prova.</div>' +
    '<div class="l-gemini"><strong>Interpretação do Gemini</strong><br>Explicação gerada por IA quando você pediu. Não é registro observado.</div></div>' +
    '<h2>Explicação da tarefa inteira</h2>' + (doc.taskExplanation ? aiHtml(doc.taskExplanation, 'Resumo da tarefa') : '<p class="muted">Nenhuma explicação da tarefa inteira estava disponível. A exportação não solicita explicações ao Gemini.</p>') +
    '<h2>Sequência registrada</h2>' + (doc.records.length ? '<ol class="timeline">' + doc.records.map(recordHtml).join('') + '</ol>' : '<p class="muted">Nenhum registro disponível para esta tarefa.</p>') +
    '<h2>Omissões, limites e indisponibilidades</h2><ul class="omissions">' + doc.omissions.map(o => '<li>' + esc(o) + '</li>').join('') + '</ul>' +
    '<footer>Formato ' + esc(doc.format) + ' v' + doc.formatVersion + '. Documento estático: não contém scripts nem recursos externos.</footer>' +
    '</main></body></html>\n';
}
