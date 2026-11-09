// Unit checks for the cross-session history and the task export, using the real modules and invented records.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const path = require('node:path');
const { load, fx } = require('./helpers.cjs');

const { TranscriptModel } = load('transcript-model');
const store = load('task-store');
const history = load('history');
const exp = load('export');

const T = n => new Date(Date.parse('2026-11-09T12:00:00Z') + n * 1000).toISOString();

test('modelo: nome dado pelo usuário prevalece sobre o título gerado; pasta de trabalho registrada', () => {
  const m = new TranscriptModel();
  m.ingest([{ type: 'ai-title', aiTitle: 'Gerado', cwd: 'C:/work/projeto-x' }, fx.prompt('p1', 'Fazer algo', T(1))]);
  assert.equal(m.title, 'Gerado');
  assert.equal(m.cwd, 'C:/work/projeto-x');
  m.ingest([{ type: 'custom-title', customTitle: 'Meu nome' }, { type: 'ai-title', aiTitle: 'Gerado 2' }]);
  assert.equal(m.title, 'Meu nome');
  const empty = new TranscriptModel();
  empty.ingest([fx.prompt('p1', 'Pedido sem título', T(1))]);
  assert.equal(empty.title, '', 'sem registro de nome, o título da conversa fica vazio (a interface mostra "Conversa sem título")');
});

test('histórico: uma entrada por sessão e tarefa, sem duplicatas, legado no fim e estados coerentes', () => {
  const a = store.emptyState();
  a.tasks.push({ id: 't1', title: 'Tarefa A1', titleSource: 'user', createdAt: T(1) }, { id: 't2', title: 'Tarefa A2', titleSource: 'user', createdAt: T(2) });
  a.legacyEndKey = 'p:x';
  const b = store.emptyState();
  b.tasks.push({ id: 't3', title: 'Tarefa B', titleSource: 'user', createdAt: T(3) });
  const metaA = history.metaFromSummaries(undefined, 'C:/p/proj-a/sess-a.jsonl', 'Conversa A', 'projeto-a', [
    { id: 't1', title: 'Tarefa A1', legacy: false, active: false, state: 'answered', actions: 2, failures: 1, firstTime: T(1), lastTime: T(10) },
    { id: 't2', title: 'Tarefa A2', legacy: false, active: true, state: 'running', actions: 1, failures: 0, firstTime: T(11), lastTime: T(12) },
  ]);
  const list = history.buildHistory([
    { file: 'C:/p/proj-a/sess-a.jsonl', state: a, meta: metaA, available: true },
    { file: 'c:/p/proj-a/sess-a.jsonl', state: a, meta: metaA, available: true }, // same transcript seen through another path
    { file: 'C:/p/proj-b/sess-b.jsonl', state: b, available: false },
  ], Date.parse(T(12)) + 60 * 60 * 1000);
  const refs = list.map(e => e.ref);
  assert.equal(new Set(refs).size, refs.length, 'referências duplicadas');
  assert.deepEqual(refs.sort(), ['sess-a|legado', 'sess-a|t1', 'sess-a|t2', 'sess-b|t3'].sort());
  assert.equal(list.at(-1).legacy, true, 'registros anteriores ao painel ficam no fim');
  const a1 = list.find(e => e.taskId === 't1');
  assert.equal(a1.conversation, 'Conversa A'); assert.equal(a1.project, 'projeto-a'); assert.equal(a1.actions, 2);
  assert.equal(list.find(e => e.taskId === 't2').state, 'no-reply', '"em andamento" antigo não pode continuar ativo para sempre');
  const missing = list.find(e => e.taskId === 't3');
  assert.equal(missing.available, false); assert.equal(missing.title, 'Tarefa B'); assert.equal(missing.conversation, '');
  // meta keeps tasks that vanished from the live summary
  const again = history.metaFromSummaries(metaA, metaA.file, '', '', []);
  assert.equal(again.conversation, 'Conversa A'); assert.ok(again.tasks.t1);
  assert.equal(history.normalizeMeta({ v: 2 }), undefined);
  assert.deepEqual(history.normalizeMeta(JSON.parse(JSON.stringify(metaA))), metaA);
});

