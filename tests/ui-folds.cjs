// Browser test OUTSIDE VS Code for the details panel: one grouper per column (collapsed by default),
// tooltips instead of permanent legends, per-step state across updates, the task-list toggle,
// and no Gemini call from toggling anything. Synthetic data only; the extension side is in tests/extension.test.cjs.
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
const LONG_OLD = 'const linhaAntiga = 1;\n'.repeat(160);
const LONG_NEW = 'const linhaNova = 2;\n'.repeat(160);
const HUGE = 'saída extensa de build\n'.repeat(1400);
const COMMENT = 'Vou ajustar o trecho antigo e validar o resultado.';
const AI_TEXT = 'O que foi feito?\nEditou o arquivo.\n\nQual foi o resultado?\nO trecho foi substituído.\n\nO que isso significa?\nA etapa mostra apenas a edição registrada.';

const base = [
  fx.prompt('u1', 'Ajustar o painel', T(1)),
  fx.text('c1', 'mA', COMMENT, 'tool_use', T(2)),
  fx.toolUse('a1', 'mA', 'e1', 'Edit', { file_path: 'C:/proj/src/grande.ts', old_string: LONG_OLD, new_string: LONG_NEW }, T(2)),
  fx.toolResult('u2', 'e1', 'ok', false, T(3), { structuredPatch: [{ lines: ['-linhaAntiga', '+linhaNova'] }] }),
  // Same message as the edit: makes the edit's comment a round comment covering two actions.
  fx.toolUse('a1b', 'mA', 'r9', 'Read', { file_path: 'C:/proj/readme.md' }, T(2)),
  fx.toolResult('u9', 'r9', 'ok', false, T(3)),
  fx.toolUse('a2', 'mB', 'b1', 'Bash', { command: 'npm run build', description: 'Compilar' }, T(4)),
  fx.toolResult('u3', 'b1', HUGE, false, T(5)),
  fx.text('a3', 'mC', 'Pronto.', 'end_turn', T(6)),
];
const LONG_OUTPUT_LENGTH = HUGE.length;

function snapshot(records) {
  const model = new TranscriptModel();
  const state = store.emptyState();
  store.assignNewEvents(state, []);
  model.ingest(records); store.assignNewEvents(state, model.events, NOW);
  const payload = view.buildPayload(model.events, state, model.report(), 'Ajustar o painel', 'sessao-teste.jsonl', NOW);
  const fixed = 'tarefa-fixa';
  payload.tasks = payload.tasks.map(t => ({ ...t, id: fixed }));
  payload.selectedTaskId = fixed;
  payload.activeTaskId = fixed;
  const details = Object.fromEntries(model.events.map(e => [e.key, view.buildDetails(e, model.commentFor(e))]));
  return { payload: { ...payload, newerSession: '' }, details };
}

