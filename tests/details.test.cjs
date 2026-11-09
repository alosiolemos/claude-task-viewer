const { test } = require('node:test');
const assert = require('node:assert/strict');
const { load, fx } = require('./helpers.cjs');

const { TranscriptModel } = load('transcript-model');
const view = load('view');

const T = n => '2026-11-09T12:00:' + String(n).padStart(2, '0') + '.000Z';

function thinking(uuid, messageId, time) {
  return { type: 'assistant', uuid, timestamp: time, isSidechain: false, sessionId: 's-1',
    message: { id: messageId, role: 'assistant', stop_reason: 'tool_use', content: [{ type: 'thinking', thinking: 'RACIOCINIO-INTERNO-NAO-PODE-APARECER' }] } };
}

test('comentário: texto público da mesma mensagem da ação vira comentário da etapa', () => {
  const model = new TranscriptModel();
  model.ingest([
    fx.text('c1', 'mA', 'Vou editar o arquivo a.ts para corrigir a conexão.', 'tool_use', T(1)),
    fx.toolUse('a1', 'mA', 'tu1', 'Edit', { file_path: 'C:/p/a.ts', old_string: 'x', new_string: 'y' }, T(1)),
    fx.toolResult('u1', 'tu1', 'ok', false, T(2)),
  ]);
  const c = model.commentFor(model.get('t:tu1'));
  assert.deepEqual(c, { text: 'Vou editar o arquivo a.ts para corrigir a conexão.', scope: 'step', actions: 1 });
  const d = view.buildDetails(model.get('t:tu1'), c);
  assert.equal(d.comment.label, 'COMENTÁRIO DO CLAUDE');
  assert.equal(d.comment.text, c.text);
});

test('comentário: uma mesma resposta com várias ações vira comentário da rodada', () => {
  const model = new TranscriptModel();
  model.ingest([
    fx.text('c2', 'mB', 'Vou ler e editar os dois arquivos.', 'tool_use', T(1)),
    fx.toolUse('a1', 'mB', 'r1', 'Read', { file_path: 'C:/p/x.ts' }, T(1)),
    fx.toolUse('a2', 'mB', 'e1', 'Edit', { file_path: 'C:/q/y.ts', old_string: 'x', new_string: 'y' }, T(1)),
  ]);
  const c = model.commentFor(model.get('t:e1'));
  assert.equal(c.scope, 'round');
  assert.equal(c.actions, 2);
  const d = view.buildDetails(model.get('t:e1'), c);
  assert.equal(d.comment.label, 'COMENTÁRIO DA RODADA');
  assert.match(d.comment.note, /cobre 2 ações; esta etapa é uma delas/);
});

test('comentário: blocos de raciocínio interno nunca são usados', () => {
  const model = new TranscriptModel();
  model.ingest([
    thinking('th1', 'mC', T(1)),
    fx.toolUse('a1', 'mC', 'tu1', 'Bash', { command: 'npm test' }, T(1)),
  ]);
  assert.equal(model.commentFor(model.get('t:tu1')), undefined);
  const d = view.buildDetails(model.get('t:tu1'), undefined);
  assert.equal(d.comment.text, '');
  assert.ok(!JSON.stringify(d).includes('RACIOCINIO-INTERNO'));
});

test('comentário: ação sem texto associado mostra o aviso explícito', () => {
  const model = new TranscriptModel();
  model.ingest([fx.toolUse('a1', 'mD', 'tu1', 'Read', { file_path: 'C:/p/a.ts' }, T(1))]);
  const d = view.buildDetails(model.get('t:tu1'), model.commentFor(model.get('t:tu1')));
  assert.equal(d.comment.text, '');
  assert.equal(d.comment.label, 'COMENTÁRIO DO CLAUDE');
});

test('comentário: mensagens do usuário e a resposta final não recebem bloco de comentário', () => {
  const model = new TranscriptModel();
  model.ingest([fx.prompt('p1', 'Ajustar', T(1)), fx.text('r1', 'mE', 'Pronto.', 'end_turn', T(2))]);
  assert.equal(view.buildDetails(model.get('p:p1')).comment, null);
  assert.equal(view.buildDetails(model.get('r:r1')).comment, null);
});

