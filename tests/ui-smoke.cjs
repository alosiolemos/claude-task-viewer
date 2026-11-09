const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');

async function main() {
  const playwrightPath = process.env.PAINEL_PLAYWRIGHT_PATH || 'C:/Users/alois/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright';
  const { chromium } = require(playwrightPath);
  const root = path.resolve(__dirname, '../webview/dist');
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1');
    const file = path.resolve(root, '.' + (url.pathname === '/' ? '/index.html' : decodeURIComponent(url.pathname)));
    if (!file.startsWith(root + path.sep) || !fs.existsSync(file)) { res.writeHead(404).end(); return; }
    const ext = path.extname(file);
    res.setHeader('Content-Type', ({'.html':'text/html','.js':'application/javascript','.css':'text/css'})[ext] || 'application/octet-stream');
    fs.createReadStream(file).pipe(res);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    const page = await browser.newPage({ viewport: {width:1360,height:900} });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(() => {
      const run = (id, name) => ({
        id, executionId:id, projectName:'teste-isolado', demandId:id,
        title:name, summary:'1 ação capturada', captureSource:'real', state:'waiting',
        createdAt:'2026-11-08T03:00:00Z',updatedAt:'2026-11-08T03:00:00Z',
        workflow:{id,name,stageIds:[id+'-1']},
        stages:[{id:id+'-1',name:'Ler '+name,state:'completed',
          actions:[{toolUseId:id+'-tool',toolName:'Read',input:{file_path:name+'.json'},
          output:{content:'ok'},status:'success',timestamp:'2026-11-08T03:00:00Z'}]}]
      });
      window.__runs = [run('audit','Auditoria'), run('refresh','Teste refresh')];
      let acquired = false;
      window.acquireVsCodeApi = () => {
        if (acquired) throw new Error('API adquirida duas vezes');
        acquired = true;
        return {
          postMessage(message) {
            if (message.command === 'load-workflow') {
              setTimeout(() => window.postMessage({command:'workflow-loaded',executions:window.__runs,version:'0.3.1'},'*'), 20);
            }
          },
          getState:()=>null, setState:()=>{}
        };
      };
    });
    await page.goto('http://127.0.0.1:' + server.address().port);
    await page.locator('.history-item').filter({hasText:'Teste refresh'}).click();
    await page.waitForFunction(() => document.querySelector('h1')?.textContent.includes('Teste refresh'));
    for (let i=0;i<5;i++) await page.evaluate(() => window.postMessage({command:'workflow-updated',executions:window.__runs,version:'0.3.1'},'*'));
    await page.waitForTimeout(200);
    assert.match(await page.locator('h1').textContent(), /Teste refresh/, 'Atualização não pode trocar seleção do usuário');
    assert.equal(await page.locator('.history-item').count(), 2, 'Snapshot não pode duplicar execuções');
    console.log('PASS: seleção preservada durante atualizações.');
    if (process.argv.includes('--full')) {
      await page.locator('.history-item.active .item-title span').dblclick();
      await page.locator('.history-item.active input').fill('Minha execução');
      await page.locator('.history-item.active input').press('Enter');
      for(let i=0;i<30;i++) await page.evaluate(() => window.postMessage({command:'workflow-updated',executions:window.__runs,version:'0.3.1'},'*'));
      await page.waitForTimeout(100);
      assert.equal(await page.locator('.history-item').count(), 2);
      assert.match(await page.locator('h1').textContent(), /Minha execução/);
      await page.evaluate(() => {
        const run=window.__runs[1];
        run.stages.push({id:'refresh-2',name:'Criar resultado.json',state:'completed',actions:[]});
        run.workflow.stageIds.push('refresh-2');
        window.postMessage({command:'workflow-updated',executions:window.__runs,version:'0.3.1'},'*');
      });
      await page.getByText('Criar resultado.json',{exact:true}).waitFor();
      await page.reload();
      await page.waitForTimeout(300);
      assert.match(await page.locator('h1').textContent(), /Minha execução/, 'Título e seleção sobrevivem à reabertura');
      assert.equal(await page.locator('.history-item').count(),2);
      assert.deepEqual(errors,[]);
      const out=path.resolve(__dirname,'../test-results');
      fs.mkdirSync(out,{recursive:true});
      await page.screenshot({path:path.join(out,'painel-0.3.1.png')});
      console.log('PASS: título, persistência, nova ação e 30 snapshots sem duplicação; sem erros de página.');
    }
  } finally {
    await browser.close();
    await new Promise(resolve=>server.close(resolve));
  }
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});

