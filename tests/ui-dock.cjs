// Browser test OUTSIDE VS Code for the bottom details dock, settings and the Gemini explanation states.
// Messages from the extension are simulated; the extension side is covered by tests/extension.test.cjs.
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
const DISCLOSURE = 'Use sua própria chave. Ao solicitar uma explicação, os dados selecionados desta etapa serão enviados ao Gemini. O uso está sujeito às cotas e condições da sua conta.';
const LONG_REPLY = 'Resposta longa sem quebras obrigatórias: ' + 'alteração-aplicada-em-src/componentes/CanvasWorkflow.tsx '.repeat(160);
const AI_TEXT = 'O que foi feito?\nLeu e editou o arquivo CanvasWorkflow.tsx para ajustar as conexões.\n\nQual foi o resultado?\nA edição falhou porque o trecho não foi encontrado.\n\nO que isso significa?\nA etapa não confirma se a correção final funcionou; a resposta final registra apenas o fim da rodada.';

const base = [
  fx.prompt('u1', 'Ajustar o painel', T(1)),
  fx.toolUse('a1', 'm1', 'tu1', 'Read', { file_path: 'C:/proj/src/a.ts' }, T(2)),
  fx.toolResult('u2', 'tu1', 'conteúdo A', false, T(3)),
  fx.toolUse('a2', 'm2', 'tu2', 'Edit', { file_path: 'C:/proj/src/a.ts', old_string: 'x', new_string: 'y' }, T(4)),
  fx.toolResult('u3', 'tu2', 'String to replace not found in file.', true, T(5)),
];
const withBash = [
  fx.toolUse('a3', 'm3', 'tu3', 'Bash', { command: 'npm test -- --watch=false', description: 'Rodar testes' }, T(6)),
  fx.toolResult('u4', 'tu3', 'ok', false, T(7)),
];
const withReply = [fx.text('a4', 'm4', LONG_REPLY, 'end_turn', T(8))];
const pendingBash = [fx.toolUse('a5', 'm5', 'tu5', 'Bash', { command: 'npm run build', description: 'Compilar' }, T(9))];

function snapshot(records) {
  const model = new TranscriptModel();
  const state = store.emptyState();
  store.assignNewEvents(state, []);
  model.ingest(records); store.assignNewEvents(state, model.events, NOW);
  const payload = view.buildPayload(model.events, state, model.report(), 'Ajustar o painel', 'sessao-teste.jsonl', NOW);
  // Real updates keep the task id; each synthetic snapshot is a separate build, so pin it to one id.
  const fixed = 'tarefa-fixa';
  payload.tasks = payload.tasks.map(t => ({ ...t, id: fixed }));
  payload.selectedTaskId = fixed;
  payload.activeTaskId = fixed;
  const details = Object.fromEntries(model.events.map(e => [e.key, view.buildDetails(e)]));
  return { payload: { ...payload, newerSession: '' }, details };
}