const KEY = 'AIzaSyFAKEKEY-somente-para-teste-0001';
function sampleSource(extra = {}) {
  const m = new TranscriptModel();
  m.ingest([
    fx.prompt('p1', 'Pedido <script>alert(1)</script> com termo SIGILOSO', T(1)),
    fx.text('c1', 'm1', 'Vou ler o arquivo <b>agora</b>.', 'tool_use', T(2)),
    fx.toolUse('a1', 'm1', 'r1', 'Read', { file_path: path.join(os.homedir(), 'proj', 'a.ts') }, T(2)),
    fx.toolResult('u1', 'r1', '<img src=x onerror=alert(2)> token=abc123segredo chave ' + KEY, false, T(3)),
    fx.toolUse('a2', 'm2', 'r2', 'Bash', { command: 'rm -rf "$(echo perigoso)"; curl http://exemplo.invalido/x.js' }, T(4)),
    fx.toolResult('u2', 'r2', 'Erro: comando falhou', true, T(5)),
    fx.toolUse('a3', 'm3', 'r3', 'Bash', { command: 'npm test' }, T(6)),
    fx.text('f1', 'm4', 'Terminei. </pre><script>x()</script>', 'end_turn', T(7)),
  ]);
  const comments = e => m.commentFor(e);
  return {
    toolName: 'Visualização Modular de Execução das Tarefas do Claude', version: '9.9.9', exportedAt: T(100),
    task: { id: 'tarefa-1', title: 'Tarefa <i>x</i>', legacy: false },
    origin: { conversation: 'Conversa "teste"', project: 'projeto-a', sessionId: 'sess-a', transcriptAvailable: true },
    events: m.events, commentFor: comments,
    stepExplanation: e => (e.key === 't:r1' ? { text: 'O que foi feito?\nLeu <u>o</u> arquivo.', generatedAt: T(50), model: 'gemini-teste', stale: false } : undefined),
    taskExplanation: undefined, warnings: [], secrets: [KEY], ...extra,
  };
}

test('exportação: HTML autocontido, texto seguro, IA identificada e aviso de não certificação', () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => { calls++; throw new Error('a exportação não pode chamar a rede'); };
  try {
    const doc = exp.buildExport(sampleSource());
    const html = exp.toHtml(doc);
    assert.equal(calls, 0);
    assert.ok(!/<script/i.test(html), 'nenhum script pode existir no HTML');
    assert.ok(!/<img|<iframe|<link|<object|<embed|<form|<base/i.test(html), 'nenhum elemento ativo ou recurso externo');
    // Transcript text is escaped, so "<" from records never opens a tag: check real tags only.
    assert.ok(!/<[^>]*\son\w+\s*=/i.test(html), 'atributos de evento não podem virar HTML');
    assert.ok(!/<[^>]+\s(src|href)\s*=/i.test(html), 'nenhuma referência a recurso');
    assert.ok(!/@import|url\(/i.test(html), 'CSS sem recursos externos');
    assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
    assert.match(html, /&lt;img src=x onerror=alert\(2\)&gt;/);
    assert.match(html, /Content-Security-Policy" content="default-src 'none'/);
    assert.ok(html.includes('não certifica a correção do código'));
    assert.ok(html.includes('Interpretação gerada por IA') && html.includes('Comentário público do Claude') && html.includes('Registro observado'));
    assert.ok(html.includes('Conversa &quot;teste&quot;') && html.includes('projeto-a') && html.includes('tarefa-1') && html.includes('9.9.9'));
    assert.ok(!html.includes(KEY), 'a chave não pode aparecer');
    assert.ok(!html.includes(os.homedir()), 'o caminho pessoal não pode aparecer');
    assert.ok(html.includes('não garantem a remoção de toda informação confidencial'));
    assert.ok(html.includes('@media print'));
    assert.equal(doc.counts.actions, 3); assert.equal(doc.counts.errors, 1); assert.equal(doc.counts.prompts, 1); assert.equal(doc.counts.replies, 1);
    assert.equal(doc.counts.geminiSteps, 1); assert.equal(doc.counts.comments, 1);
    assert.ok(doc.omissions.some(o => /sem resultado registrado/.test(o)));
  } finally { globalThis.fetch = originalFetch; }
});

