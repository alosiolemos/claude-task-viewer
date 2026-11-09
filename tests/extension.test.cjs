// Activates the real extension bundle with a minimal vscode stub, an in-memory SecretStorage and a fake
// fetch. Checks the Gemini key boundary, consent, cache and error paths without any network access.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Module = require('node:module');
const esbuild = require('esbuild');
const { fx, line } = require('./helpers.cjs');

const ROOT = path.join(__dirname, '..');
const EXT = path.join(ROOT, 'extension');
const HOME = os.homedir();
const KEY = 'AIzaSyFAKEKEY-somente-para-teste-0001';
const PROMPT = 'PEDIDO-SECRETO-NAO-PODE-SAIR';
const COMMENT = 'Vou corrigir a conexão do arquivo a.ts.';
const AI_OK = 'O que foi feito?\nEditou o arquivo.\n\nQual foi o resultado?\nFalhou.\n\nO que isso significa?\nA edição não foi aplicada.';

const T = n => '2026-11-09T12:00:' + String(n).padStart(2, '0') + '.000Z';

function buildBundle() {
  const outfile = path.join(os.tmpdir(), 'painel-ext-' + process.pid + '.cjs');
  esbuild.buildSync({
    entryPoints: [path.join(EXT, 'src/extension.ts')], bundle: true, platform: 'node', format: 'cjs',
    external: ['vscode'], outfile, logLevel: 'silent',
  });
  return outfile;
}

function fixtureDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'painel-transcritas-'));
  const file = path.join(dir, 'sessao-1.jsonl');
  const records = [
    { type: 'ai-title', aiTitle: 'Sessão de teste', sessionId: 's-1' },
    fx.prompt('p1', PROMPT, T(1)),
    fx.toolUse('a1', 'm1', 'r1', 'Read', { file_path: path.join(HOME, 'proj', 'src', 'a.ts') }, T(2)),
    fx.toolResult('u1', 'r1', 'conteúdo', false, T(3)),
    { type: 'assistant', uuid: 'th2', timestamp: T(4), isSidechain: false, sessionId: 's-1', message: { id: 'm2', role: 'assistant', stop_reason: 'tool_use', content: [{ type: 'thinking', thinking: 'RACIOCINIO-INTERNO-NAO-PODE-SAIR' }] } },
    fx.text('c2', 'm2', COMMENT, 'tool_use', T(4)),
    fx.toolUse('a2', 'm2', 'e1', 'Edit', { file_path: path.join(HOME, 'proj', 'src', 'a.ts'), old_string: 'x', new_string: 'y' }, T(4)),
    fx.toolResult('u2', 'e1', 'String to replace not found', true, T(5)),
    fx.toolUse('a3', 'm3', 'b1', 'Bash', { command: 'npm test' }, T(6)),
  ];
  fs.writeFileSync(file, records.map(line).join(''));
  return dir;
}

function makeVscode(state) {
  const commands = {};
  const panel = {
    posted: [], listeners: [], disposers: [],
    webview: {
      html: '', cspSource: 'vscode-resource:',
      asWebviewUri: u => u,
      postMessage: async m => { panel.posted.push(m); return true; },
      onDidReceiveMessage: cb => { panel.listeners.push(cb); return { dispose() {} }; },
    },
    reveal() {},
    onDidDispose: cb => { panel.disposers.push(cb); return { dispose() {} }; },
    dispose() { panel.disposers.forEach(cb => cb()); },
  };
  return {
    commands, panel,
    vscode: {
      ViewColumn: { Beside: 2 },
      ConfigurationTarget: { Workspace: 2 },
      Uri: {
        joinPath: (base, ...parts) => ({ fsPath: path.join(base.fsPath, ...parts) }),
        file: p => ({ fsPath: p }),
      },
      workspace: {
        getConfiguration: () => ({ get: (k, d) => (state.config[k] !== undefined ? state.config[k] : d), update: async () => {} }),
        workspaceFolders: undefined,
        fs: { readFile: async uri => fs.readFileSync(uri.fsPath) },
      },
      window: {
        createWebviewPanel: () => panel,
        showInputBox: async opts => { state.inputOptions.push(opts); return state.nextInput; },
        showWarningMessage: async (message, opts, ...items) => { state.warnings.push(message); return state.nextWarning; },
        showQuickPick: async () => undefined,
        showOpenDialog: async () => undefined,
        showErrorMessage: () => undefined,
      },
      commands: { registerCommand: (id, fn) => { commands[id] = fn; return { dispose() {} }; } },
      env: { clipboard: { writeText: async t => { state.copied.push(t); } } },
    },
  };
}

