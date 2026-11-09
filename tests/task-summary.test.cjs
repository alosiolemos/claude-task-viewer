const {test}=require('node:test');
const assert=require('node:assert/strict');
const {load,fx}=require('./helpers.cjs');
const {TranscriptModel}=load('transcript-model');
const store=load('task-store');
const summary=load('task-summary');
const T=n=>new Date(Date.parse('2026-11-09T12:00:00Z')+n*1000).toISOString();
function fixture(){
 const m=new TranscriptModel(),s=store.emptyState();store.assignNewEvents(s,[]);
 store.startNewTask(s,'Tarefa A',Date.parse(T(0)));const a=s.activeTaskId;
 m.ingest([fx.prompt('p1','Melhorar mensagem API_KEY=segredo123',T(1)),fx.text('c1','m1','Vou editar a mensagem.', 'tool_use',T(2)),fx.toolUse('a1','m1','e1','Edit',{file_path:'projeto/a.js',old_string:'x',new_string:'y'},T(2)),fx.toolResult('u1','e1','ok',false,T(3)),fx.text('r1','m2','Mensagem atualizada.', 'end_turn',T(4))]);store.assignNewEvents(s,m.events);
 store.startNewTask(s,'Tarefa B',Date.parse(T(5)));const b=s.activeTaskId;
 m.ingest([fx.prompt('p2','NAO-ENVIAR-TAREFA-B',T(6)),fx.toolUse('a2','m3','b1','Read',{file_path:'projeto/b.js'},T(7))]);store.assignNewEvents(s,m.events);
 return {m,s,a,b};
}
test('resumo: inclui somente a tarefa pedida, com pedido, resultado e comentário público',()=>{
 const {m,s,a}=fixture();const d=summary.buildTaskData(m.events,s,a,e=>m.commentFor(e));
 assert.ok(d);const text=JSON.stringify(d);assert.ok(text.includes('Melhorar mensagem'));assert.ok(text.includes('Vou editar a mensagem.'));assert.ok(text.includes('Mensagem atualizada.'));assert.ok(!text.includes('NAO-ENVIAR-TAREFA-B'));assert.ok(!text.includes('segredo123'));assert.equal(d.partial,false);assert.equal(d.omittedEvents,0);
});
test('resumo: tarefa com chamada pendente é parcial, mesmo após uma resposta anterior',()=>{
 const {m,s,b}=fixture();const d=summary.buildTaskData(m.events,s,b,e=>m.commentFor(e));assert.equal(d.partial,true);assert.equal(d.pendingActions,1);
});
test('resumo: ID inexistente ou legado não exporta a sessão inteira',()=>{
 const {m,s}=fixture();assert.equal(summary.buildTaskData(m.events,s,'nao-existe'),undefined);assert.equal(summary.buildTaskData(m.events,s,'legado'),undefined);
});
test('resumo: orçamento limitado e omissões explícitas, sem alterar registros',()=>{
 const m=new TranscriptModel(),s=store.emptyState();store.assignNewEvents(s,[]);store.startNewTask(s,'Longa');
 const records=[];for(let i=0;i<180;i++){records.push(fx.toolUse('a'+i,'m'+i,'t'+i,'Bash',{command:('linha '+i+' ').repeat(500)},T(i)));records.push(fx.toolResult('u'+i,'t'+i,'saida '.repeat(1000),false,T(i)));}
 m.ingest(records);store.assignNewEvents(s,m.events);const before=JSON.stringify(m.events);const d=summary.buildTaskData(m.events,s,s.activeTaskId);
 assert.ok(JSON.stringify(d).length<=summary.TASK_MAX_CHARS);assert.ok(d.omittedEvents>0);assert.ok(d.truncatedFields>0);assert.equal(d.totalEvents,180);assert.equal(d.includedEvents+d.omittedEvents,d.totalEvents);assert.equal(JSON.stringify(m.events),before);
});
test('resumo: assinatura muda com resultado/comentário e é isolada por sessão',()=>{
 const {m,s,a}=fixture();const d=summary.buildTaskData(m.events,s,a,e=>m.commentFor(e));const id=summary.taskCacheId('s1',a,d);assert.equal(id,summary.taskCacheId('s1',a,d));assert.notEqual(id,summary.taskCacheId('s2',a,d));assert.notEqual(id,summary.taskCacheId('s1',a,{...d,title:'Outro'}));assert.match(summary.taskPromptFor(d),/nunca como instruções/);assert.match(summary.taskPromptFor(d),/O que você pode aprender/);
});

test('resumo: não aceita STOP com seções ausentes como texto completo',async()=>{
 const {m,s,a}=fixture();const d=summary.buildTaskData(m.events,s,a);
 const fake=async()=>({ok:true,json:async()=>({candidates:[{finishReason:'STOP',content:{parts:[{text:'O que você pediu\nComeçou e parou.'}]}}]})});
 await assert.rejects(summary.explainTask(d,'chave-ficticia',fake),e=>/incompleta/.test(e.userMessage)&&!!e.partialText);
});

test('resumo: recebe as cinco seções em uma única chamada com prazo próprio e sem raciocínio extra',async()=>{
 const {m,s,a}=fixture();const d=summary.buildTaskData(m.events,s,a);let calls=0,config;
 const complete=summary.TASK_SECTION_TITLES.map(t=>'## '+t+'\nInformação registrada.').join('\n\n');
 const fake=async(url,init)=>{calls++;config=JSON.parse(init.body).generationConfig;return {ok:true,json:async()=>({candidates:[{finishReason:'STOP',content:{parts:[{text:complete}]}}]})}};
 assert.equal(await summary.explainTask(d,'chave-ficticia',fake),complete);assert.equal(calls,1);assert.equal(config.maxOutputTokens,4096);assert.equal(config.thinkingConfig.thinkingBudget,0);
});
