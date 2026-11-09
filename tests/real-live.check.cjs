// Reader + tasks + view against a LIVE real transcript (read-only), outside VS Code.
// Only the user's clicks are simulated: "select legacy" after the first new action, and "Nova tarefa"
// when a command containing painel-nova-tarefa is observed. Prints titles/file names and counts only.
// Usage: node tests/real-live.check.cjs <transcript.jsonl> [timeoutSeconds]
const assert = require('node:assert/strict');
const { load } = require('./helpers.cjs');
const { IncrementalJsonlReader } = load('transcript-reader');
const { TranscriptModel } = load('transcript-model');
const store = load('task-store');
const view = load('view');

const file = process.argv[2];
const timeout = Number(process.argv[3] || 300) * 1000;
const reader = new IncrementalJsonlReader(file);
const model = new TranscriptModel();
const state = store.emptyState();
let polls = 0, pinnedLegacy = false, newTaskClicked = false;
const started = Date.now();

function poll() {
  polls++;
  const r = reader.read();
  if (r.reset) model.reset();
  model.ingest(r.records, r.malformed);
  const before = state.segments.length;
  store.assignNewEvents(state, model.events);
  const owner = store.taskOfEvents(state, model.events);
  const live = model.events.filter(e => owner.get(e.key) !== store.LEGACY_ID && e.kind === 'action');
  if (!pinnedLegacy && live.length >= 1) { store.selectTask(state, store.LEGACY_ID); pinnedLegacy = true; }
  const marker = live.find(e => e.tool === 'Bash' && String(e.input.command).includes('painel-nova-tarefa'));
  if (marker && !newTaskClicked) { store.startNewTask(state, undefined); newTaskClicked = true; }
  return before;
}

poll(); // first read: everything already present becomes legacy
const legacyCount = model.events.length;
console.log('primeira leitura: ' + legacyCount + ' eventos marcados como legado; aguardando ações reais…');

const timer = setInterval(() => {
  poll();
  const owner = store.taskOfEvents(state, model.events);
  const second = newTaskClicked ? state.tasks[state.tasks.length - 1] : null;
  const done = second && model.events.some(e => owner.get(e.key) === second.id && e.kind === 'action' && e.result);
  if (!done && Date.now() - started < timeout) return;
  clearInterval(timer);

  assert.ok(done, 'tempo esgotado sem observar a nova tarefa');
  const keys = model.events.map(e => e.key);
  assert.equal(new Set(keys).size, keys.length, 'chaves duplicadas');
  const describe = taskId => {
    state.selectedTaskId = taskId;
    const p = view.buildPayload(model.events, state, model.report(), model.title, 'live.jsonl');
    return { p, nodes: p.nodes.filter(n => n.kind === 'action').map(n => n.title + ' · ' + n.subtitle + ' · ' + n.status) };
  };
  const selectedBefore = pinnedLegacy ? store.LEGACY_ID : null;
  const selectionKept = state.selectedTaskId === selectedBefore || state.selectedTaskId === second.id; // startNewTask selects the new task on purpose
  const [t1, t2] = state.tasks;
  const a = describe(t1.id), b = describe(t2.id);
  console.log('\nleituras realizadas: ' + polls + ' | eventos totais: ' + model.events.length + ' | chaves únicas: sim');
  console.log('\nTarefa 1 (' + t1.title + '):\n  ' + a.nodes.join('\n  '));
  console.log('\nTarefa 2 (' + t2.title + '):\n  ' + b.nodes.join('\n  '));
  const t1summary = a.p.tasks.find(t => t.id === t1.id);
  console.log('\nResumo tarefa 1: ' + a.p.summary);
  console.log('Estado tarefa 1: ' + t1summary.state + ' | falhas: ' + t1summary.failures);

  const folders = new Set(a.p.nodes.filter(n => n.kind === 'action').map(n => {
    const e = model.get(n.key); const f = String(e.input.file_path || '');
    return f ? f.replace(/\\/g, '/').split('/').slice(-2, -1)[0] : null;
  }).filter(Boolean));
  assert.ok(folders.size >= 2, 'tarefa 1 deveria ter arquivos de duas pastas: ' + [...folders]);
  assert.ok(t1summary.failures >= 1, 'a verificação com falha deveria aparecer');
  assert.notEqual(t1summary.state, 'failed');
  assert.ok(b.nodes.length >= 1);
  assert.ok(selectionKept, 'seleção mudou sozinha');

  // Reopen: fresh reader/model + persisted state must reproduce the same association without new tasks.
  const savedJson = JSON.stringify(state);
  const reopenedModel = new TranscriptModel();
  const all = new IncrementalJsonlReader(file).read();
  reopenedModel.ingest(all.records, all.malformed);
  const reopened = store.normalizeState(JSON.parse(savedJson));
  store.assignNewEvents(reopened, reopenedModel.events);
  const o1 = store.taskOfEvents(state, model.events), o2 = store.taskOfEvents(reopened, reopenedModel.events);
  const mismatch = model.events.filter(e => o1.get(e.key) !== o2.get(e.key) && o2.has(e.key)).length;
  assert.equal(mismatch, 0);
  assert.equal(reopened.tasks.length, 2);
  console.log('\nReabertura: mesma associação para todos os eventos (' + model.events.length + '), 2 tarefas, estado salvo com ' + savedJson.length + ' bytes.');
  console.log('OK: pastas na tarefa 1 = ' + [...folders].join(', ') + '; nova tarefa separada; nenhum registro duplicado.');
}, 500);
