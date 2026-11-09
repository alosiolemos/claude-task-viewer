const { test } = require('node:test');
const assert = require('node:assert/strict');
const { load, fx } = require('./helpers.cjs');

const { TranscriptModel } = load('transcript-model');
const store = load('task-store');
const view = load('view');

const T = n => '2026-11-09T12:' + String(Math.floor(n / 60)).padStart(2, '0') + ':' + String(n % 60).padStart(2, '0') + '.000Z';
let seq = 0;
const id = p => p + ++seq;

// Builds one observed round: prompt -> actions (optionally failing) -> final reply.
function round(text, files, { fail = false, reply = true } = {}) {
  const records = [fx.prompt(id('u'), text, T(seq))];
  for (const file of files) {
    const call = id('tu');
    records.push(fx.toolUse(id('a'), id('m'), call, 'Edit', { file_path: file, old_string: 'a', new_string: 'b' }, T(seq)));
    records.push(fx.toolResult(id('u'), call, fail ? 'Erro: trecho não encontrado' : 'ok', fail, T(seq)));
  }
  if (reply) records.push(fx.text(id('a'), id('m'), 'Pronto.', 'end_turn', T(seq)));
  return records;
}

function feed(model, state, records) {
  model.ingest(records);
  store.assignNewEvents(state, model.events, Date.parse('2026-11-09T12:00:00Z'));
}

const tasksOf = (model, state) => {
  const owner = store.taskOfEvents(state, model.events);
  return model.events.map(e => owner.get(e.key));
};

test('tarefas: registros existentes na primeira abertura ficam como legado', () => {
  const model = new TranscriptModel();
  const state = store.emptyState();
  feed(model, state, round('Pedido antigo', ['C:/p/a.ts']));
  assert.equal(state.tasks.length, 0);
  assert.ok(tasksOf(model, state).every(t => t === store.LEGACY_ID));
  assert.equal(state.selectedTaskId, store.LEGACY_ID);
});

test('tarefas: arquivos em pastas diferentes e uma correção ficam na MESMA tarefa', () => {
  const model = new TranscriptModel();
  const state = store.emptyState();
  feed(model, state, []);
  feed(model, state, round('Ajustar o painel', ['C:/p/src/a.ts', 'C:/p/docs/b.md']));
  feed(model, state, round('Corrija o erro do passo anterior', ['C:/p/src/a.ts']));
  assert.equal(state.tasks.length, 1);
  const owners = new Set(tasksOf(model, state));
  assert.equal(owners.size, 1);
  assert.equal(state.tasks[0].title, 'Ajustar o painel');
});

test('tarefas: “Nova tarefa” separa; “Continuar” volta à tarefa escolhida sem apagar etapas', () => {
  const model = new TranscriptModel();
  const state = store.emptyState();
  feed(model, state, []);
  feed(model, state, round('Primeira tarefa', ['C:/p/a.ts']));
  const first = state.activeTaskId;
  const firstCount = tasksOf(model, state).filter(t => t === first).length;

  store.startNewTask(state, undefined, Date.parse('2026-11-09T12:10:00Z'));
  feed(model, state, round('Segunda tarefa', ['C:/q/z.ts']));
  const second = state.activeTaskId;
  assert.notEqual(second, first);
  assert.equal(state.tasks.find(t => t.id === second).title, 'Segunda tarefa');
  assert.equal(tasksOf(model, state).filter(t => t === first).length, firstCount);

  assert.equal(store.continueTask(state, first), true);
  feed(model, state, round('Mais um ajuste', ['C:/p/a.ts']));
  const owners = tasksOf(model, state);
  assert.ok(owners.filter(t => t === first).length > firstCount);
  assert.equal(owners.filter(t => t === second).length, 3, 'pedido + ação + resposta da segunda tarefa');
  assert.equal(state.tasks.length, 2);
});

test('tarefas: estado persistido reconstrói a mesma associação ao reabrir', () => {
  const records = [];
  const model = new TranscriptModel();
  const state = store.emptyState();
  feed(model, state, []);
  const r1 = round('Tarefa A', ['C:/p/a.ts']); records.push(...r1); feed(model, state, r1);
  store.startNewTask(state, 'Tarefa B (nome escolhido)');
  const r2 = round('Pedido B', ['C:/p/b.ts']); records.push(...r2); feed(model, state, r2);

  const saved = JSON.parse(JSON.stringify(state));
  const reopenedModel = new TranscriptModel();
  reopenedModel.ingest(records);
  const reopened = store.normalizeState(saved);
  assert.equal(store.assignNewEvents(reopened, reopenedModel.events), false, 'reabrir não deve criar associações');
  assert.deepEqual(tasksOf(reopenedModel, reopened), tasksOf(model, state));
  assert.equal(reopened.tasks[1].title, 'Tarefa B (nome escolhido)');
  assert.ok(JSON.stringify(saved).length < 2000, 'estado guarda IDs e associações, não a transcrição');
});