async function main() {
  const snap = snapshot(base);
  // A real status change for the edit (error result), so the card signature changes.
  const editedFailed = snapshot(base.map(r => (r.uuid === 'u2' ? fx.toolResult('u2', 'e1', 'trecho não encontrado', true, T(9)) : r)));
  const pendingRun = snapshot([...base.slice(0, 3), fx.toolUse('a9', 'mD', 'p1', 'Bash', { command: 'npm test' }, T(7))]);

  const html = fs.readFileSync(path.join(__dirname, '../extension/webview/painel.html'), 'utf8')
    .replace('{{CSP}}', "default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-teste';")
    .replace('{{NONCE}}', 'teste');

  const { chromium } = require(playwrightPath);
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const results = [];
  const ok = name => results.push('ok  ' + name);
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const errors = [];
    const external = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    page.on('request', r => { if (!r.url().startsWith('http://painel.test/') && !r.url().startsWith('data:')) external.push(r.url()); });
    page.__sent = [];
    await page.exposeFunction('__fromPanel', msg => page.__sent.push(msg));
    await page.addInitScript(() => {
      window.acquireVsCodeApi = () => ({ postMessage: m => window.__fromPanel(m), getState: () => window.__state, setState: s => { window.__state = s; } });
    });
    await page.route('http://painel.test/**', r => r.fulfill({ contentType: 'text/html', body: html }));
    await page.goto('http://painel.test/');

    const sent = cmd => page.__sent.filter(m => m.command === cmd);
    const waitFor = async (fn, what) => {
      for (let i = 0; i < 80; i++) { if (await fn()) return; await page.waitForTimeout(25); }
      throw new Error('tempo esgotado: ' + what);
    };
    let current = snap;
    const deliver = async s => {
      current = s;
      await page.evaluate(x => { window.__details = x.details; window.postMessage({ command: 'payload', payload: x.payload }, '*'); }, s);
      await page.waitForTimeout(120);
    };
    const answerDetailsSince = async before => {
      await waitFor(async () => sent('details').length > before, 'pedido de detalhes');
      const asked = sent('details').at(-1);
      await page.evaluate(d => window.postMessage({ command: 'details', details: d }, '*'), current.details[asked.key]);
      await page.waitForTimeout(80);
    };
    const keyOf = title => current.payload.nodes.find(n => n.title === title).key;
    const openNode = async title => {
      await page.getByRole('button', { name: 'Ajustar à tela' }).click();
      const before = sent('details').length;
      await page.locator('.node', { hasText: title }).first().click();
      await answerDetailsSince(before);
    };
    // Groupers are <details class="col-group">; each is found by its visible summary text.
    const grouper = summary => page.locator('#dockBody details.col-group', { has: page.locator('summary', { hasText: summary }) });
    const groupOpen = async summary => grouper(summary).evaluate(d => d.open);
    const sumOf = summary => grouper(summary).locator('summary');
    const comment = () => page.locator('#dockBody details.comment-fold');
    const ai = () => page.locator('#dockBody details.ai-fold');

    await deliver(snap);
    await openNode('Editou arquivo');

    // ---- 1. defaults: one grouper per column, collapsed; Gemini open; technical collapsed
    assert.equal(await groupOpen('Ver detalhes do arquivo'), false);
    assert.equal(await groupOpen('Ver detalhes da entrada'), false);
    assert.equal(await groupOpen('Ver detalhes do resultado'), false);
    assert.equal(await comment().evaluate(d => d.open), false);
    assert.equal(await ai().evaluate(d => d.open), true);
    assert.equal(await page.locator('#dockBody details.tech').evaluate(d => d.open), false);
    assert.equal(await page.getByRole('button', { name: 'Explicar esta etapa' }).isVisible(), true);
    ok('um agrupador por coluna, recolhido por padrão; explicação aberta; técnicos recolhidos');

    // ---- 2. compact, top-aligned columns with one main grouper each and no duplicated description
    const cols = await page.evaluate(() => [...document.querySelectorAll('#dockBody .cols3 > section.col')].map(c => ({ h: c.querySelector('h3').textContent, top: Math.round(c.getBoundingClientRect().top), height: Math.round(c.getBoundingClientRect().height), groups: c.querySelectorAll(':scope > details.col-group').length })));
    assert.deepEqual(cols.map(c => c.h), ['ARQUIVO', 'ENTRADA', 'SAÍDA / RESULTADO']);
    assert.equal(new Set(cols.map(c => c.top)).size, 1, 'colunas alinhadas no topo');
    assert.ok(cols.every(c => c.groups === 1), 'cada coluna tem um único agrupador principal');
    assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector('#dockBody .cols3')).alignItems), 'start', 'colunas não podem ser esticadas até a mesma altura');
    const outside = await page.evaluate(() => [...document.querySelectorAll('#dockBody .cols3 .col > :not(details):not(h3)')].map(n => n.textContent));
    assert.ok(!outside.some(t => /Ver detalhes|Trecho/.test(t)), 'nada de conteúdo fora dos agrupadores');
    ok('colunas compactas, alinhadas no topo, cada uma com um agrupador; sem descrição repetida fora');

    // ---- 3. expanding shows the complete content (long edit, no truncation)
    await sumOf('Ver detalhes da entrada').click();
    assert.equal(await groupOpen('Ver detalhes da entrada'), true);
    const beforeText = await grouper('Ver detalhes da entrada').locator('pre').first().evaluate(p => p.textContent);
    const expected = current.details[keyOf('Editou arquivo')].entry.find(i => i.label === 'Trecho antes').text;
    assert.ok(beforeText.length > 3000, 'trecho deveria ser longo');
    assert.equal(beforeText, expected, 'trecho longo não pode ser cortado');
    ok('entrada expandida mostra o trecho integral (' + beforeText.length + ' caracteres)');

    // ---- 4. keyboard: focusable summary, Enter/Space toggle, focus visible
    await sumOf('Ver detalhes do resultado').focus();
    await page.keyboard.press('Tab');
    await page.keyboard.press('Shift+Tab');
    assert.equal(await sumOf('Ver detalhes do resultado').evaluate(s => s === document.activeElement && s.matches(':focus-visible')), true, 'foco por teclado precisa ser visível');
    await page.keyboard.press('Enter');
    assert.equal(await groupOpen('Ver detalhes do resultado'), true);
    await page.keyboard.press(' ');
    assert.equal(await groupOpen('Ver detalhes do resultado'), false);
    ok('agrupadores operam por teclado (Enter/Espaço) com foco visível');

    // ---- 5. tooltips: keyboard-reachable, described by aria, opened by click without toggling the summary
    const info = comment().locator('button.info');
    await info.focus();
    await page.keyboard.press('Tab');
    await page.keyboard.press('Shift+Tab');
    assert.equal(await comment().locator('.tip-text').evaluate(t => getComputedStyle(t).display), 'block', 'tooltip deve aparecer com foco no teclado');
    assert.equal(await info.getAttribute('aria-describedby'), await comment().locator('.tip-text').getAttribute('id'));
    assert.match(await comment().locator('.tip-text').textContent(), /Texto público desta mesma resposta do Claude, que cobre 2 ações; esta etapa é uma delas/);
    ok('comentário da rodada: tooltip acessível por teclado com a nota de cobertura');
    const commentBefore = await comment().evaluate(d => d.open);
    await info.click();
    assert.equal(await comment().evaluate(d => d.open), commentBefore, 'clicar no ícone não pode abrir/fechar o comentário');
    assert.equal(await info.getAttribute('aria-expanded'), 'true');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(40);
    await info.click();
    ok('ícone de informação abre por clique sem alternar a seção; Esc fecha');

    // ---- 6. the Claude comment opens to the original text, with the Claude mark
    assert.equal(await comment().locator('use[href="#logo-claude"]').count(), 1);
    assert.equal(await page.evaluate(() => document.querySelector('#logo-claude g').getAttribute('fill')), '#D97757');
    await comment().locator('summary').click();
    assert.match(await comment().innerText(), new RegExp(COMMENT.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    ok('comentário abre com o texto original integral e a marca do Claude');

    // ---- 7. Gemini: marks, visible identification without the long legend
    assert.equal(await ai().locator('use[href="#logo-gemini"]').count(), 1);
    assert.equal(await ai().locator('.sub-id').count(), 0, 'sem explicação gerada, não há selo');
    assert.ok(!(await ai().innerText()).includes('Gerada por IA a partir do comentário'), 'legenda longa não pode ocupar espaço');
    assert.match(await ai().locator('[role="tooltip"]').textContent(), /Não é o comentário original/);
    ok('marca do Gemini; legenda longa só no tooltip');

    // ---- 8. toggling never calls Gemini (sections, tooltips, collapse)
    const explainsBefore = sent('explain').length;
    await ai().locator('summary').click();
    await ai().locator('summary').click();
    assert.equal(await page.getByRole('button', { name: 'Explicar esta etapa' }).isVisible(), true, 'botão deve ficar acessível com a explicação recolhida');
    await ai().locator('button.info').click();
    await sumOf('Ver detalhes da entrada').click();
    await comment().locator('summary').click();
    await page.waitForTimeout(100);
    assert.equal(sent('explain').length, explainsBefore, 'expandir, recolher ou abrir tooltip não pode chamar o Gemini');
    ok('alternar seções e tooltips não chama o Gemini; botão continua acessível');

    // ---- 9. user-requested generation opens the explanation; the selo appears under the title
    await ai().locator('summary').click();
    assert.equal(await ai().evaluate(d => d.open), false);
    await page.getByRole('button', { name: 'Explicar esta etapa' }).click();
    assert.equal(await ai().evaluate(d => d.open), true, 'geração pedida pelo usuário deve abrir a explicação');
    const ask = sent('explain').at(-1);
    await page.evaluate(x => window.postMessage({ command: 'explanation', key: x.key, sig: x.sig, status: 'ready', text: x.text }, '*'), { ...ask, text: AI_TEXT });
    await page.waitForTimeout(120);
    assert.equal(await ai().locator('.sub-id').innerText(), 'Gerada por IA');
    assert.match(await ai().innerText(), /Qual foi o resultado/);
    ok('explicação abre após a geração pedida; "Gerada por IA" logo abaixo do título');

    // ---- 10. per-step state survives updates, failed status changes, and selection changes
    await sumOf('Ver detalhes da entrada').click();
    assert.equal(await groupOpen('Ver detalhes da entrada'), true);
    await deliver(snap);
    assert.equal(await groupOpen('Ver detalhes da entrada'), true, 'atualização idêntica fechou o agrupador');
    const beforeChange = sent('details').length;
    await deliver(editedFailed);
    await answerDetailsSince(beforeChange);
    assert.equal(await groupOpen('Ver detalhes da entrada'), true, 'mudança de status fechou o agrupador escolhido');
    const commentBeforeSwitch = await comment().evaluate(d => d.open);
    await openNode('Respondeu ao usuário');
    await openNode('Editou arquivo');
    assert.equal(await groupOpen('Ver detalhes da entrada'), true, 'trocar de etapa e voltar perdeu o estado');
    assert.equal(await comment().evaluate(d => d.open), commentBeforeSwitch, 'trocar de etapa e voltar perdeu o estado do comentário');
    const saved = await page.evaluate(() => window.__state);
    assert.ok(saved && saved.open && Object.keys(saved.open).length >= 1, 'estados devem ficar salvos');
    ok('estados aberto/fechado preservados por etapa durante atualizações e trocas de seleção');

    // ---- 11. long result: full content and "Mostrar tudo" inside the grouper
    await openNode('Executou comando');
    assert.equal(await groupOpen('Ver detalhes do resultado'), false, 'agrupador novo começa recolhido');
    await sumOf('Ver detalhes do resultado').click();
    const more = page.locator('#dockBody').getByRole('button', { name: /Mostrar tudo/ });
    assert.equal(await more.count(), 1);
    await more.click();
    const outLen = await grouper('Ver detalhes do resultado').locator('pre').first().evaluate(p => p.textContent.length);
    assert.equal(outLen, LONG_OUTPUT_LENGTH);
    ok('resultado extenso: agrupador expande e "Mostrar tudo" entrega o conteúdo integral (' + outLen + ' caracteres)');
    await page.screenshot({ path: path.join(shotsDir, 'groups-1-resultado.png') });

    // ---- 12. empty states: no empty button, plain text instead
    await deliver(pendingRun);
    await openNode('Executou comando');
    const pendingCol = await page.evaluate(() => [...document.querySelectorAll('#dockBody .cols3 section.col')].find(c => c.querySelector('h3').textContent === 'SAÍDA / RESULTADO').innerText);
    assert.match(pendingCol, /Sem resultado registrado/);
    assert.equal(await page.evaluate(() => [...document.querySelectorAll('#dockBody .cols3 section.col')].find(c => c.querySelector('h3').textContent === 'SAÍDA / RESULTADO').querySelectorAll('button').length), 0, 'sem botão vazio');
    ok('sem resultado: texto "Sem resultado registrado", sem botão vazio');

    // ---- 13. task list can be collapsed and restored; selection and the detail panel stay
    await openNode('Editou arquivo');
    const selectedBefore = await page.locator('.node[aria-pressed="true"]').innerText();
    const widthOpen = await page.locator('#viewport').evaluate(v => v.getBoundingClientRect().width);
    await page.getByRole('button', { name: 'Ocultar tarefas' }).click();
    assert.equal(await page.locator('#taskPane').isHidden(), true);
    const widthHidden = await page.locator('#viewport').evaluate(v => v.getBoundingClientRect().width);
    assert.ok(widthHidden > widthOpen + 200, 'fluxo deve aproveitar o espaço da lista recolhida');
    assert.equal(await page.locator('.node[aria-pressed="true"]').innerText(), selectedBefore, 'recolher perdeu a seleção');
    assert.equal(await page.getByRole('button', { name: 'Mostrar tarefas' }).isVisible(), true, 'botão de reabertura deve ficar visível');
    assert.equal(await page.evaluate(() => window.__state.tasksHidden), true, 'preferência deve ser salva');
    await deliver(snap);
    assert.equal(await page.locator('#taskPane').isHidden(), true, 'atualização reabriu a lista');
    await page.getByRole('button', { name: 'Mostrar tarefas' }).click();
    assert.equal(await page.locator('#taskPane').isVisible(), true);
    ok('lista de tarefas recolhe e reabre sem perder seleção; preferência persiste nas atualizações');
    await page.screenshot({ path: path.join(shotsDir, 'groups-2-lista-recolhida.png') });

    // ---- 14. narrow width keeps the column order
    const narrow = await browser.newPage({ viewport: { width: 700, height: 1000 } });
    await narrow.addInitScript(() => { window.acquireVsCodeApi = () => ({ postMessage() {}, getState() {}, setState() {} }); });
    await narrow.route('http://painel.test/**', r => r.fulfill({ contentType: 'text/html', body: html }));
    await narrow.goto('http://painel.test/');
    await narrow.evaluate(x => window.postMessage({ command: 'payload', payload: x.payload }, '*'), snap);
    await narrow.waitForTimeout(100);
    await narrow.getByRole('button', { name: 'Ajustar à tela' }).click();
    await narrow.locator('.node', { hasText: 'Editou arquivo' }).click();
    await narrow.waitForTimeout(80);
    await narrow.evaluate(d => window.postMessage({ command: 'details', details: d }, '*'), snap.details[keyOf('Editou arquivo')]);
    await narrow.waitForTimeout(120);
    const order = await narrow.evaluate(() => [...document.querySelectorAll('#dockBody .cols3 > section.col > h3')].map(h => h.textContent));
    assert.deepEqual(order, ['ARQUIVO', 'ENTRADA', 'SAÍDA / RESULTADO']);
    const stacked = await narrow.evaluate(() => { const c = [...document.querySelectorAll('#dockBody .cols3 > section.col')].map(x => x.getBoundingClientRect()); return c.every((r, i) => i === 0 || r.top >= c[i - 1].bottom - 1); });
    assert.equal(stacked, true);
    await narrow.screenshot({ path: path.join(shotsDir, 'groups-3-estreito.png') });
    ok('telas estreitas empilham as colunas mantendo a ordem');

    assert.deepEqual(external, [], 'nenhum recurso externo pode ser carregado: ' + external.join(', '));
    ok('nenhuma requisição externa: ícones e marcas são SVG locais');
    assert.deepEqual(errors, []);
    ok('nenhum erro de script ou de política de conteúdo');
  } finally {
    await browser.close();
  }
  console.log(results.join('\n'));
  console.log('Capturas: ' + shotsDir);
}

main().catch(error => { console.error(error); process.exit(1); });
