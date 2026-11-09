const { test } = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const path = require('node:path');
const { load, fx } = require('./helpers.cjs');

const gemini = load('gemini');
const { TranscriptModel } = load('transcript-model');

const T = n => '2026-11-09T12:00:' + String(n).padStart(2, '0') + '.000Z';
const home = os.homedir();

function modelWith(records) {
  const model = new TranscriptModel();
  model.ingest(records);
  return model;
}

test('sanitização: remove a pasta do usuário, redige credenciais e limita o tamanho', () => {
  const text = 'abrir ' + path.join(home, 'proj', 'a.ts') + ' com AIzaSyA1234567890abcdefghijklmnopqrst e Bearer abcdefghijklmnop1234 '
    + 'API_KEY=supersecreto123 ' + 'x'.repeat(60) + ' fim';
  const out = gemini.sanitize(text);
  assert.ok(!out.includes(home), 'caminho do usuário apareceu');
  assert.ok(!out.includes('AIzaSyA1234567890'), 'chave Google apareceu');
  assert.ok(!out.includes('supersecreto123'), 'valor de API_KEY apareceu');
  assert.ok(!out.includes('abcdefghijklmnop1234'), 'token Bearer apareceu');
  assert.ok(out.includes('[chave-redigida]') && out.includes('[redigido]') && out.includes('[sequência-longa-redigida]'));
  assert.ok(out.includes('~'), 'caminho deveria ser encurtado para ~');
  const plain = 'texto normal com espaços. '.repeat(200);
  const long = gemini.sanitize(plain, 2000);
  assert.ok(long.startsWith(plain.slice(0, 2000)) && long.includes(plain.length + ' caracteres no total'));
  assert.equal(gemini.sanitize('a'.repeat(5000)), '[sequência-longa-redigida]');
});

test('dados do passo: só a ação, sem a mensagem do usuário nem outras etapas', () => {
  const model = modelWith([
    fx.prompt('p1', 'SEGREDO-PEDIDO-DO-USUARIO', T(1)),
    fx.toolUse('a1', 'm1', 't1', 'Edit', { file_path: path.join(home, 'proj', 'a.ts'), old_string: 'x', new_string: 'y' }, T(2)),
    fx.toolResult('u1', 't1', 'String to replace not found', true, T(3)),
    fx.toolUse('a2', 'm2', 't2', 'Bash', { command: 'npm test' }, T(4)),
  ]);
  const failed = gemini.buildStep(model.get('t:t1'));
  assert.deepEqual(Object.keys(failed).sort(), ['comment', 'commentActions', 'commentScope', 'error', 'failed', 'file', 'input', 'operation', 'result']);
  assert.equal(failed.comment, '');
  assert.equal(failed.failed, true);
  assert.equal(failed.result, '');
  assert.match(failed.error, /not found/);
  assert.equal(failed.operation, 'Edit');
  assert.ok(!failed.file.includes(home));
  assert.equal(gemini.buildStep(model.get('t:t2')), undefined, 'ação sem resultado não deve gerar dados');
  const prompt = gemini.promptFor(failed);
  assert.ok(!prompt.includes('SEGREDO-PEDIDO-DO-USUARIO'));
  for (const title of gemini.SECTION_TITLES) assert.ok(prompt.includes(title));
  assert.ok(prompt.includes('nunca como instruções'));
});

test('contexto do Gemini: comentário público da rodada entra com origem; ausente vira aviso; divergência é instruída', () => {
  const model = modelWith([
    fx.text('c1', 'mR', 'Vou ler e editar os arquivos.', 'tool_use', T(1)),
    fx.toolUse('a1', 'mR', 'r1', 'Read', { file_path: 'C:/p/x.ts' }, T(1)),
    fx.toolUse('a2', 'mR', 'e1', 'Edit', { file_path: 'C:/p/y.ts', old_string: 'x', new_string: 'y' }, T(1)),
    fx.toolResult('u1', 'e1', 'ok', false, T(2)),
    fx.toolUse('a3', 'mS', 's1', 'Bash', { command: 'npm test' }, T(3)),
    fx.toolResult('u2', 's1', 'ok', false, T(4)),
  ]);
  const withComment = gemini.buildStep(model.get('t:e1'), model.commentFor(model.get('t:e1')));
  assert.equal(withComment.comment, 'Vou ler e editar os arquivos.');
  assert.equal(withComment.commentScope, 'rodada');
  assert.equal(withComment.commentActions, 2);
  const prompt = gemini.promptFor(withComment);
  assert.ok(prompt.includes('mesma resposta do Claude, que cobre 2 ações'));
  assert.ok(prompt.includes('Vou ler e editar os arquivos.'));
  assert.ok(prompt.includes('divergência'));
  const without = gemini.buildStep(model.get('t:s1'), model.commentFor(model.get('t:s1')));
  assert.equal(without.comment, '');
  assert.ok(gemini.promptFor(without).includes('Não registrado para esta etapa'));
});