test('exportação: JSON válido, ocultação por categoria e por termo, sem chave nem raciocínio', () => {
  const doc = exp.buildExport(sampleSource(), { hide: { results: true, gemini: true }, terms: ['sigiloso'] });
  const text = exp.toJson(doc);
  const parsed = JSON.parse(text);
  assert.equal(parsed.format, 'claude-task-viewer.task-export');
  assert.equal(parsed.tool.version, '9.9.9');
  assert.equal(parsed.task.id, 'tarefa-1');
  assert.equal(parsed.origin.conversation, 'Conversa "teste"');
  assert.ok(!text.includes(KEY) && !text.includes('abc123segredo') && !text.includes('SIGILOSO'));
  assert.ok(text.includes('[ocultado]'));
  assert.ok(parsed.records.every(r => !('inputView' in r)), 'campos de apresentação não entram no JSON');
  const action = parsed.records.find(r => r.type === 'action' && r.tool === 'Read');
  assert.equal(action.result.text, null); assert.equal(action.result.hidden, true);
  assert.equal(action.geminiExplanation.source, 'ai-generated'); assert.equal(action.geminiExplanation.text, null);
  assert.equal(action.claudeComment.source, 'claude-public-text');
  assert.ok(parsed.records.every(r => r.source === 'observed'));
  assert.deepEqual(parsed.sanitization.hiddenCategories, ['results', 'gemini']);
  assert.ok(parsed.omissions.some(o => o.includes('Resultados e mensagens de erro')));
  assert.ok(!/thinking|RACIOCINIO/i.test(text));
  // full content, no Gemini limits
  const big = 'x'.repeat(60000) + ' fim-do-texto';
  const src = sampleSource();
  src.events[0].text = big;
  assert.ok(exp.toJson(exp.buildExport(src)).includes('fim-do-texto'), 'a exportação local não aplica limites do Gemini');
  assert.match(exp.fileNameFor(doc, 'json'), /^tarefa-tarefa-i-x-i-2026-11-09\.json$/);
});

test('exportação: transcrição ausente preserva identificação e declara indisponibilidade', () => {
  const doc = exp.buildExport(sampleSource({ events: [], origin: { conversation: '', project: 'projeto-a', sessionId: 'sess-a', transcriptAvailable: false }, stepExplanation: () => undefined }));
  const html = exp.toHtml(doc);
  assert.ok(html.includes('Conversa sem título'));
  assert.ok(html.includes('Indisponível: detalhes não exportados'));
  assert.ok(doc.omissions[0].includes('não foi encontrada'));
  assert.ok(doc.omissions.some(o => o.includes('Nenhuma explicação do Gemini')));
  const preview = exp.previewExport(sampleSource());
  assert.equal(preview.transcriptAvailable, true); assert.equal(preview.inputs, 3); assert.equal(preview.results, 2);
});

