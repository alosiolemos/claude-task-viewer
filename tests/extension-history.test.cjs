// Activates the real extension bundle with a minimal vscode stub and two invented sessions in two projects.
// Checks origin in the header payload, cross-session history, consultation without redirecting capture,
// persistence after reopening, missing transcripts and the export flow (review, cancel, save) without Gemini.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Module = require('node:module');
const esbuild = require('esbuild');
const { fx, line } = require('./helpers.cjs');

const EXT = path.join(__dirname, '..', 'extension');
const KEY = 'AIzaSyFAKEKEY-somente-para-teste-0002';
const T = n => new Date(Date.parse('2026-11-09T12:00:00Z') + n * 1000).toISOString();
const AI_OK = 'O que foi feito?\nLeu o arquivo.\n\nQual foi o resultado?\nOk.\n\nO que isso significa?\nNada mudou.';

function bundle() {
  const outfile = path.join(os.tmpdir(), 'painel-ext-hist-' + process.pid + '.cjs');
  esbuild.buildSync({ entryPoints: [path.join(EXT, 'src/extension.ts')], bundle: true, platform: 'node', format: 'cjs', external: ['vscode'], outfile, logLevel: 'silent' });
  return outfile;
}

function memento(map) {
  return { get: (k, d) => (map.has(k) ? map.get(k) : d), update: async (k, v) => { if (v === undefined) map.delete(k); else map.set(k, v); }, keys: () => [...map.keys()] };
}

function makeHost(state) {
  const commands = {};
  const panels = [];
  const vscode = {
    ViewColumn: { Beside: 2 }, ConfigurationTarget: { Workspace: 2 },
    Uri: { joinPath: (b, ...p) => ({ fsPath: path.join(b.fsPath, ...p) }), file: p => ({ fsPath: p }) },
    workspace: {
      getConfiguration: () => ({ get: (k, d) => (state.config[k] !== undefined ? state.config[k] : d), update: async (k, v) => { state.config[k] = v; } }),
      workspaceFolders: undefined,
      fs: {
        readFile: async uri => fs.readFileSync(uri.fsPath),
        writeFile: async (uri, bytes) => { state.writes.push(uri.fsPath); fs.writeFileSync(uri.fsPath, Buffer.from(bytes)); },
      },
    },
    window: {
      createWebviewPanel: () => {
        const panel = {
          posted: [], listeners: [], disposers: [],
          webview: { html: '', cspSource: 'x:', postMessage: async m => { panel.posted.push(JSON.parse(JSON.stringify(m))); return true; }, onDidReceiveMessage: cb => { panel.listeners.push(cb); return { dispose() {} }; } },
          reveal() {}, onDidDispose: cb => { panel.disposers.push(cb); return { dispose() {} }; }, dispose() { panel.disposers.forEach(cb => cb()); },
        };
        panels.push(panel);
        return panel;
      },
      showInputBox: async () => state.nextInput,
      showWarningMessage: async () => state.nextWarning,
      showInformationMessage: async (msg) => { state.infos.push(msg); return undefined; },
      showQuickPick: async items => (state.pick ? items.find(state.pick) : undefined),
      showOpenDialog: async () => undefined,
      showSaveDialog: async opts => { state.saveDialogs.push(opts); return state.saveTo ? { fsPath: state.saveTo } : undefined; },
      showTextDocument: async () => undefined,
      showErrorMessage: () => undefined,
    },
    commands: { registerCommand: (id, fn) => { commands[id] = fn; return { dispose() {} }; } },
    env: { clipboard: { writeText: async () => {} }, openExternal: async () => true },
  };
  return { vscode, commands, panels };
}