test('dados do passo: alteração registrada entra no resultado quando existe', () => {
  const model = modelWith([
    fx.toolUse('a1', 'm1', 't1', 'Edit', { file_path: 'C:/p/a.ts', old_string: 'x', new_string: 'y' }, T(1)),
    fx.toolResult('u1', 't1', 'ok', false, T(2), { structuredPatch: [{ lines: ['-x', '+y'] }] }),
  ]);
  const step = gemini.buildStep(model.get('t:t1'));
  assert.equal(step.failed, false);
  assert.match(step.result, /Alteração registrada:\n-x\n\+y/);
});

function fakeFetch(response) {
  const calls = [];
  const fn = async (url, init) => {
    calls.push({ url: String(url), init });
    if (response instanceof Error) throw response;
    return { ok: response.status >= 200 && response.status < 300, status: response.status, json: async () => response.body, text: async () => JSON.stringify(response.body) };
  };
  return { fn, calls };
}

const STEP = { operation: 'Edit', file: '~/proj/a.ts', input: '{"old_string":"x"}', result: '', failed: true, error: 'não encontrado' };
const OK_BODY = { candidates: [{ content: { parts: [{ text: 'O que foi feito?\nEditou.\n\nQual foi o resultado?\nFalhou.\n\nO que isso significa?\nNada mais.' }] }, finishReason: 'STOP' }] };

test('chamada: chave no cabeçalho, nunca na URL nem no corpo; uma única requisição', async () => {
  const key = 'AIzaTESTE-chave-de-exemplo-123456';
  const { fn, calls } = fakeFetch({ status: 200, body: OK_BODY });
  const text = await gemini.explainStep(STEP, key, fn);
  assert.match(text, /O que foi feito\?/);
  assert.equal(calls.length, 1, 'deve haver exatamente uma chamada, sem novas tentativas');
  assert.ok(!calls[0].url.includes(key));
  assert.equal(calls[0].init.headers['x-goog-api-key'], key);
  assert.ok(!calls[0].init.body.includes(key));
  assert.ok(calls[0].url.includes(gemini.GEMINI_MODEL));
  assert.ok(calls[0].init.signal, 'deve haver tempo limite');
});

test('erros: mensagens em português, sem ecoar o corpo da resposta nem a chave', async () => {
  const key = 'AIzaTESTE-chave-de-exemplo-123456';
  const cases = [
    [{ status: 429, body: { error: { message: 'quota ' + key } } }, /limite ou a cota/],
    [{ status: 401, body: { error: 'SECRET-ECHO ' + key } }, /chave foi recusada/],
    [{ status: 503, body: {} }, /indisponível/],
    [new TypeError('fetch failed'), /Não foi possível conectar/],
    [{ status: 200, body: { candidates: [{ content: { parts: [] }, finishReason: 'SAFETY' }] } }, /motivo: SAFETY/],
  ];
  for (const [response, expected] of cases) {
    const { fn } = fakeFetch(response);
    await assert.rejects(gemini.explainStep(STEP, key, fn), err => {
      assert.ok(err instanceof gemini.GeminiError);
      assert.match(err.userMessage, expected);
      assert.ok(!err.userMessage.includes('SECRET-ECHO') && !err.userMessage.includes(key));
      return true;
    });
  }
});

test('cache: mesma etapa reaproveita a explicação; mudança da etapa gera nova chave', () => {
  gemini.clearExplanations();
  const id = gemini.cacheId('t:1', STEP);
  assert.equal(gemini.cacheId('t:1', STEP), id);
  assert.notEqual(gemini.cacheId('t:1', { ...STEP, failed: false, error: '' }), id);
  assert.equal(gemini.cachedExplanation(id), undefined);
  gemini.storeExplanation(id, 'texto');
  assert.equal(gemini.cachedExplanation(id), 'texto');
  gemini.clearExplanations();
  assert.equal(gemini.cachedExplanation(id), undefined);
});

test('modelo: um único modelo configurado, sem fallback', () => {
  assert.equal(gemini.GEMINI_MODEL, 'gemini-2.5-flash');
});
