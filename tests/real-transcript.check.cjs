// Read-only check against a real local transcript. Prints counts only, never content.
// Usage: node tests/real-transcript.check.cjs <transcript.jsonl> [--wait-seconds N]
const assert = require('node:assert/strict');
const { load } = require('./helpers.cjs');
const { IncrementalJsonlReader } = load('transcript-reader');
const { TranscriptModel } = load('transcript-model');

const file = process.argv[2];
const waitIndex = process.argv.indexOf('--wait-seconds');
const waitSeconds = waitIndex > 0 ? Number(process.argv[waitIndex + 1]) : 0;
if (!file) { console.error('Informe o caminho da transcrição.'); process.exit(2); }

const reader = new IncrementalJsonlReader(file);
const model = new TranscriptModel();
const counts = () => {
  const actions = model.events.filter(e => e.kind === 'action');
  return {
    eventos: model.events.length,
    pedidos: model.events.filter(e => e.kind === 'prompt').length,
    acoes: actions.length,
    comResultado: actions.filter(a => a.result).length,
    falhas: actions.filter(a => a.result && a.result.isError).length,
    respostas: model.events.filter(e => e.kind === 'reply').length,
    gruposParalelos: new Set(actions.map(a => a.group)).size,
  };
};
const unique = () => new Set(model.events.map(e => e.key)).size === model.events.length;

const first = reader.read();
model.ingest(first.records, first.malformed);
const report = model.report();
console.log('leitura 1:', { registros: first.records.length, ilegiveis: first.malformed }, counts());
console.log('formato:', { reconhecido: report.recognized, criterioPedido: report.humanRule, tiposDesconhecidos: report.unknownTypes, subagentesIgnorados: report.sidechainSkipped });
assert.equal(report.recognized, true, 'formato não reconhecido');
assert.equal(report.humanRule, 'origin');
assert.ok(counts().pedidos > 0 && counts().acoes > 0);
assert.ok(unique(), 'chaves duplicadas');

const before = JSON.stringify(counts());
for (const n of [2, 3]) {
  const again = reader.read();
  const changes = model.ingest(again.records, again.malformed);
  console.log('leitura ' + n + ':', { registrosNovos: again.records.length, alteracoes: changes }, counts());
}
// Leituras imediatas podem receber linhas que o próprio Claude acabou de gravar; nunca podem duplicar.
assert.ok(unique(), 'chaves duplicadas após releitura');
console.log('sem duplicação após leituras 2 e 3:', unique(), '| contagens antes/depois iguais:', before === JSON.stringify(counts()));

if (waitSeconds > 0) {
  const startActions = counts().acoes;
  const startKeys = new Set(model.events.map(e => e.key));
  const deadline = Date.now() + waitSeconds * 1000;
  const timer = setInterval(() => {
    const next = reader.read();
    model.ingest(next.records, next.malformed);
    const added = model.events.filter(e => !startKeys.has(e.key));
    if (added.some(e => e.kind === 'action') || Date.now() > deadline) {
      clearInterval(timer);
      console.log('após acréscimo real:', counts(), '| novos eventos:', added.map(e => e.kind + (e.tool ? ':' + e.tool : '')));
      assert.ok(counts().acoes > startActions, 'nenhuma ação nova observada no prazo');
      assert.ok(unique(), 'chaves duplicadas após acréscimo');
      console.log('OK: acréscimo real lido uma única vez.');
    }
  }, 500);
}
