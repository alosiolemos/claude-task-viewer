const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const esbuild = require('esbuild');
const path = require('node:path');
const modern=path.join(__dirname,'../extension/src/executions.ts');
let source=fs.existsSync(modern)?fs.readFileSync(modern,'utf8'):fs.readFileSync(path.join(__dirname,'../extension/src/extension.ts'),'utf8')+'\nexport {convertAllEventsToExecutions as buildExecutions};';
const code=esbuild.transformSync(source,{loader:'ts',format:'cjs',platform:'node'}).code;
const mod={exports:{}};
vm.runInNewContext(code,{module:mod,exports:mod.exports,require:n=>n==='vscode'?{}:n==='./event-reader'?{EventReader:class{}}:require(n),Date,console,setInterval,clearInterval});
const build=mod.exports.buildExecutions;
const event=(id,tool,file,extra={})=>({timestamp:'2026-11-08T03:00:00Z',projectName:'painel-execucao',event:{hook_event_name:'PostToolUse',session_id:'session-1',tool_use_id:id,tool_name:tool,tool_input:file?{file_path:file}:{command:'echo ok'},tool_response:{content:'ok'},...extra}});
const count=runs=>runs.reduce((n,r)=>n+r.stages.reduce((m,s)=>m+s.actions.length,0),0);
test('Teste refresh aparece com Write e Read sem depender de auditoria',()=>{
 const runs=build([event('w','Write','C:/Projetos/teste-refresh/resultado.json'),event('r','Read','C:/Projetos/teste-refresh/resultado.json')]);
 assert.equal(count(runs),2);
 assert.ok(runs.some(r=>/teste.refresh/i.test(r.title)));
});
test('ações Bash sem arquivo continuam visíveis',()=>{
 assert.equal(count(build([event('bash','Bash',null)])),1);
});
test('IDs explícitos separam demandas com arquivos iguais',()=>{
 const runs=build([event('a','Write','/auditoria/entrada.json',{execution_id:'pedido-A'}),event('b','Write','/auditoria/entrada.json',{execution_id:'pedido-B'})]);
 assert.equal(runs.length,2);
 assert.notEqual(runs[0].executionId,runs[1].executionId);
});
test('repetir snapshot não duplica eventos nem muda IDs',()=>{
 const input=[event('w','Write','/teste-refresh/resultado.json'),event('w','Write','/teste-refresh/resultado.json')];
 const history=new Map();
 for(let i=0;i<30;i++) for(const run of build(input))history.set(run.executionId,run);
 assert.equal(history.size,1);
 assert.equal(count([...history.values()]),1);
});
test('início e fim da mesma ferramenta atualizam uma ação',()=>{
 const start=event('tool-1','Read','/teste-refresh/resultado.json',{hook_event_name:'PreToolUse',tool_response:undefined});
 const end=event('tool-1','Read','/teste-refresh/resultado.json');
 assert.equal(count(build([start,end])),1);
});
test('sem término da demanda não anuncia conclusão',()=>{
 const runs=build([event('read','Read','/teste-refresh/resultado.json')]);
 assert.notEqual(runs[0].state,'completed');
});
test('registros não são alterados ao gerar resumos',()=>{
 const input=[event('w','Write','/teste-auditoria/RELATORIO.md')];
 const before=JSON.stringify(input);
 build(input);
 assert.equal(JSON.stringify(input),before);
});
test('sem eventos retorna lista vazia',()=>assert.equal(build([]).length,0));

