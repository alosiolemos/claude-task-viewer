// Interface test OUTSIDE VS Code: real painel.html in headless Edge with invented payloads.
// Header origin, cross-session list with filters, consultation banner and the export review dialog.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const playwrightPath = process.env.PAINEL_PLAYWRIGHT_PATH || 'C:/Users/alois/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright';
const { chromium } = require(playwrightPath);

const A = '11111111-1111-4111-8111-111111111111', B = '22222222-2222-4222-8222-222222222222', C = '33333333-3333-4333-8333-333333333333';
const now = new Date();
const iso = min => new Date(now.getTime() - min * 60000).toISOString();
const entry = (sessionId, taskId, title, conversation, project, projectKey, min, extra = {}) => ({
  ref: sessionId + '|' + taskId, file: 'x', sessionId, taskId, title, conversation, project, projectKey, time: iso(min),
  state: 'answered', actions: 2, failures: 0, legacy: false, available: true, ...extra,
});
const historyList = [
  entry('sess-a', A, 'Ajustar o cabeçalho', 'Conversa <img src=x onerror=alert(1)>', 'painel', 'k-painel', 5),
  entry('sess-b', B, 'Corrigir testes', '', 'painel', 'k-painel', 30, { state: 'running' }),
  entry('sess-c', C, 'Planilha de vendas', 'Enriquecimento', 'dados', 'k-dados', 60, { available: false, state: 'unknown' }),
  entry('sess-a', 'legado', 'Registros anteriores ao painel', 'Conversa <img src=x onerror=alert(1)>', 'painel', 'k-painel', 90, { legacy: true, state: 'legacy' }),
];
const basePayload = {
  sessionTitle: 'Conversa <img src=x onerror=alert(1)>', transcriptFile: 'sess-a.jsonl',
  tasks: [{ id: A, title: 'Ajustar o cabeçalho', legacy: false, active: true, state: 'answered', actions: 2, failures: 0, firstTime: iso(6), lastTime: iso(5) }],
  selectedTaskId: A, activeTaskId: A, nodes: [], warnings: [], summary: '', taskSummaryMeta: null, newerSession: '',
  origin: { conversation: 'Conversa <img src=x onerror=alert(1)>', project: 'painel', sessionId: 'sess-a', taskId: A, available: true, other: false },
  history: historyList, currentProjectKey: 'k-painel', selectedRef: 'sess-a|' + A, activeRef: 'sess-a|' + A,
  activeTitle: 'Ajustar o cabeçalho', activeConversation: 'Conversa', viewingOther: false,
};

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const results = [];
  const check = async (name, fn) => { await fn(); results.push('ok  ' + name); };
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const sent = [], errors = [], requests = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    page.on('request', r => { if (!r.url().startsWith('http://painel.test/')) requests.push(r.url()); });
    await page.exposeFunction('__fromPanel', m => sent.push(m));
    await page.addInitScript(() => { window.acquireVsCodeApi = () => ({ postMessage: m => window.__fromPanel(m), getState: () => window.__state, setState: s => { window.__state = s; } }); });
    const html = fs.readFileSync(path.join(__dirname, '../extension/webview/painel.html'), 'utf8')
      .replace('{{CSP}}', "default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-teste';").replace('{{NONCE}}', 'teste');
    await page.route('http://painel.test/**', r => r.fulfill({ contentType: 'text/html', body: html }));
    await page.goto('http://painel.test/');
    const post = async m => { await page.evaluate(m => window.postMessage(m, '*'), m); await page.waitForTimeout(80); };
    const deliver = p => post({ command: 'payload', payload: p });
    const items = () => page.locator('#tasks .task');
    await deliver(basePayload);

    await check('cabeçalho: título à esquerda, conversa e projeto · ID abaixo, ícones à direita', async () => {
      assert.equal(await page.locator('#productName').innerText(), 'Ajustar o cabeçalho');
      assert.equal(await page.locator('#originLine').innerText(), 'Conversa: Conversa <img src=x onerror=alert(1)>');
      assert.equal(await page.locator('#sessionLine').innerText(), 'Projeto: painel · ID: ' + A);
      assert.equal(await page.locator('header img').count(), 0, 'nome da conversa exibido como texto');
      const t = await page.locator('#productName').boundingBox(), o = await page.locator('#originLine').boundingBox(), icons = await page.locator('#current').boundingBox();
      assert.ok(o.y > t.y && Math.abs(o.x - t.x) < 2 && icons.x > t.x);
      const exp = page.getByRole('button', { name: 'Exportar tarefa', exact: true });
      assert.equal(await exp.count(), 1); assert.equal(await exp.isEnabled(), true);
    });

    await check('sem nome registrado: "Conversa sem título", nunca o título da tarefa', async () => {
      await deliver({ ...basePayload, origin: { ...basePayload.origin, conversation: '' }, sessionTitle: '' });
      assert.equal(await page.locator('#originLine').innerText(), 'Conversa: Conversa sem título');
      await deliver(basePayload);
    });

    await check('lista: projeto atual por padrão, com conversa, projeto, data e estado', async () => {
      assert.equal(await items().count(), 3);
      const first = await items().nth(0).innerText();
      assert.match(first, /Ajustar o cabeçalho/); assert.match(first, /Conversa <img/); assert.match(first, /painel/); assert.match(first, /Respondida/); assert.match(first, /\d{2}\/\d{2} \d{2}:\d{2}/);
      assert.match(await items().nth(1).innerText(), /Conversa sem título/);
      assert.equal(await items().nth(0).getAttribute('aria-current'), 'true');
      assert.match(await items().nth(0).innerText(), /Recebendo as próximas ações/);
      assert.equal(await page.locator('#tasks .sep').innerText(), 'Histórico legado');
      assert.equal(await page.locator('#tasks img').count(), 0);
    });

    await check('filtros: todos os projetos, por projeto, por conversa e busca', async () => {
      await page.selectOption('#projectFilter', 'all');
      assert.equal(await items().count(), 4);
      assert.match(await page.locator('#tasks').innerText(), /Transcrição indisponível/);
      await page.selectOption('#projectFilter', 'k-dados');
      assert.equal(await items().count(), 1);
      await page.selectOption('#projectFilter', 'current');
      await page.selectOption('#conversationFilter', 'sess-b');
      assert.equal(await items().count(), 1); assert.match(await items().nth(0).innerText(), /Corrigir testes/);
      await page.selectOption('#conversationFilter', '');
      await page.selectOption('#projectFilter', 'all');
      await page.fill('#taskSearch', 'planilha');
      assert.equal(await items().count(), 1);
      await page.fill('#taskSearch', 'nada-parecido');
      assert.match(await page.locator('#tasks').innerText(), /Nenhuma tarefa encontrada/);
      await page.fill('#taskSearch', '');
      await deliver(basePayload); // filters survive updates
      assert.equal(await page.locator('#projectFilter').inputValue(), 'all');
      assert.equal(await items().count(), 4);
    });

    await check('clicar numa tarefa de outro projeto envia a referência estável', async () => {
      await items().filter({ hasText: 'Planilha de vendas' }).click();
      const m = sent.filter(x => x.command === 'selectTask').at(-1);
      assert.deepEqual(m, { command: 'selectTask', taskId: C, ref: 'sess-c|' + C });
    });

    await check('consulta de outra conversa: aviso, captura mantida e sem renomear', async () => {
      const other = { ...basePayload, tasks: [{ id: C, title: 'Planilha de vendas', legacy: false, active: false, state: 'empty', actions: 0, failures: 0, firstTime: '', lastTime: '' }],
        selectedTaskId: C, activeTaskId: null, selectedRef: 'sess-c|' + C, viewingOther: true,
        origin: { conversation: 'Enriquecimento', project: 'dados', sessionId: 'sess-c', taskId: C, available: false, other: true },
        warnings: ['A transcrição original desta tarefa não foi encontrada. A identificação continua no histórico, mas os detalhes estão indisponíveis.'] };
      await deliver(other);
      assert.equal(await page.locator('#originLine').innerText(), 'Conversa: Enriquecimento');
      assert.equal(await page.locator('#sessionLine').innerText(), 'Projeto: dados · ID: ' + C);
      const banners = await page.locator('#banners').innerText();
      assert.match(banners, /outra conversa/); assert.match(banners, /Ajustar o cabeçalho/); assert.match(banners, /não foi encontrada/);
      assert.match(await page.locator('#empty').innerText(), /Detalhes indisponíveis/);
      assert.equal(await items().filter({ hasText: 'Planilha de vendas' }).getAttribute('aria-current'), 'true');
      await page.locator('#productName').dblclick();
      assert.equal(sent.filter(x => x.command === 'renameTask').length, 0);
      await page.getByRole('button', { name: 'Voltar à tarefa ativa' }).click();
      assert.deepEqual(sent.at(-1), { command: 'selectTask', ref: 'sess-a|' + A, taskId: '' });
      await deliver(basePayload);
    });

    await check('exportar: revisão antes de salvar, ocultação e formato', async () => {
      const before = sent.length;
      await page.getByRole('button', { name: 'Exportar tarefa', exact: true }).click();
      assert.equal(await page.locator('#exportDialog').evaluate(d => d.open), true);
      assert.deepEqual(sent.slice(before), [{ command: 'exportPreview' }]);
      assert.equal(await page.locator('#exportSave').isDisabled(), true, 'não salva antes da revisão');
      await post({ command: 'exportPreview', ref: 'sess-a|' + A, preview: {
        title: 'Ajustar o cabeçalho', taskId: A, conversation: 'Conversa <b>x</b>', project: 'painel', transcriptAvailable: true,
        counts: { prompts: 1, actions: 3, replies: 1, errors: 1, pending: 1, comments: 2, geminiSteps: 0, geminiTask: false, images: 0 },
        automaticReplacements: 2, results: 2, inputs: 3 } });
      const text = await page.locator('#exportDialog').innerText();
      assert.match(text, /Pedidos do usuário — 1 pedido/); assert.match(text, /Resultados e mensagens de erro — 2 resultados · 1 erro/);
      assert.match(text, /nenhuma disponível; a exportação não chama o Gemini/);
      assert.match(text, /não garante remover toda informação confidencial/);
      assert.match(text, /2 valores com aparência de credencial/);
      assert.equal(await page.locator('#exportDialog b').count(), 0);
      assert.equal(await page.locator('input[name="exportInclude"][value="gemini"]').isDisabled(), true);
      await page.locator('input[name="exportInclude"][value="prompts"]').uncheck();
      await page.locator('input[name="exportFormat"][value="json"]').check();
      await page.fill('#exportTerms', 'cliente X\n\n servidor-interno ');
      await page.locator('#exportSave').click();
      const m = sent.at(-1);
      assert.equal(m.command, 'exportSave'); assert.equal(m.ref, 'sess-a|' + A); assert.equal(m.format, 'json');
      assert.deepEqual(m.terms, ['cliente X', 'servidor-interno']);
      assert.equal(m.hide.prompts, true); assert.equal(m.hide.results, false);
      await post({ command: 'exportResult', status: 'cancelled' });
      assert.match(await page.locator('#exportStatus').innerText(), /Nenhum arquivo foi criado/);
      assert.equal(await page.locator('#exportDialog').evaluate(d => d.open), true);
      const dir = path.join(os.tmpdir(), 'painel-execucao-tests'); fs.mkdirSync(dir, { recursive: true });
      await page.screenshot({ path: path.join(dir, 'export-review.png') });
      await post({ command: 'exportResult', status: 'saved', name: 'tarefa.json' });
      assert.equal(await page.locator('#exportDialog').evaluate(d => d.open), false);
    });

    await check('tela estreita sem rolagem horizontal; nenhum recurso externo nem erro de script', async () => {
      await page.setViewportSize({ width: 820, height: 800 });
      await page.waitForTimeout(80);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      const dir = path.join(os.tmpdir(), 'painel-execucao-tests');
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.screenshot({ path: path.join(dir, 'history-header.png') });
      assert.deepEqual(requests, []);
      assert.deepEqual(errors, []);
    });
    console.log(results.join('\n'));
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
