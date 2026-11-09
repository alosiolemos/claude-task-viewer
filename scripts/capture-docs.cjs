// Captures the real panel with invented, non-sensitive data. Never reads Claude transcripts.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { load, fx } = require('../tests/helpers.cjs');
const { TranscriptModel } = load('transcript-model');
const store = load('task-store');
const view = load('view');
const root = path.resolve(__dirname, '..');
const T = n => new Date(Date.parse('2026-11-09T14:30:00Z') + n * 1000).toISOString();
const records = [
  fx.prompt('demo-u1', 'Melhorar a mensagem de boas-vindas', T(0)),
  fx.text('demo-c1', 'demo-m1', 'Vou ler a mensagem atual antes de alterar o texto.', 'tool_use', T(2)),
  fx.toolUse('demo-a1', 'demo-m1', 'demo-read', 'Read', {file_path:'projeto/src/boas-vindas.js'}, T(2)),
  fx.toolResult('demo-u2', 'demo-read', 'export const mensagem = "Olá";', false, T(3)),
  fx.text('demo-c2', 'demo-m2', 'Vou tornar a mensagem mais clara, preservando o restante do arquivo.', 'tool_use', T(5)),
  fx.toolUse('demo-a2', 'demo-m2', 'demo-edit', 'Edit', {file_path:'projeto/src/boas-vindas.js',old_string:'Olá',new_string:'Olá! Que bom ter você aqui.'}, T(5)),
  fx.toolResult('demo-u3', 'demo-edit', 'Mensagem atualizada no arquivo.', false, T(6), {structuredPatch:[{lines:['-Olá','+Olá! Que bom ter você aqui.']}]}),
  fx.toolUse('demo-a3', 'demo-m3', 'demo-test', 'Bash', {command:'npm test',description:'Verificar a mensagem atualizada'}, T(8)),
  fx.toolResult('demo-u4', 'demo-test', '3 testes passaram. Nenhuma falha registrada.', false, T(10)),
  fx.text('demo-a4', 'demo-m4', 'Atualizei a mensagem de boas-vindas. A verificação registrada terminou com três testes aprovados.', 'end_turn', T(12)),
];
async function main() {
  const model = new TranscriptModel();
  const state = store.emptyState();
  store.assignNewEvents(state, []);
  model.ingest(records);
  store.assignNewEvents(state, model.events, Date.parse(T(13)));
  const payload = view.buildPayload(model.events,state,model.report(),'Exemplo — mensagem de boas-vindas','sessao-de-exemplo.jsonl',Date.parse(T(13)));
  const details = Object.fromEntries(model.events.map(e=>[e.key,view.buildDetails(e,model.commentFor(e))]));
  const pw = process.env.PAINEL_PLAYWRIGHT_PATH || path.join(os.homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
  const {chromium}=require(pw);
  const browser=await chromium.launch({channel:'msedge',headless:true});
  try {
    const page=await browser.newPage({viewport:{width:1440,height:520},deviceScaleFactor:1});
    const sent=[];
    await page.exposeFunction('__fromPanel',m=>sent.push(m));
    await page.addInitScript(()=>{window.acquireVsCodeApi=()=>({postMessage:m=>window.__fromPanel(m),getState:()=>null,setState:()=>{}});});
    const html=fs.readFileSync(path.join(root,'extension/webview/painel.html'),'utf8').replace('{{CSP}}',"default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-docs';").replace('{{NONCE}}','docs');
    await page.route('http://painel.test/**',r=>r.fulfill({contentType:'text/html',body:html}));
    await page.goto('http://painel.test/');
    await page.evaluate(p=>window.postMessage({command:'payload',version:'0.8.3',payload:{...p,newerSession:''}},'*'),payload);
    await page.locator('.node').last().waitFor();
    await page.getByRole('button',{name:'Ajustar à tela'}).click();
    const out=path.join(root,'docs/images'); fs.mkdirSync(out,{recursive:true});
    await page.screenshot({path:path.join(out,'fluxo-tarefa.png')});
    await page.setViewportSize({width:1440,height:960});
    await page.getByRole('button',{name:'Ajustar à tela'}).click();
    await page.locator('.node',{hasText:'Editou arquivo'}).click();
    await page.waitForFunction(()=>document.querySelector('#dock') && !document.querySelector('#dock').hidden);
    for(let i=0;i<40 && !sent.some(m=>m.command==='details');i++) await page.waitForTimeout(25);
    const requested=sent.filter(m=>m.command==='details').at(-1);
    if(!requested) throw new Error('Pedido de detalhes não recebido');
    await page.evaluate(d=>window.postMessage({command:'details',details:d},'*'),details[requested.key]);
    await page.locator('.comment-fold').waitFor();
    // Resize with the same keyboard control exposed to users.
    await page.locator('.grip').focus();
    for(let i=0;i<11;i++)await page.keyboard.press('ArrowUp');
    await page.locator('details.col-group').filter({hasText:'Ver detalhes da entrada'}).locator('summary').click();
    await page.locator('details.col-group').filter({hasText:'Ver detalhes do resultado'}).locator('summary').click();
    await page.locator('.comment-fold > summary').click();
    await page.getByRole('button',{name:'Ajustar à tela'}).click();
    await page.locator('header').first().click();
    await page.screenshot({path:path.join(out,'detalhes-etapa.png')});
    console.log('Capturas da interface real com dados ilustrativos: '+out);
  } finally {await browser.close();}
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
