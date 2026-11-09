const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { load, tempFile, fx, line } = require('./helpers.cjs');

const { IncrementalJsonlReader } = load('transcript-reader');
const { TranscriptModel } = load('transcript-model');

const T = n => '2026-11-09T12:00:' + String(n).padStart(2, '0') + '.000Z';

test('leitor: duas leituras sem dados novos não retornam nada; acréscimo retorna só o novo registro', () => {
  const file = tempFile('a.jsonl');
  fs.writeFileSync(file, line(fx.prompt('u1', 'Pedido', T(1))) + line(fx.toolUse('a1', 'm1', 'tu1', 'Read', { file_path: 'C:/x/a.txt' }, T(2))));
  const reader = new IncrementalJsonlReader(file);
  assert.equal(reader.read().records.length, 2);
  const second = reader.read();
  const third = reader.read();
  assert.equal(second.records.length, 0);
  assert.equal(third.records.length, 0);
  assert.equal(second.reset || third.reset, false);
  fs.appendFileSync(file, line(fx.toolResult('u2', 'tu1', 'conteúdo', false, T(3))));
  const fourth = reader.read();
  assert.equal(fourth.records.length, 1);
  assert.equal(fourth.records[0].uuid, 'u2');
});

test('leitor: linha incompleta aguarda o restante sem contar como erro', () => {
  const file = tempFile('b.jsonl');
  const full = line(fx.prompt('u1', 'Pedido com ação e acentuação', T(1)));
  const cut = Buffer.from(full).length - 12;
  fs.writeFileSync(file, Buffer.from(full).subarray(0, cut));
  const reader = new IncrementalJsonlReader(file, 7);
  const partial = reader.read();
  assert.equal(partial.records.length, 0);
  assert.equal(partial.malformed, 0);
  fs.appendFileSync(file, Buffer.from(full).subarray(cut));
  const done = reader.read();
  assert.equal(done.records.length, 1);
  assert.equal(done.records[0].message.content, 'Pedido com ação e acentuação');
});

test('leitor: linha corrompida é contada e as demais continuam legíveis', () => {
  const file = tempFile('c.jsonl');
  fs.writeFileSync(file, '{"type":"user",\n' + line(fx.title('Título')));
  const result = new IncrementalJsonlReader(file).read();
  assert.equal(result.malformed, 1);
  assert.equal(result.records.length, 1);
});

test('leitor: arquivo truncado é relido desde o início e sinaliza reinício', () => {
  const file = tempFile('d.jsonl');
  fs.writeFileSync(file, line(fx.title('Um')) + line(fx.title('Dois')) + line(fx.title('Três')));
  const reader = new IncrementalJsonlReader(file);
  assert.equal(reader.read().records.length, 3);
  fs.writeFileSync(file, line(fx.title('Novo')));
  const after = reader.read();
  assert.equal(after.reset, true);
  assert.equal(after.records.length, 1);
});

test('leitor: arquivo inexistente não lança erro', () => {
  const result = new IncrementalJsonlReader(tempFile('nao-existe.jsonl')).read();
  assert.deepEqual(result, { records: [], malformed: 0, reset: false });
});

function sampleRecords() {
  return [
    fx.title('Ajustar o painel'),
    fx.meta('m0', '<command-name>/model</command-name>', T(0)),
    fx.prompt('u1', 'Leia o arquivo e corrija', T(1)),
    fx.text('a0', 'm1', 'Vou ler os dois arquivos.', 'tool_use', T(2)),
    fx.toolUse('a1', 'm1', 'tu1', 'Read', { file_path: 'C:/proj/src/a.ts' }, T(2)),
    fx.toolUse('a2', 'm1', 'tu2', 'Read', { file_path: 'C:/proj/docs/b.md' }, T(2)),
    fx.toolResult('u2', 'tu1', 'linha 1', false, T(3)),
    fx.toolResult('u3', 'tu2', [{ type: 'text', text: 'Arquivo não encontrado' }], true, T(3)),
    fx.noOrigin('u4', 'Texto de sistema sem origin', T(4)),
    fx.toolUse('a3', 'm2', 'tu3', 'Edit', { file_path: 'C:/proj/src/a.ts', old_string: 'x', new_string: 'y' }, T(5)),
    fx.toolResult('u5', 'tu3', 'ok', false, T(6), { structuredPatch: [{ lines: ['-x', '+y'] }] }),
    fx.text('a4', 'm3', 'Concluí a correção.', 'end_turn', T(7)),
  ];
}

test('modelo: separa pedido humano, ações, resultados e resposta final no formato real', () => {
  const model = new TranscriptModel();
  model.ingest(sampleRecords());
  const kinds = model.events.map(e => e.kind + ':' + (e.tool || ''));
  assert.deepEqual(kinds, ['prompt:', 'action:Read', 'action:Read', 'action:Edit', 'reply:']);
  assert.equal(model.title, 'Ajustar o painel');
  const report = model.report();
  assert.equal(report.recognized, true);
  assert.equal(report.humanRule, 'origin');
});

test('modelo: resultado de ferramenta não é erro; só is_error=true marca falha', () => {
  const model = new TranscriptModel();
  model.ingest(sampleRecords());
  assert.equal(model.get('t:tu1').result.isError, false);
  assert.equal(model.get('t:tu2').result.isError, true);
  assert.deepEqual(model.get('t:tu3').result.structured, { structuredPatch: [{ lines: ['-x', '+y'] }] });
});

test('modelo: chamadas no mesmo message.id formam um grupo paralelo', () => {
  const model = new TranscriptModel();
  model.ingest(sampleRecords());
  assert.equal(model.get('t:tu1').group, model.get('t:tu2').group);
  assert.notEqual(model.get('t:tu1').group, model.get('t:tu3').group);
});

test('modelo: reingerir os mesmos registros não duplica nem altera eventos', () => {
  const model = new TranscriptModel();
  const first = model.ingest(sampleRecords());
  const snapshot = JSON.stringify(model.events);
  assert.ok(first > 0);
  assert.equal(model.ingest(sampleRecords()), 0);
  assert.equal(JSON.stringify(model.events), snapshot);
});

test('modelo: resultado que chega antes da chamada é associado depois', () => {
  const model = new TranscriptModel();
  model.ingest([fx.toolResult('u9', 'tu9', 'saída', false, T(9))]);
  model.ingest([fx.toolUse('a9', 'm9', 'tu9', 'Bash', { command: 'echo ok' }, T(8))]);
  assert.equal(model.get('t:tu9').result.content, 'saída');
});

test('modelo: formato desconhecido é relatado, não interpretado', () => {
  const model = new TranscriptModel();
  model.ingest([{ type: 'nova-estrutura', data: 1 }, { type: 'outra', x: 2 }]);
  const report = model.report();
  assert.equal(report.recognized, false);
  assert.deepEqual(report.unknownTypes, ['nova-estrutura', 'outra']);
  assert.equal(model.events.length, 0);
});

test('modelo: subagentes (isSidechain) não entram no fluxo principal', () => {
  const model = new TranscriptModel();
  const side = fx.toolUse('s1', 'ms', 'ts1', 'Read', { file_path: 'x' }, T(1));
  side.isSidechain = true;
  model.ingest([side]);
  assert.equal(model.events.length, 0);
  assert.equal(model.report().sidechainSkipped, 1);
});