test('colunas: arquivo legível sem caminho repetido; entrada "Arquivo indicado ao lado" para leitura simples', () => {
  const model = new TranscriptModel();
  model.ingest([
    fx.toolUse('a1', 'm1', 'tu1', 'Read', { file_path: 'C:/proj/src/CanvasWorkflow.tsx' }, T(1)),
    fx.toolResult('u1', 'tu1', 'conteúdo', false, T(2)),
  ]);
  const d = view.buildDetails(model.get('t:tu1'));
  assert.equal(d.fileName, 'CanvasWorkflow.tsx');
  assert.equal(d.filePath, 'C:/proj/src/CanvasWorkflow.tsx');
  assert.deepEqual(d.entry, [{ label: 'Arquivo', text: 'Arquivo indicado ao lado' }]);
  assert.ok(d.entry.every(i => !i.text.includes('C:/')), 'o caminho não pode voltar na entrada');
  assert.equal(d.result.kind, 'text');
});

test('colunas: leitura com intervalo mostra as linhas pedidas', () => {
  const model = new TranscriptModel();
  model.ingest([fx.toolUse('a1', 'm1', 'tu1', 'Read', { file_path: 'C:/p/a.ts', offset: 10, limit: 40 }, T(1))]);
  const d = view.buildDetails(model.get('t:tu1'));
  assert.equal(d.entry[0].label, 'Linhas');
  assert.equal(d.entry[0].text, 'a partir da linha 10, até 40 linhas');
});

test('colunas: comando mostra o comando como código e a descrição como texto', () => {
  const model = new TranscriptModel();
  model.ingest([fx.toolUse('a1', 'm1', 'tu1', 'Bash', { command: 'npm test', description: 'Rodar testes' }, T(1))]);
  const d = view.buildDetails(model.get('t:tu1'));
  assert.equal(d.fileName, '');
  assert.deepEqual(d.entry.find(i => i.label === 'Comando'), { label: 'Comando', text: 'npm test', code: true });
  assert.equal(d.entry.find(i => i.label === 'Descrição').text, 'Rodar testes');
});

test('colunas: resultado de imagem é identificado e não vira texto de explicação', () => {
  const model = new TranscriptModel();
  model.ingest([
    fx.toolUse('a1', 'm1', 'tu1', 'Read', { file_path: 'C:/p/tela.png' }, T(1)),
    fx.toolResult('u1', 'tu1', [{ type: 'image', source: { type: 'base64', data: 'AAAA' } }], false, T(2)),
  ]);
  const d = view.buildDetails(model.get('t:tu1'));
  assert.equal(d.result.kind, 'image');
  assert.equal(d.result.label, 'Resultado de imagem');
  assert.ok(!d.result.text.includes('[imagem]'));
});

test('colunas: sem resultado, sem conteúdo e com erro têm rótulos próprios', () => {
  const model = new TranscriptModel();
  model.ingest([
    fx.toolUse('a1', 'm1', 'tu1', 'Bash', { command: 'npm run build' }, T(1)),
    fx.toolUse('a2', 'm2', 'tu2', 'Write', { file_path: 'C:/p/n.txt', content: 'oi' }, T(2)),
    fx.toolResult('u2', 'tu2', '', false, T(3)),
    fx.toolUse('a3', 'm3', 'tu3', 'Bash', { command: 'npm test' }, T(4)),
    fx.toolResult('u3', 'tu3', 'falhou', true, T(5)),
  ]);
  assert.equal(view.buildDetails(model.get('t:tu1')).result.label, 'Sem resultado registrado ainda');
  const none = view.buildDetails(model.get('t:tu2'));
  assert.equal(none.result.label, 'Sem retorno registrado');
  assert.equal(none.entry[0].label, 'Conteúdo gravado');
  assert.equal(view.buildDetails(model.get('t:tu3')).result.label, 'Erro registrado');
});

test('colunas: edição mostra antes e depois na entrada e o patch no resultado', () => {
  const model = new TranscriptModel();
  model.ingest([
    fx.toolUse('a1', 'm1', 'tu1', 'Edit', { file_path: 'C:/p/a.ts', old_string: 'antigo', new_string: 'novo' }, T(1)),
    fx.toolResult('u1', 'tu1', 'ok', false, T(2), { structuredPatch: [{ lines: ['-antigo', '+novo'] }] }),
  ]);
  const d = view.buildDetails(model.get('t:tu1'));
  assert.deepEqual(d.entry.map(i => i.label), ['Trecho antes', 'Trecho depois']);
  assert.equal(d.result.patch, '-antigo\n+novo');
  assert.equal(d.title, 'Editou arquivo');
  assert.ok(!d.what.includes('C:/'));
});