test('tarefas: seleção escolhida pelo usuário não muda com novas ações', () => {
  const model = new TranscriptModel();
  const state = store.emptyState();
  feed(model, state, round('Antigo', ['C:/p/a.ts']));
  feed(model, state, round('Atual', ['C:/p/a.ts']));
  store.selectTask(state, store.LEGACY_ID);
  feed(model, state, round('Outro ajuste', ['C:/p/c.ts']));
  assert.equal(state.selectedTaskId, store.LEGACY_ID);
});

test('visão: falha intermediária não marca a tarefa inteira como falha', () => {
  const model = new TranscriptModel();
  const state = store.emptyState();
  feed(model, state, []);
  feed(model, state, round('Ajustar', ['C:/p/a.ts'], { fail: true }));
  feed(model, state, round('Tente de novo', ['C:/p/a.ts']));
  const payload = view.buildPayload(model.events, state, model.report(), 'Sessão', 'x.jsonl', Date.parse('2026-11-09T13:00:00Z'));
  const task = payload.tasks.find(t => t.id === state.activeTaskId);
  assert.equal(task.state, 'answered');
  assert.equal(task.failures, 1);
  assert.deepEqual(payload.nodes.map(n => n.status), ['info', 'error', 'info', 'info', 'ok', 'info']);
  assert.match(payload.summary, /1 ação registrou erro/);
});

test('visão: títulos curtos no nó; caminho e comando completos ficam nos detalhes', () => {
  const model = new TranscriptModel();
  const longCommand = 'npm run build -- ' + 'x'.repeat(3000);
  const longOutput = 'linha\n'.repeat(4000);
  model.ingest([
    fx.toolUse('a1', 'm1', 'tu1', 'Bash', { command: longCommand, description: 'Compilar a extensão' }, T(1)),
    fx.toolResult('u1', 'tu1', longOutput, false, T(2)),
    fx.toolUse('a2', 'm2', 'tu2', 'Read', { file_path: 'C:/Users/x/proj/webview/src/components/CanvasWorkflow.tsx' }, T(3)),
  ]);
  const state = store.emptyState();
  store.assignNewEvents(state, []);
  store.assignNewEvents(state, model.events);
  const payload = view.buildPayload(model.events, state, model.report(), '', '', Date.parse('2026-11-09T12:00:10Z'));
  assert.deepEqual(payload.nodes.map(n => [n.title, n.subtitle, n.status]), [
    ['Executou comando', 'Compilar a extensão', 'ok'],
    ['Leu arquivo', 'CanvasWorkflow.tsx', 'pending'],
  ]);
  const details = view.buildDetails(model.get('t:tu1'));
  assert.equal(details.entry.find(i => i.label === 'Comando').text, longCommand);
  assert.equal(details.result.text, longOutput, 'saída completa, sem corte');
  const read = view.buildDetails(model.get('t:tu2'));
  assert.equal(read.fileName, 'CanvasWorkflow.tsx');
  assert.equal(read.filePath, 'C:/Users/x/proj/webview/src/components/CanvasWorkflow.tsx');
  assert.equal(read.what.includes('C:/'), false, 'descrição não repete o caminho');
});

test('visão: edição mostra antes/depois e o patch registrado; erro aparece separado', () => {
  const model = new TranscriptModel();
  model.ingest([
    fx.toolUse('a1', 'm1', 'tu1', 'Edit', { file_path: 'C:/p/a.ts', old_string: 'antigo', new_string: 'novo' }, T(1)),
    fx.toolResult('u1', 'tu1', 'ok', false, T(2), { structuredPatch: [{ lines: ['-antigo', '+novo'] }] }),
    fx.toolUse('a2', 'm2', 'tu2', 'Edit', { file_path: 'C:/p/a.ts', old_string: 'x', new_string: 'y' }, T(3)),
    fx.toolResult('u2', 'tu2', 'String to replace not found', true, T(4)),
  ]);
  const ok = view.buildDetails(model.get('t:tu1'));
  assert.equal(ok.entry.find(i => i.label === 'Trecho antes').text, 'antigo');
  assert.equal(ok.entry.find(i => i.label === 'Trecho depois').text, 'novo');
  assert.equal(ok.result.patch, '-antigo\n+novo');
  const failed = view.buildDetails(model.get('t:tu2'));
  assert.equal(failed.result.kind, 'error');
  assert.equal(failed.result.text, 'String to replace not found');
  assert.equal(failed.result.patch, '');
});