test('histórico entre sessões, origem, consulta sem redirecionar a captura e exportação', async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'painel-hist-'));
  const dirA = path.join(root, 'c--work-projeto-a'), dirB = path.join(root, 'c--work-projeto-b');
  fs.mkdirSync(dirA); fs.mkdirSync(dirB);
  const fileA = path.join(dirA, 'sess-aaaa.jsonl'), fileB = path.join(dirB, 'sess-bbbb.jsonl');
  const cwd = (r, dir) => ({ ...r, cwd: dir });
  fs.writeFileSync(fileA, [
    cwd(fx.prompt('a-p0', 'Pedido antigo de A', T(0)), 'C:\\work\\projeto-a'),
    fx.text('a-r0', 'a-m0', 'Feito antes do painel.', 'end_turn', T(1)),
    { type: 'ai-title', aiTitle: 'Conversa A gerada', sessionId: 'sess-aaaa' },
  ].map(line).join(''));
  fs.writeFileSync(fileB, [
    { type: 'ai-title', aiTitle: 'Nome gerado de B', sessionId: 'sess-bbbb' },
    { type: 'custom-title', customTitle: 'Conversa B renomeada', sessionId: 'sess-bbbb' },
    cwd(fx.prompt('b-p0', 'Pedido antigo de B', T(2)), 'C:\\work\\projeto-b'),
    fx.text('b-r0', 'b-m0', 'Ok.', 'end_turn', T(3)),
  ].map(line).join(''));
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'painel-export-'));

  const globalData = new Map(), workspaceData = new Map(), secrets = new Map([['painel-execucao.gemini.apiKey', KEY]]);
  const state = { config: { transcriptsDir: dirA, refreshInterval: 600000 }, writes: [], infos: [], saveDialogs: [], nextInput: undefined, nextWarning: undefined, pick: null, saveTo: null };
  const { vscode, commands, panels } = makeHost(state);
  const context = () => ({
    subscriptions: [], extension: { packageJSON: { version: '0.10.0' } }, extensionUri: { fsPath: EXT },
    globalState: memento(globalData), workspaceState: memento(workspaceData),
    secrets: { get: async k => secrets.get(k), store: async (k, v) => { secrets.set(k, v); }, delete: async k => { secrets.delete(k); } },
  });
  const origLoad = Module._load;
  Module._load = function (request, ...rest) { return request === 'vscode' ? vscode : origLoad.call(this, request, ...rest); };
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, init) => { calls.push(String(url)); return { ok: true, status: 200, json: async () => ({ candidates: [{ content: { parts: [{ text: AI_OK }] }, finishReason: 'STOP' }] }) }; };
  const file = bundle();
  t.after(() => {
    Module._load = origLoad; globalThis.fetch = originalFetch;
    panels.forEach(p => p.dispose());
    fs.rmSync(root, { recursive: true, force: true }); fs.rmSync(outDir, { recursive: true, force: true });
    try { fs.unlinkSync(file); } catch { /* gone */ }
  });

  const ext = require(file);
  ext.activate(context());
  await commands['painel-execucao.open']();
  let panel = panels.at(-1);
  const send = async msg => { for (const cb of panel.listeners) await cb(msg); };
  const last = cmd => panel.posted.filter(m => m.command === cmd).at(-1);
  const payload = async () => { await send({ command: 'ready' }); return last('payload').payload; };

  // 1) session A followed: header origin uses the conversation name, not the task title
  state.nextInput = 'Tarefa de A';
  await send({ command: 'newTask' });
  fs.appendFileSync(fileA, [fx.prompt('a-p1', 'Ler o arquivo de A', T(10)), fx.toolUse('a-u1', 'a-m1', 'a-t1', 'Read', { file_path: 'C:/work/projeto-a/a.ts' }, T(11)), fx.toolResult('a-x1', 'a-t1', 'conteúdo A ' + KEY, false, T(12)), fx.text('a-r1', 'a-m2', 'Li o arquivo.', 'end_turn', T(13))].map(line).join(''));
  let p = await payload();
  const taskA = p.selectedTaskId;
  assert.equal(p.origin.conversation, 'Conversa A gerada');
  assert.equal(p.origin.project, 'projeto-a');
  assert.notEqual(p.origin.conversation, p.tasks.find(x => x.id === taskA).title);
  assert.equal(p.selectedRef, 'sess-aaaa|' + taskA);
  assert.equal(p.viewingOther, false);

  // 2) switch the followed session to B (another project) and create a task there
  state.config.transcriptsDir = dirB;
  state.pick = item => item.file === fileB;
  await send({ command: 'chooseTranscript' });
  state.nextInput = 'Tarefa de B';
  await send({ command: 'newTask' });
  fs.appendFileSync(fileB, [fx.prompt('b-p1', 'Rodar testes de B', T(20)), fx.toolUse('b-u1', 'b-m1', 'b-t1', 'Bash', { command: 'npm test' }, T(21)), fx.toolResult('b-x1', 'b-t1', 'ok', false, T(22))].map(line).join(''));
  p = await payload();
  const taskB = p.selectedTaskId;
  assert.equal(p.origin.conversation, 'Conversa B renomeada', 'o nome dado pelo usuário vem da transcrição');
  assert.equal(p.origin.project, 'projeto-b');
  const refs = p.history.map(e => e.ref);
  assert.equal(new Set(refs).size, refs.length, 'histórico com duplicatas');
  assert.ok(refs.includes('sess-aaaa|' + taskA) && refs.includes('sess-bbbb|' + taskB) && refs.includes('sess-aaaa|legado') && refs.includes('sess-bbbb|legado'));
  const entryA = p.history.find(e => e.ref === 'sess-aaaa|' + taskA);
  assert.equal(entryA.conversation, 'Conversa A gerada'); assert.equal(entryA.project, 'projeto-a'); assert.equal(entryA.actions, 1); assert.equal(entryA.state, 'answered');
  assert.notEqual(entryA.projectKey, p.currentProjectKey, 'a tarefa de A pertence a outro projeto');
  assert.equal(p.activeRef, 'sess-bbbb|' + taskB);
  const storedB = JSON.stringify(globalData.get('painel-execucao.tasks:' + fileB.toLowerCase()));

  // 3) consult A's task: display changes, capture target does not
  await send({ command: 'selectTask', taskId: taskA, ref: entryA.ref });
  p = last('payload').payload;
  assert.equal(p.viewingOther, true);
  assert.equal(p.selectedTaskId, taskA);
  assert.equal(p.origin.conversation, 'Conversa A gerada');
  assert.equal(p.origin.project, 'projeto-a');
  assert.equal(p.activeRef, 'sess-bbbb|' + taskB, 'a tarefa ativa continua em B');
  assert.ok(p.nodes.some(n => n.title === 'Leu arquivo'), 'detalhes de A carregados ao abrir');
  assert.equal(JSON.stringify(globalData.get('painel-execucao.tasks:' + fileB.toLowerCase())), storedB, 'consultar não pode alterar associações de B');
  const storedA = JSON.stringify(globalData.get('painel-execucao.tasks:' + fileA.toLowerCase()));
  fs.appendFileSync(fileB, [fx.toolUse('b-u2', 'b-m3', 'b-t2', 'Read', { file_path: 'b.ts' }, T(30)), fx.toolResult('b-x2', 'b-t2', 'ok', false, T(31))].map(line).join(''));
  fs.appendFileSync(fileA, line(fx.prompt('a-p9', 'Outra janela escreveu em A', T(32))));
  p = await payload();
  assert.equal(JSON.stringify(globalData.get('painel-execucao.tasks:' + fileA.toLowerCase())), storedA, 'a sessão consultada é somente leitura');
  assert.equal(p.selectedTaskId, taskA, 'a consulta permanece selecionada');
  assert.equal(p.history.find(e => e.ref === 'sess-bbbb|' + taskB).actions, 2, 'novas ações de B continuam indo para a tarefa ativa de B');
  assert.equal(p.history.find(e => e.ref === entryA.ref).actions, 1, 'a tarefa consultada não recebe ações novas');
  await send({ command: 'renameTask', taskId: taskA });
  p = await payload();
  assert.equal(p.history.find(e => e.ref === entryA.ref).title, 'Tarefa de A', 'consulta é somente leitura');

  // 4) Gemini explanation for one step of the consulted task, then export it without new calls
  state.nextWarning = 'Enviar ao Gemini';
  const readNode = p.nodes.find(n => n.title === 'Leu arquivo');
  await send({ command: 'explain', key: readNode.key, sig: 's' });
  assert.equal(last('explanation').status, 'ready');
  assert.equal(calls.length, 1);
  await send({ command: 'exportPreview' });
  const preview = last('exportPreview');
  assert.equal(preview.ref, entryA.ref);
  assert.equal(preview.preview.counts.actions, 1); assert.equal(preview.preview.counts.geminiSteps, 1);
  assert.equal(preview.preview.conversation, 'Conversa A gerada');
  // cancel: nothing is written
  state.saveTo = null;
  await send({ command: 'exportSave', ref: entryA.ref, format: 'html', hide: {}, terms: [] });
  assert.equal(last('exportResult').status, 'cancelled');
  assert.equal(state.writes.length, 0); assert.deepEqual(fs.readdirSync(outDir), []);
  // a stale reference is refused before the save dialog
  await send({ command: 'exportSave', ref: 'sess-bbbb|' + taskB, format: 'html', hide: {}, terms: [] });
  assert.equal(last('exportResult').status, 'changed'); assert.equal(state.saveDialogs.length, 1);
  // save HTML and JSON
  state.saveTo = path.join(outDir, 'a.html');
  await send({ command: 'exportSave', ref: entryA.ref, format: 'html', hide: {}, terms: [] });
  assert.equal(last('exportResult').status, 'saved');
  const html = fs.readFileSync(state.saveTo, 'utf8');
  assert.ok(html.includes('Conversa A gerada') && html.includes('projeto-a') && html.includes(taskA) && html.includes('0.10.0'));
  assert.ok(html.includes('Ler o arquivo de A') && !html.includes('Rodar testes de B'), 'somente a tarefa selecionada');
  assert.ok(!html.includes('Pedido antigo de A'), 'registros legados não entram na tarefa');
  assert.ok(html.includes('Interpretação gerada por IA'));
  assert.ok(!html.includes(KEY) && !/<script/i.test(html));
  state.saveTo = path.join(outDir, 'a.json');
  await send({ command: 'exportSave', ref: entryA.ref, format: 'json', hide: { prompts: true }, terms: [] });
  const json = JSON.parse(fs.readFileSync(state.saveTo, 'utf8'));
  assert.equal(json.task.id, taskA); assert.equal(json.records.find(r => r.type === 'prompt').text, null);
  assert.ok(!JSON.stringify(json).includes(KEY));
  assert.equal(calls.length, 1, 'exportar não chama o Gemini');

  // 5) reopen (as after closing VS Code): history and consultation persist
  panel.dispose();
  ext.activate(context());
  await commands['painel-execucao.open']();
  panel = panels.at(-1);
  p = await payload();
  assert.equal(p.viewingOther, true); assert.equal(p.selectedTaskId, taskA);
  assert.ok(p.history.some(e => e.ref === 'sess-bbbb|' + taskB) && p.history.some(e => e.ref === entryA.ref));
  assert.equal(new Set(p.history.map(e => e.ref)).size, p.history.length);

  // 6) transcript removed: identification stays, details unavailable, export still declares it
  fs.unlinkSync(fileA);
  panel.dispose();
  ext.activate(context());
  await commands['painel-execucao.open']();
  panel = panels.at(-1);
  p = await payload();
  assert.equal(p.origin.available, false);
  assert.equal(p.origin.conversation, 'Conversa A gerada', 'nome preservado a partir do histórico');
  assert.ok(p.warnings.some(w => w.includes('não foi encontrada')));
  assert.equal(p.nodes.length, 0);
  const missing = p.history.find(e => e.ref === entryA.ref);
  assert.equal(missing.available, false); assert.equal(missing.title, 'Tarefa de A');
  await send({ command: 'exportPreview' });
  assert.equal(last('exportPreview').preview.transcriptAvailable, false);

  // 7) back to the active task through its reference: consultation ends, capture target unchanged
  await send({ command: 'selectTask', ref: 'sess-bbbb|' + taskB, taskId: '' });
  p = last('payload').payload;
  assert.equal(p.viewingOther, false); assert.equal(p.selectedTaskId, taskB); assert.equal(p.activeTaskId, taskB);
  assert.equal(calls.length, 1);
});