test('extensão: chave no SecretStorage, sem vazar para a interface, com consentimento e cache', async (t) => {
  const bundle = buildBundle();
  const state = { config: {}, inputOptions: [], warnings: [], copied: [], nextInput: KEY, nextWarning: 'Enviar ao Gemini' };
  const dir = fixtureDir();
  state.config.transcriptsDir = dir;
  state.config.refreshInterval = 60000;
  const { vscode, commands, panel } = makeVscode(state);
  const secrets = new Map();
  const globalData = new Map();
  const context = {
    subscriptions: [],
    extension: { packageJSON: { version: '0.7.0' } },
    extensionUri: { fsPath: EXT },
    workspaceState: { get: (k, d) => d, update: async () => {} },
    globalState: { get: k => globalData.get(k), update: async (k, v) => { globalData.set(k, v); } },
    secrets: {
      get: async k => secrets.get(k),
      store: async (k, v) => { secrets.set(k, v); },
      delete: async k => { secrets.delete(k); },
    },
  };

  const origLoad = Module._load;
  Module._load = function (request, ...rest) {
    if (request === 'vscode') return vscode;
    return origLoad.call(this, request, ...rest);
  };
  const originalFetch = globalThis.fetch;
  const calls = [];
  let nextFetch = { status: 200, body: { candidates: [{ content: { parts: [{ text: AI_OK }] }, finishReason: 'STOP' }] } };
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init });
    const r = nextFetch;
    return { ok: r.status < 300, status: r.status, json: async () => r.body };
  };
  t.after(() => {
    Module._load = origLoad;
    globalThis.fetch = originalFetch;
    panel.dispose();
    fs.rmSync(dir, { recursive: true, force: true });
    try { fs.unlinkSync(bundle); } catch { /* already gone */ }
  });

  const ext = require(bundle);
  ext.activate(context);
  assert.ok(commands['painel-execucao.open']);
  await commands['painel-execucao.open']();
  const send = async msg => { for (const cb of panel.listeners) await cb(msg); };
  const lastOf = cmd => panel.posted.filter(m => m.command === cmd).at(-1);
  const sentText = () => JSON.stringify(panel.posted);

  await send({ command: 'ready' });
  await new Promise(r => setTimeout(r, 50));
  assert.equal(lastOf('gemini').configured, false, 'sem chave, a interface deve saber que não está configurado');
  const payload = lastOf('payload').payload;
  const edit = payload.nodes.find(n => n.title === 'Editou arquivo');
  assert.ok(edit, 'a ação de edição deveria aparecer');
  assert.ok(payload.nodes.some(n => n.status === 'pending'), 'a ação sem resultado deveria aparecer como pendente');
  const pendingNode = payload.nodes.find(n => n.status === 'pending');

  // no key: the panel keeps working, the explanation says why, and no request is made
  await send({ command: 'explain', key: edit.key, sig: 's' });
  assert.equal(lastOf('explanation').status, 'unconfigured');
  assert.equal(calls.length, 0);

  // the key is typed in a native password box and stored only in SecretStorage
  await send({ command: 'geminiSet' });
  assert.equal(state.inputOptions.at(-1).password, true, 'a chave deve ser digitada em caixa de senha');
  assert.equal(secrets.get('painel-execucao.gemini.apiKey'), KEY);
  assert.equal(lastOf('gemini').configured, true);
  assert.ok(!sentText().includes(KEY), 'a chave apareceu em mensagem para a interface');

  // no consent yet: cancel sends nothing
  state.nextWarning = undefined;
  await send({ command: 'explain', key: edit.key, sig: 's' });
  assert.equal(lastOf('explanation').status, 'cancelled');
  assert.equal(calls.length, 0, 'cancelar não pode enviar dados');

  // consent given: only the selected step is sent, key in the header, never in URL or body
  state.nextWarning = 'Enviar ao Gemini';
  await send({ command: 'explain', key: edit.key, sig: 's' });
  const ready = lastOf('explanation');
  assert.equal(ready.status, 'ready');
  assert.match(ready.text, /O que foi feito\?/);
  assert.equal(ready.sig, 's');
  assert.equal(calls.length, 1);
  assert.ok(!calls[0].url.includes(KEY));
  assert.equal(calls[0].init.headers['x-goog-api-key'], KEY);
  assert.ok(!calls[0].init.body.includes(KEY));
  assert.ok(!calls[0].init.body.includes(PROMPT), 'a mensagem do usuário não pode ser enviada');
  assert.ok(!calls[0].init.body.includes(HOME), 'o caminho do usuário não pode ser enviado');
  assert.ok(calls[0].init.body.includes('Edit'));
  assert.match(calls[0].init.body, /a\.ts/);
  assert.ok(calls[0].init.body.includes(COMMENT), 'o comentário público da etapa deve ser enviado');
  assert.ok(calls[0].init.body.includes('comentario_publico_do_claude'));
  assert.ok(!calls[0].init.body.includes('RACIOCINIO-INTERNO'), 'raciocínio interno não pode ser enviado');
  assert.ok(!sentText().includes(KEY));

  // details carry the comment; the internal reasoning never reaches the webview
  await send({ command: 'details', key: edit.key });
  const editDetails = lastOf('details').details;
  assert.equal(editDetails.comment.text, COMMENT);
  assert.equal(editDetails.comment.label, 'COMENTÁRIO DO CLAUDE');
  assert.ok(!sentText().includes('RACIOCINIO-INTERNO'), 'raciocínio interno apareceu na interface');

  // copy the full path through the extension (clipboard is not reachable from the webview)
  await send({ command: 'copy', text: path.join(HOME, 'proj', 'src', 'a.ts') });
  assert.deepEqual(state.copied, [path.join(HOME, 'proj', 'src', 'a.ts')]);

  // same step again: answered from cache, no second request
  await send({ command: 'explain', key: edit.key, sig: 's' });
  assert.equal(lastOf('explanation').status, 'ready');
  assert.equal(calls.length, 1, 'mesma etapa não pode gerar nova chamada');

  // a pending action without a recorded result is not sent
  await send({ command: 'explain', key: pendingNode.key, sig: 'p' });
  assert.equal(lastOf('explanation').status, 'insufficient');
  assert.equal(calls.length, 1);

  // API error: the message is useful and does not echo the key or the response body
  nextFetch = { status: 429, body: { error: 'SECRET-ECHO ' + KEY } };
  const other = payload.nodes.find(n => n.title === 'Leu arquivo');
  await send({ command: 'explain', key: other.key, sig: 'o' });
  const failed = lastOf('explanation');
  assert.equal(failed.status, 'error');
  assert.match(failed.message, /limite ou a cota/);
  assert.ok(!failed.message.includes('SECRET-ECHO') && !sentText().includes(KEY));

  // removing the key disables the integration and drops cached explanations
  state.nextWarning = 'Remover';
  await send({ command: 'geminiRemove' });
  assert.equal(secrets.has('painel-execucao.gemini.apiKey'), false);
  assert.equal(lastOf('gemini').configured, false);
  await send({ command: 'explain', key: edit.key, sig: 's' });
  assert.equal(lastOf('explanation').status, 'unconfigured');
  assert.ok(!sentText().includes(KEY), 'a chave permaneceu em alguma mensagem');
});
