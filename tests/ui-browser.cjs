// Interface test OUTSIDE VS Code: real painel.html in headless Edge, fed by payloads built with the real
// view/task-store code from synthetic records. It does not prove the VS Code integration.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { load, fx } = require('./helpers.cjs');

const { TranscriptModel } = load('transcript-model');
const store = load('task-store');
const view = load('view');

const shotsDir = process.env.PAINEL_SHOTS || path.join(require('node:os').tmpdir(), 'painel-execucao-tests');
const playwrightPath = process.env.PAINEL_PLAYWRIGHT_PATH || 'C:/Users/alois/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright';
const T = n => new Date(Date.parse('2026-11-09T12:00:00Z') + n * 1000).toISOString();
const NOW = Date.parse('2026-11-09T12:01:00Z');

const longOutput = Array.from({ length: 1500 }, (_, i) => 'linha ' + i + ' do resultado da compilação').join('\n');
const roundOne = [
  fx.prompt('u1', 'Ajustar o painel <img src=x onerror="document.title=\'xss\'">', T(1)),
  fx.toolUse('a1', 'm1', 'tu1', 'Read', { file_path: 'C:/proj/webview/src/components/CanvasWorkflow.tsx' }, T(2)),
  fx.toolUse('a2', 'm1', 'tu2', 'Read', { file_path: 'C:/proj/docs/notas.md' }, T(2)),
  fx.toolResult('u2', 'tu1', 'conteúdo A', false, T(3)),
  fx.toolResult('u3', 'tu2', 'conteúdo B', false, T(3)),
  fx.toolUse('a3', 'm2', 'tu3', 'Edit', { file_path: 'C:/proj/webview/src/components/CanvasWorkflow.tsx', old_string: 'const edges = [];', new_string: 'const edges = build(stages);' }, T(4)),
  fx.toolResult('u4', 'tu3', 'String to replace not found in file.', true, T(5)),
  fx.toolUse('a4', 'm3', 'tu4', 'Bash', { command: 'npm run build -- --mode production --very-long-flag ' + 'x'.repeat(400), description: 'Compilar a extensão' }, T(6)),
  fx.toolResult('u5', 'tu4', longOutput, false, T(7)),
];
const roundTwo = [
  fx.toolUse('a5', 'm4', 'tu5', 'Edit', { file_path: 'C:/proj/webview/src/components/CanvasWorkflow.tsx', old_string: 'const edges = []', new_string: 'const edges = build(stages)' }, T(8)),
  fx.toolResult('u6', 'tu5', 'ok', false, T(9), { structuredPatch: [{ lines: ['-const edges = []', '+const edges = build(stages)'] }] }),
  fx.text('a6', 'm5', 'Corrigi a criação das conexões.', 'end_turn', T(10)),
];

function snapshot(model, state) {
  const payload = view.buildPayload(model.events, state, model.report(), 'Ajustar o painel', 'sessao-teste.jsonl', NOW);
  const details = Object.fromEntries(model.events.map(e => [e.key, view.buildDetails(e)]));
  return { payload: { ...payload, newerSession: '' }, details };
}