async function main() {
  const first = snapshot(base);
  const second = snapshot([...base, ...withBash, ...withReply]);
  const editedOk = snapshot([...base.slice(0, 3), fx.toolResult('u3', 'tu2', 'ok', false, T(5)), ...withBash, ...withReply]);
  const pending = snapshot([...base, ...pendingBash]);

  const html = fs.readFileSync(path.join(__dirname, '../extension/webview/painel.html'), 'utf8')
    .replace('{{CSP}}', "default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-teste';")
    .replace('{{NONCE}}', 'teste');

  const { chromium } = require(playwrightPath);
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const results = [];
  const ok = name => results.push('ok  ' + name);
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 860 } });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    page.__sent = [];
    await page.exposeFunction('__fromPanel', msg => page.__sent.push(msg));
    await page.addInitScript(() => {
      window.acquireVsCodeApi = () => ({ postMessage: m => window.__fromPanel(m), getState: () => window.__state, setState: s => { window.__state = s; } });
    });
    await page.route('http://painel.test/**', r => r.fulfill({ contentType: 'text/html', body: html }));
    await page.goto('http://painel.test/');

    const send = async msg => { await page.evaluate(m => window.postMessage(m, '*'), msg); await page.waitForTimeout(60); };
    const deliver = async snap => {
      await page.evaluate(s => { window.__details = s.details; window.postMessage({ command: 'payload', payload: s.payload }, '*'); }, snap);
      await page.waitForTimeout(120);
    };
    const sent = cmd => page.__sent.filter(m => m.command === cmd);
    const waitFor = async (fn, what) => {
      for (let i = 0; i < 60; i++) { if (await fn()) return; await page.waitForTimeout(25); }
      throw new Error('tempo esgotado: ' + what);
    };
    // Answers the latest details request with the synthetic view details for that key.
    let currentSnap = first;
    const detailsFor = async (key) => {
      await send({ command: 'details', details: currentSnap.details[key] });
    };
    const openNode = async (title) => {
      const before = sent('details').length;
      await page.getByRole('button', { name: 'Ajustar à tela' }).click();
      await page.locator('.node', { hasText: title }).first().click();
      await waitFor(async () => sent('details').length > before, 'detalhes após clicar');
      await detailsFor(sent('details').at(-1).key);
      await page.waitForTimeout(60);
    };
    const selectedKeyOf = title => currentSnap.payload.nodes.find(n => n.title === title).key;

    await deliver(first);
    await page.waitForTimeout(80);
    assert.equal(await page.locator('#dock').isVisible(), false, 'painel inferior não deve abrir sozinho');
    assert.equal(sent('explain').length, 0, 'nenhuma explicação automática');
    ok('painel inferior começa fechado e nenhuma explicação é pedida sem ação do usuário');

    // ---- 1. layout: full width below the flow, not covering the history
    await openNode('Editou arquivo');
    assert.equal(await page.locator('#dock').isVisible(), true);
    const geo = await page.evaluate(() => {
      const r = s => document.querySelector(s).getBoundingClientRect();
      return { history: r('aside.history').right, viewport: r('#viewport').bottom, dock: { left: r('#dock').left, top: r('#dock').top, right: r('#dock').right, bottom: r('#dock').bottom }, stage: r('main.stage').right };
    });
    assert.ok(geo.dock.left >= geo.history - 1, 'painel cobre o histórico');
    assert.ok(geo.dock.top >= geo.viewport - 1, 'painel cobre o fluxo');
    assert.ok(Math.abs(geo.dock.right - geo.stage) < 2, 'painel não ocupa toda a largura da área de trabalho');
    ok('detalhes abrem abaixo do fluxo, em toda a largura da área de trabalho, sem cobrir o histórico');

    // ---- 2. readable content: title, state, plain explanation, input, result, technical details
    const titleText = await page.locator('#dockTitle').innerText();
    assert.equal(titleText, 'Editou arquivo');
    assert.equal(await page.locator('#dockState').innerText(), 'Erro registrado');
    await page.locator('#dockBody details.col-group', { hasText: 'Ver detalhes da entrada' }).locator('summary').click();
    const bodyText = await page.locator('#dockBody').innerText();
    for (const part of ['Trecho antes', 'Trecho depois', 'Erro registrado', 'DETALHES TÉCNICOS']) assert.ok(bodyText.includes(part), 'falta: ' + part);
    ok('título, estado, antes/depois, erro e detalhes técnicos aparecem na ordem esperada');

    // ---- 3. resize, collapse, close
    const dock = page.locator('#dock');
    const h0 = (await dock.boundingBox()).height;
    const grip = await page.locator('#grip').boundingBox();
    await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2);
    await page.mouse.down();
    await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2 - 120, { steps: 6 });
    await page.mouse.up();
    const h1 = (await dock.boundingBox()).height;
    assert.ok(Math.abs(h1 - h0 - 120) < 3, 'redimensionar não acompanhou o arraste: ' + h0 + ' → ' + h1);
    await page.locator('#grip').focus();
    await page.keyboard.press('ArrowDown');
    const h2 = (await dock.boundingBox()).height;
    assert.ok(Math.abs(h2 - h1 + 24) < 3, 'teclado não redimensionou');
    const grip2 = await page.locator('#grip').boundingBox();
    await page.mouse.move(grip2.x + grip2.width / 2, grip2.y + grip2.height / 2);
    await page.mouse.down();
    await page.mouse.move(grip2.x + grip2.width / 2, grip2.y + 2000, { steps: 4 });
    await page.mouse.up();
    const hMin = (await dock.boundingBox()).height;
    assert.ok(hMin >= 139 && hMin <= 145, 'altura mínima não respeitada: ' + hMin);
    ok('altura redimensionável por arraste e pelo teclado, com limite mínimo');

    await page.getByRole('button', { name: 'Recolher detalhes' }).click();
    assert.equal(await page.locator('#dockBody').isVisible(), false);
    assert.equal(await page.locator('#dock').isVisible(), true, 'recolher não deve fechar');
    await page.getByRole('button', { name: 'Expandir detalhes' }).click();
    assert.equal(await page.locator('#dockBody').isVisible(), true);
    ok('recolher e expandir mantêm a etapa selecionada');

    // ---- 4. updates keep the selected step and the dock open
    await page.locator('.node', { hasText: 'Editou arquivo' }).click();
    const detailsAsked = sent('details').length;
    currentSnap = second;
    await deliver(second);
    assert.equal(await page.locator('#dock').isVisible(), true, 'atualização fechou o painel');
    assert.equal(await page.locator('#dockTitle').innerText(), 'Editou arquivo', 'atualização trocou a etapa');
    assert.equal(sent('details').length, detailsAsked, 'etapa sem mudança não deve recarregar detalhes');
    const kept = await page.locator('#dockBody').innerText();
    assert.ok(kept.includes('Trecho antes'));
    const seen = await page.locator('.node[aria-pressed="true"]').innerText();
    assert.match(seen, /Editou arquivo/);
    ok('atualização automática preserva etapa selecionada, painel aberto e conteúdo');

    // ---- 5. long answer wraps and does not scroll horizontally
    await openNode('Respondeu ao usuário');
    await page.waitForTimeout(80);
    await page.locator('#dockBody details.col-group', { hasText: 'Ver detalhes do resultado' }).locator('summary').click();
    const wrap = await page.evaluate(() => {
      const body = document.getElementById('dockBody');
      const pre = body.querySelector('.block .prose:not(.lead)');
      return {
        bodyFits: body.scrollWidth <= body.clientWidth + 1,
        preFits: pre ? pre.scrollWidth <= pre.clientWidth + 1 : null,
        whitespace: pre ? getComputedStyle(pre).whiteSpace : null,
        measure: pre ? Math.round(pre.getBoundingClientRect().width / parseFloat(getComputedStyle(pre).fontSize)) : null,
        pageFits: document.documentElement.scrollWidth <= window.innerWidth,
      };
    });
    assert.equal(wrap.bodyFits, true, 'corpo do painel rola na horizontal');
    assert.equal(wrap.preFits, true, 'texto longo não quebra linha');
    assert.equal(wrap.whitespace, 'pre-wrap');
    assert.equal(wrap.pageFits, true);
    await page.screenshot({ path: path.join(shotsDir, 'dock-1-resposta-longa.png') });
    ok('resposta longa quebra linha e não cria rolagem horizontal');

    // ---- 6. close clears the selection
    await page.getByRole('button', { name: 'Fechar detalhes' }).click();
    assert.equal(await page.locator('#dock').isVisible(), false);
    assert.equal(await page.locator('.node[aria-pressed="true"]').count(), 0);
    ok('fechar remove a seleção e esconde o painel');

    // ---- 7. settings dialog and Gemini key status (never shows the key)
    await openNode('Editou arquivo');
    await page.getByRole('button', { name: 'Configurações' }).click();
    assert.equal(await page.locator('#settings').evaluate(d => d.open), true);
    const dlg = await page.locator('#settings').innerText();
    assert.ok(dlg.includes(DISCLOSURE), 'texto de divulgação diferente do solicitado');
    assert.equal(await page.locator('#geminiStatus').innerText(), 'Não configurado');
    assert.equal(await page.locator('#geminiRemove').isDisabled(), true);
    await page.getByRole('button', { name: 'Adicionar chave' }).click();
    assert.ok(sent('geminiSet').length === 1, 'adicionar chave não pediu a caixa nativa');
    await send({ command: 'gemini', configured: true });
    assert.equal(await page.locator('#geminiStatus').innerText(), 'Configurado');
    assert.equal(await page.locator('#geminiSet').innerText(), 'Substituir chave');
    assert.equal(await page.locator('#geminiRemove').isDisabled(), false);
    await page.getByRole('button', { name: 'Remover chave' }).click();
    assert.equal(sent('geminiRemove').length, 1);
    await page.locator('#settings').getByRole('button', { name: 'Fechar', exact: true }).click();
    assert.equal(await page.locator('#settings').evaluate(d => d.open), false);
    ok('configurações mostram só "Configurado" ou "Não configurado" e pedem a chave pela extensão');

    // ---- 8. Gemini: no key → panel keeps working, explanation explains why
    await send({ command: 'gemini', configured: false });
    await openNode('Editou arquivo');
    assert.ok((await page.locator('#aiBox').innerText()).includes('Sem chave configurada'));
    await page.getByRole('button', { name: 'Explicar esta etapa' }).click();
    const askNoKey = sent('explain').at(-1);
    assert.equal(askNoKey.key, selectedKeyOf('Editou arquivo'));
    await send({ command: 'explanation', key: askNoKey.key, sig: askNoKey.sig, status: 'unconfigured' });
    assert.ok((await page.locator('#aiBox').innerText()).includes('Nenhuma chave do Gemini está configurada'));
    ok('sem chave: o painel segue normal e a explicação informa o motivo');

    // ---- 9. Gemini: loading → ready (three sections, labelled as AI)
    await send({ command: 'gemini', configured: true });
    await page.getByRole('button', { name: 'Explicar esta etapa' }).click();
    const ask = sent('explain').at(-1);
    await send({ command: 'explanation', key: ask.key, sig: ask.sig, status: 'loading' });
    assert.equal(await page.locator('#aiBox [role="status"]').innerText(), 'Gerando explicação…');
    assert.equal(await page.getByRole('button', { name: 'Gerando…' }).isDisabled(), true);
    await send({ command: 'explanation', key: ask.key, sig: ask.sig, status: 'ready', text: AI_TEXT });
    const aiText = await page.locator('#aiBox').innerText();
    for (const t of ['O que foi feito?', 'Qual foi o resultado?', 'O que isso significa?']) assert.ok(aiText.includes(t));
    assert.equal(await page.locator('#aiBox .sub-id').innerText(), 'Gerada por IA');
    const aiTip = await page.locator('#aiBox [role="tooltip"]').textContent();
    assert.ok(aiTip.includes('Gerada por IA a partir do comentário do Claude'), 'legenda deve estar no tooltip');
    assert.ok(!aiText.includes('Gerada por IA a partir do comentário'), 'legenda longa não pode ocupar espaço visível');
    await page.screenshot({ path: path.join(shotsDir, 'dock-2-explicacao-ia.png') });
    ok('explicação em três partes, marcada como gerada por IA, com estado de carregamento');

    // ---- 10. preserved across updates for the same step, no repeated request on re-render
    const asksBefore = sent('explain').length;
    await deliver(second);
    assert.ok((await page.locator('#aiBox').innerText()).includes('O que foi feito?'), 'atualização apagou a explicação');
    assert.equal(sent('explain').length, asksBefore, 'atualização chamou o Gemini de novo');
    ok('explicação preservada durante atualização da mesma etapa, sem nova chamada');

    // ---- 11. step changed → explanation marked stale, user must ask again
    currentSnap = editedOk;
    await deliver(editedOk);
    await page.waitForTimeout(60);
    assert.ok((await page.locator('#aiBox').innerText()).includes('A etapa mudou desde a última explicação'), 'mudança da etapa não foi sinalizada');
    ok('mudança da etapa invalida a explicação antiga e avisa o usuário');

    // ---- 12. errors and insufficient data
    await page.getByRole('button', { name: 'Explicar esta etapa' }).click();
    const again = sent('explain').at(-1);
    await send({ command: 'explanation', key: again.key, sig: again.sig, status: 'error', message: 'O limite ou a cota da sua conta no Gemini foi atingido. Tente mais tarde.' });
    assert.ok((await page.locator('#aiBox').innerText()).includes('limite ou a cota'));
    assert.equal(await page.getByRole('button', { name: 'Tentar novamente' }).count(), 1);
    ok('falha mostra a causa e oferece tentar novamente');

    currentSnap = pending;
    await deliver(pending);
    await openNode('Executou comando');
    await page.getByRole('button', { name: 'Explicar esta etapa' }).click();
    const pend = sent('explain').at(-1);
    await send({ command: 'explanation', key: pend.key, sig: pend.sig, status: 'insufficient' });
    assert.ok((await page.locator('#aiBox').innerText()).includes('Ainda não há resultado registrado'));
    ok('ação sem resultado registrado não gera explicação e informa o motivo');

    await page.screenshot({ path: path.join(shotsDir, 'dock-3-ia-pendente.png') });

    // ---- 13. collapsed view and narrow width
    await page.getByRole('button', { name: 'Recolher detalhes' }).click();
    await page.screenshot({ path: path.join(shotsDir, 'dock-4-recolhido.png') });
    await page.getByRole('button', { name: 'Expandir detalhes' }).click();

    const narrow = await browser.newPage({ viewport: { width: 900, height: 700 } });
    await narrow.addInitScript(() => { window.acquireVsCodeApi = () => ({ postMessage() {}, getState() {}, setState() {} }); });
    await narrow.route('http://painel.test/**', r => r.fulfill({ contentType: 'text/html', body: html }));
    await narrow.goto('http://painel.test/');
    await narrow.evaluate(p => window.postMessage({ command: 'payload', payload: p }, '*'), second.payload);
    await narrow.waitForTimeout(150);
    const rowKey = second.payload.nodes.find(n => n.title === 'Editou arquivo').key;
    await narrow.getByRole('button', { name: 'Ajustar à tela' }).click();
    await narrow.locator('.node', { hasText: 'Editou arquivo' }).click();
    await narrow.evaluate(d => window.postMessage({ command: 'details', details: d }, '*'), second.details[rowKey]);
    await narrow.waitForTimeout(150);
    assert.equal(await narrow.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), false);
    await narrow.screenshot({ path: path.join(shotsDir, 'dock-5-estreito.png') });
    ok('largura de 900 px: painel inferior sem rolagem horizontal da página');

    assert.deepEqual(errors, []);
    ok('nenhum erro de script ou de política de conteúdo (CSP) no console');
  } finally {
    await browser.close();
  }
  console.log(results.join('\n'));
  console.log('Capturas: ' + shotsDir);
}

main().catch(error => { console.error(error); process.exit(1); });