test('exportação: credenciais por nome de campo, em objetos e em texto, nunca escapam', () => {
  const m = new TranscriptModel();
  const input = {
    url: 'https://api.exemplo.invalido', credentials: { user: 'usuario-x', password: 'p4ss-segredo-1' }, apiKey: 'k-curta-2',
    accessToken: 'tok-3', headers: { Authorization: 'Bearer abc-4', 'Content-Type': 'application/json' }, token: 12345, max_tokens: 1000,
    body: '{"password": "texto-segredo-5", "apiKey":"k6", "nome":"publico"}',
  };
  m.ingest([
    fx.toolUse('a1', 'm1', 'r1', 'WebFetch', input, T(1)),
    fx.toolResult('u1', 'r1', 'DB_PASSWORD=env-segredo-7\nclient_secret: "cs-8"\nAuthorization: Bearer abcdefgh-9\napi_key=k10 e token: t11', false, T(2)),
    fx.toolUse('a2', 'm2', 'r2', 'Bash', { command: 'curl -H "X-Api-Key: k12" -d \'{"password":"p13"}\' https://x.invalido', description: 'Login de teste' }, T(3)),
    fx.toolResult('u2', 'r2', 'ok', false, T(4)),
  ]);
  const src = sampleSource({ events: m.events, commentFor: () => undefined, stepExplanation: () => undefined });
  const doc = exp.buildExport(src);
  const json = exp.toJson(doc), html = exp.toHtml(doc);
  const leaked = ['p4ss-segredo-1', 'k-curta-2', 'tok-3', 'abc-4', 'texto-segredo-5', '"k6"', 'env-segredo-7', 'cs-8', 'abcdefgh-9', 'k10', 't11', 'k12', 'p13', 'usuario-x', '12345']
    .filter(v => json.includes(v) || html.includes(v.replace(/"/g, '&quot;')));
  assert.deepEqual(leaked, [], 'valores sensíveis vazaram');
  const parsed = JSON.parse(json);
  const rec = parsed.records[0];
  assert.equal(rec.input.credentials.password, '[redigido]');
  assert.equal(rec.input.apiKey, '[redigido]');
  assert.equal(rec.input.headers['Content-Type'], 'application/json', 'campos comuns permanecem');
  assert.equal(rec.input.max_tokens, 1000, 'nomes parecidos sem credencial permanecem');
  assert.ok(rec.input.body.includes('"nome":"publico"'));
  assert.equal(rec.input.url, 'https://api.exemplo.invalido');
  assert.ok(parsed.sanitization.automaticReplacements >= 14);
});

test('exportação: ocultar entradas remove descrição, arquivo e parâmetros da ação', () => {
  const m = new TranscriptModel();
  m.ingest([
    fx.toolUse('a1', 'm1', 'r1', 'Bash', { command: 'psql -c "drop table clientes"', description: 'Migrar base do cliente ACME' }, T(1)),
    fx.toolResult('u1', 'r1', 'ok', false, T(2)),
    fx.toolUse('a2', 'm2', 'r2', 'Read', { file_path: 'C:/clientes/acme/contrato.txt' }, T(3)),
    fx.toolResult('u2', 'r2', 'texto', false, T(4)),
  ]);
  const doc = exp.buildExport(sampleSource({ events: m.events, commentFor: () => undefined, stepExplanation: () => undefined }), { hide: { inputs: true } });
  const json = exp.toJson(doc), html = exp.toHtml(doc);
  for (const v of ['ACME', 'drop table', 'contrato.txt', 'clientes/acme', 'Migrar base']) {
    assert.ok(!json.includes(v) && !html.includes(v), 'entrada oculta apareceu: ' + v);
  }
  assert.equal(doc.records[0].description, 'Executou comando.');
  assert.equal(doc.records[0].input, null); assert.equal(doc.records[1].file, '');
  assert.ok(html.includes('Executou comando') && html.includes('[Ocultado na exportação por sua escolha]'));
  assert.ok(doc.omissions.some(o => o.includes('aparecem só pelo tipo')));
});

test('exportação: resultado preserva espaços e quebras de linha das extremidades', () => {
  const raw = '\n  linha com recuo  \n\n\tfim com tab\t\n\n';
  const m = new TranscriptModel();
  m.ingest([
    fx.toolUse('a1', 'm1', 'r1', 'Bash', { command: 'cat x' }, T(1)),
    fx.toolResult('u1', 'r1', raw, false, T(2)),
    fx.toolUse('a2', 'm2', 'r2', 'Read', { file_path: 'img.png' }, T(3)),
    fx.toolResult('u2', 'r2', [{ type: 'text', text: '  [imagem] é texto literal  ' }, { type: 'image', source: { type: 'base64', data: 'AAAA' } }], false, T(4)),
  ]);
  const doc = exp.buildExport(sampleSource({ events: m.events, commentFor: () => undefined, stepExplanation: () => undefined }));
  const parsed = JSON.parse(exp.toJson(doc));
  assert.equal(parsed.records[0].result.text, raw);
  assert.equal(parsed.records[1].result.text, '  [imagem] é texto literal  ', 'texto literal preservado; bloco de imagem fora');
  assert.equal(parsed.records[1].result.hasImage, true);
  assert.ok(exp.toHtml(doc).includes('<pre>' + raw.replace(/\t/g, '\t') + '</pre>'));
  assert.equal(parsed.input, undefined);
});