async function main() {
  const model = new TranscriptModel();
  const state = store.emptyState();
  store.assignNewEvents(state, []);
  model.ingest(roundOne); store.assignNewEvents(state, model.events, NOW);
  const first = snapshot(model, state);
  model.ingest(roundTwo); store.assignNewEvents(state, model.events, NOW);
  const second = snapshot(model, state);

  const html = fs.readFileSync(path.join(__dirname, '../extension/webview/painel.html'), 'utf8')
    .replace('{{CSP}}', "default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-teste';")
    .replace('{{NONCE}}', 'teste');

  const { chromium } = require(playwrightPath);
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const results = [];
  const check = (name, fn) => { fn(); results.push('ok  ' + name); };
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 820 } });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    await page.exposeFunction('__fromPanel', msg => page.__sent.push(msg));
    page.__sent = [];
    await page.addInitScript(() => {
      window.acquireVsCodeApi = () => ({ postMessage: m => window.__fromPanel(m), getState: () => window.__state, setState: s => { window.__state = s; } });
    });
    await page.route('http://painel.test/**', r => r.fulfill({ contentType: 'text/html', body: html }));
    await page.goto('http://painel.test/');
    const deliver = async (snap) => {
      await page.evaluate(s => {
        window.__details = s.details;
        window.postMessage({ command: 'payload', payload: s.payload }, '*');
      }, snap);
      await page.waitForTimeout(150);
    };
    let answered = 0;
    const answerDetails = async () => {
      for (let i = 0; i < 40 && page.__sent.filter(m => m.command === 'details').length <= answered; i++) await page.waitForTimeout(25);
      const asks = page.__sent.filter(m => m.command === 'details');
      if (asks.length <= answered) throw new Error('o painel não pediu detalhes; mensagens: ' + JSON.stringify(page.__sent));
      answered = asks.length;
      await page.evaluate(key => window.postMessage({ command: 'details', details: window.__details[key] }, '*'), asks[asks.length - 1].key);
      await page.waitForTimeout(80);
    };

    await deliver(first);
    const nodeCount = await page.locator('.node').count();
    check('cada ação/pedido vira um cartão (' + nodeCount + ')', () => assert.equal(nodeCount, first.payload.nodes.length));
    const connectors = await page.locator('svg.edges path[marker-end]').count();
    // Columns: [prompt] [Read, Read] [Edit] [Bash] → 1x2 + 2x1 + 1x1 = 5 connectors
    check('conectores tracejados entre a sequência observada (' + connectors + ')', () => assert.equal(connectors, 5));
    check('grupo paralelo destacado', async () => {});
    assert.equal(await page.locator('svg.edges rect.parallel').count(), 1);
    check('texto da transcrição renderizado como texto (sem <img> injetado)', () => {});
    assert.equal(await page.locator('.node img, #tasks img, header img').count(), 0);
    assert.notEqual(await page.title(), 'xss');
    const errorCard = page.locator('.node.error');
    assert.equal(await errorCard.count(), 1);
    assert.match(await errorCard.innerText(), /Erro registrado/);
    results.push('ok  ação com is_error aparece como "Erro registrado"');
    const taskText = await page.locator('#tasks').innerText();
    assert.match(taskText, /Em andamento · 4 ações · 1 com erro/);
    results.push('ok  tarefa segue "Em andamento" apesar da falha intermediária');
    await page.screenshot({ path: path.join(shotsDir, 'ui-1-inicial.png') });

    // Inspect the long Bash output: full text available without truncation.
    await page.locator('.node', { hasText: 'Executou comando' }).click();
    await answerDetails();
    const insp = page.locator('#dockBody');
    assert.match(await insp.innerText(), /ENTRADA/);
    const fullCommand = first.details['t:tu4'].entry.find(i => i.label === 'Comando').text;
    assert.equal(await insp.locator('pre').first().textContent(), fullCommand);
    results.push('ok  comando completo no inspetor (' + fullCommand.length + ' caracteres)');
    // Retorno registrado starts collapsed; the user opens it before reading the full output.
    await insp.locator('details.col-group', { hasText: 'Ver detalhes do resultado' }).locator('summary').click();
    const more = insp.getByRole('button', { name: /Mostrar tudo/ });
    assert.equal(await more.count(), 1);
    await more.click();
    const outputLen = await insp.locator('section', { hasText: 'SAÍDA / RESULTADO' }).locator('pre').evaluate(p => p.textContent.length);
    assert.equal(outputLen, longOutput.length);
    results.push('ok  "Mostrar tudo" exibe a saída inteira (' + outputLen + ' caracteres)');

    // Pan by dragging, then a live update arrives: selection, inspector and position must stay.
    const vp = await page.locator('#viewport').boundingBox();
    await page.mouse.move(vp.x + 300, vp.y + vp.height - 60);
    await page.mouse.down();
    await page.mouse.move(vp.x + 380, vp.y + vp.height - 20, { steps: 5 });
    await page.mouse.up();
    const before = await page.locator('#world').evaluate(w => w.style.transform);
    await deliver(second);
    const asksAfterUpdate = page.__sent.filter(m => m.command === 'details').length;
    assert.equal(asksAfterUpdate, answered, 'ação selecionada sem mudança não deve recarregar detalhes');
    const after = await page.locator('#world').evaluate(w => w.style.transform);
    assert.equal(after, before);
    results.push('ok  pan/zoom preservados durante atualização');
    assert.equal(await page.locator('.node[aria-pressed="true"]').innerText().then(t => /Executou comando/.test(t)), true);
    assert.match(await page.locator('#dockTitle').innerText(), /Executou comando/);
    results.push('ok  seleção e inspetor preservados durante atualização');
    const keys = await page.locator('.node').evaluateAll(ns => ns.map(n => n.dataset.key));
    assert.equal(keys.length, second.payload.nodes.length);
    assert.equal(new Set(keys).size, keys.length);
    results.push('ok  novos cartões apareceram sem duplicar (' + keys.length + ' cartões, chaves únicas)');
    assert.equal(await page.locator('svg.edges path[marker-end]').count(), 7);
    results.push('ok  conectores acompanham os novos cartões (7)');
    assert.match(await page.locator('#tasks').innerText(), /Respondida · 5 ações · 1 com erro/);
    results.push('ok  resposta final muda o estado para "Respondida"');

    // Edit details: before/after and recorded patch.
    await page.locator('.node', { hasText: 'Editou arquivo' }).last().click();
    await answerDetails();
    await insp.locator('details.col-group', { hasText: 'Ver detalhes da entrada' }).locator('summary').click();
    await insp.locator('details.col-group', { hasText: 'Ver detalhes do resultado' }).locator('summary').click();
    const editText = await insp.innerText();
    assert.match(editText, /Trecho antes/);
    assert.match(editText, /Trecho depois/);
    assert.match(editText, /Alteração registrada/);
    assert.match(editText, /CanvasWorkflow\.tsx/);
    assert.ok(!editText.includes('C:/proj'), 'caminho completo não deve aparecer fora de "Caminho completo"');
    results.push('ok  edição mostra nome do arquivo, antes/depois e patch registrado');

    const scaleBefore = await page.locator('#world').evaluate(w => w.style.transform);
    await page.getByRole('button', { name: 'Ajustar à tela' }).click();
    assert.notEqual(await page.locator('#world').evaluate(w => w.style.transform), scaleBefore);
    const fitBox = await page.evaluate(() => {
      const vp = document.getElementById('viewport').getBoundingClientRect();
      const cards = [...document.querySelectorAll('.node')].map(n => n.getBoundingClientRect());
      return { vp: [vp.left, vp.top, vp.right, vp.bottom], min: Math.min(...cards.map(c => c.left)), max: Math.max(...cards.map(c => c.right)), top: Math.min(...cards.map(c => c.top)), bottom: Math.max(...cards.map(c => c.bottom)) };
    });
    assert.ok(fitBox.min >= fitBox.vp[0] && fitBox.max <= fitBox.vp[2] && fitBox.top >= fitBox.vp[1] && fitBox.bottom <= fitBox.vp[3], 'cartões fora da área após ajustar: ' + JSON.stringify(fitBox));
    results.push('ok  "Ajustar à tela" deixa todos os cartões dentro da área visível');
    await page.screenshot({ path: path.join(shotsDir, 'ui-2-atualizado-inspetor.png') });

    await page.locator('.task').first().click();
    assert.ok(page.__sent.some(m => m.command === 'selectTask'));
    await page.getByRole('button', { name: 'Nova tarefa' }).click();
    assert.ok(page.__sent.some(m => m.command === 'newTask'));
    results.push('ok  histórico e "Nova tarefa" enviam comandos à extensão');

    const narrow = await browser.newPage({ viewport: { width: 900, height: 700 } });
    await narrow.addInitScript(() => { window.acquireVsCodeApi = () => ({ postMessage() {}, getState() {}, setState() {} }); });
    await narrow.route('http://painel.test/**', r => r.fulfill({ contentType: 'text/html', body: html }));
    await narrow.goto('http://painel.test/');
    await narrow.evaluate(p => window.postMessage({ command: 'payload', payload: p }, '*'), second.payload);
    await narrow.waitForTimeout(150);
    const overflow = await narrow.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    assert.equal(overflow, false);
    await narrow.screenshot({ path: path.join(shotsDir, 'ui-3-estreito.png') });
    results.push('ok  largura estreita (900px) sem rolagem horizontal da página');

    assert.deepEqual(errors, []);
    results.push('ok  nenhum erro de script ou de CSP no console');
  } finally {
    await browser.close();
  }
  console.log(results.join('\n'));
  console.log('Capturas: ' + shotsDir);
}

main().catch(error => { console.error(error); process.exit(1); });