test('visão: formato desconhecido gera aviso explícito', () => {
  const model = new TranscriptModel();
  model.ingest([{ type: 'estrutura-futura' }]);
  const payload = view.buildPayload(model.events, store.emptyState(), model.report(), '', '');
  assert.ok(payload.warnings.some(w => w.includes('não reconhecido')));
});

test('abertura: pedido ainda em andamento fica junto das ações, só rodada concluída vai ao legado',()=>{
 const model=new TranscriptModel(),state=store.emptyState();
 const old=round('Antigo concluído',['antigo.js']);const pending=round('Consultar enriquecimento',['atual.js'],{reply:false});
 feed(model,state,[...old,...pending]);const task=state.activeTaskId;
 assert.ok(task);assert.equal(state.tasks[0].title,'Consultar enriquecimento');
 const owners=tasksOf(model,state);assert.ok(owners.slice(0,3).every(x=>x===store.LEGACY_ID));assert.ok(owners.slice(3).every(x=>x===task));
 feed(model,state,[fx.text(id('a'),id('m'),'Resposta da consulta','end_turn',T(seq))]);assert.equal(state.tasks.length,1);assert.equal(tasksOf(model,state).at(-1),task);
 const saved=store.normalizeState(JSON.parse(JSON.stringify(state)));assert.equal(store.assignNewEvents(saved,model.events),false);assert.deepEqual(tasksOf(model,saved),tasksOf(model,state));
});

test('abertura: só pedido presente já inicia tarefa com título, sem legado vazio',()=>{
 const model=new TranscriptModel(),state=store.emptyState();feed(model,state,[fx.prompt(id('u'),'Vamos testar',T(seq))]);
 assert.equal(state.tasks.length,1);assert.equal(state.tasks[0].title,'Vamos testar');assert.equal(state.legacyEndKey,null);assert.equal(state.selectedTaskId,state.activeTaskId);
});

test('reparo: recupera pedido separado pela versão anterior sem trocar ID nem duplicar',()=>{
 const model=new TranscriptModel();model.ingest(round('Consulta em andamento',['projeto.js']));const events=model.events;
 const state=store.emptyState();Object.assign(state,{initialized:true,legacyEndKey:events[0].key,lastAssignedKey:events.at(-1).key,activeTaskId:'existente',selectedTaskId:'existente',tasks:[{id:'existente',title:'Tarefa sem título',titleSource:'default',createdAt:T(1)}],segments:[{startKey:events[1].key,taskId:'existente'}]});
 assert.equal(store.assignNewEvents(state,events),true);assert.equal(state.activeTaskId,'existente');assert.equal(state.tasks[0].title,'Consulta em andamento');assert.ok(tasksOf(model,state).every(x=>x==='existente'));assert.equal(store.assignNewEvents(state,events),false);
});

test('reparo: não incorpora pedido antigo já respondido nem altera tarefa nomeada pelo usuário',()=>{
 const model=new TranscriptModel();model.ingest(round('Antigo',['a.js']));const events=model.events;
 const state=store.emptyState();Object.assign(state,{initialized:true,legacyEndKey:events.at(-1).key,lastAssignedKey:events.at(-1).key,activeTaskId:'manual',tasks:[{id:'manual',title:'Meu título',titleSource:'user',createdAt:T(1)}],segments:[]});
 assert.equal(store.assignNewEvents(state,events),false);assert.equal(state.tasks[0].title,'Meu título');assert.ok(tasksOf(model,state).every(x=>x===store.LEGACY_ID));
});

test('reparo: seleção do legado que ficou vazio volta para a tarefa recuperada',()=>{
 const model=new TranscriptModel();model.ingest(round('Pedido recuperado',['projeto.js']));const events=model.events;
 const state=store.emptyState();Object.assign(state,{initialized:true,legacyEndKey:events[0].key,lastAssignedKey:events.at(-1).key,activeTaskId:'existente',selectedTaskId:store.LEGACY_ID,selectionPinned:true,tasks:[{id:'existente',title:'Tarefa sem título',titleSource:'default',createdAt:T(1)}],segments:[{startKey:events[1].key,taskId:'existente'}]});
 store.assignNewEvents(state,events);assert.equal(state.selectedTaskId,'existente');assert.equal(state.selectionPinned,false);assert.equal(view.buildPayload(events,state,model.report(),'','').tasks.some(t=>t.legacy),false);
});
