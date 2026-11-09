import React, { useEffect, useState } from 'react';
import 'reactflow/dist/style.css';
import './App.css';
import { CanvasWorkflow } from './components/CanvasWorkflow';
import { StageInspector } from './components/StageInspector';
import { generateDemoWorkflow } from './data/demoWorkflow';
import { WorkflowRun } from './types/workflow';

const preferenceKey='painel-execucao-preferences-v1';
function readPreferences() {
  try {
    const value=JSON.parse(localStorage.getItem(preferenceKey)||'{}');
    return {selected:typeof value.selected==='string'?value.selected:null,titles:value.titles && typeof value.titles==='object'?value.titles:{}};
  } catch {return {selected:null,titles:{}};}
}
const preferences=readPreferences();
let api:any;
let attempted=false;
function getApi() {
  if(!attempted){attempted=true;try{api=(window as any).acquireVsCodeApi?.();}catch{api=undefined;}}
  return api;
}
function uniqueRuns(incoming:any[]):WorkflowRun[] {
  const byId=new Map<string,WorkflowRun>();
  for(const run of incoming) {
    if(!run || typeof run.executionId!=='string' || !run.workflow || !Array.isArray(run.stages))continue;
    byId.set(run.executionId,{...run,id:run.executionId});
  }
  return [...byId.values()].slice(0,100);
}
const stateLabels:Record<string,string>={completed:'Concluída',failed:'Falhou',running:'Executando',waiting:'Término não informado'};

export default function App() {
  const [model,setModel]=useState<{runs:WorkflowRun[];selected:string|null}>({runs:[],selected:preferences.selected});
  const [titles,setTitles]=useState<Record<string,string>>(preferences.titles);
  const [selectedStageId,setSelectedStageId]=useState<string|null>(null);
  const [loading,setLoading]=useState(true);
  const [issue,setIssue]=useState('');
  const [version,setVersion]=useState('0.3.1');
  const [historyOpen,setHistoryOpen]=useState(true);
  const [editing,setEditing]=useState<{id:string;value:string}|null>(null);
  const [demo,setDemo]=useState<WorkflowRun|null>(null);
  const current=model.runs.find(run=>run.executionId===model.selected);
  const selectedStage=current?.stages.find(stage=>stage.id===selectedStageId)||null;
  const runTitle=(run:WorkflowRun)=>titles[run.executionId] || run.title || run.workflow.name;

  useEffect(()=>{
    const bridge=getApi();
    let disposed=false; let received=false;
    const receive=(event:MessageEvent)=>{
      const message=event.data;
      if(!message || typeof message!=='object')return;
      if(message.command==='capture-error'){setIssue(message.message||'Falha ao carregar eventos.');setLoading(false);return;}
      if(!['workflow-loaded','workflow-updated'].includes(message.command) || !Array.isArray(message.executions))return;
      received=true; const incoming=uniqueRuns(message.executions);
      if(typeof message.version==='string')setVersion(message.version);
      setIssue(typeof message.issue==='string'?message.issue:'');
      setModel(previous=>{
        const selected=incoming.some(run=>run.executionId===previous.selected)
          ?previous.selected:incoming[0]?.executionId || null;
        return {runs:incoming,selected};
      });
      setLoading(false);
    };
    window.addEventListener('message',receive);
    if(bridge)bridge.postMessage({command:'load-workflow'});
    else {setLoading(false);setIssue('Abra pelo comando “Abrir Painel Execução” no VS Code para receber eventos.');}
    const timeout=setTimeout(()=>{if(!disposed && !received){setLoading(false);setIssue(previous=>previous || 'Se os dados não chegaram, use “Atualizar”. A demonstração só abre quando solicitada.');}},8000);
    return ()=>{disposed=true;clearTimeout(timeout);window.removeEventListener('message',receive);};
  },[]);

  useEffect(()=>{
    try {localStorage.setItem(preferenceKey,JSON.stringify({selected:model.selected,titles:Object.fromEntries(Object.entries(titles).slice(-500))}));}
    catch { /* Event data remains in the original JSONL files. */ }
  },[model.selected,titles]);
  // Old snapshots were an unbounded duplicate cache, not the source of truth.
  // Leave that legacy key untouched; never copy its event payloads into new state.

  const choose=(run:WorkflowRun)=>{setModel(previous=>({...previous,selected:run.executionId}));setSelectedStageId(null);};
  const rename=()=>{
    if(editing){const title=editing.value.trim().slice(0,120);if(title)setTitles(previous=>({...previous,[editing.id]:title}));setEditing(null);}
  };
  const showDemo=()=>{
    const sample=generateDemoWorkflow();
    const run={...sample,id:'demo-explicit',executionId:'demo-explicit'};
    setDemo(run);
    setModel(previous=>({runs:[run,...previous.runs.filter(r=>r.captureSource!=='demo')],selected:run.executionId}));
    setSelectedStageId(null);
  };

  return <div className="App">
    <header className="App-header"><div className="header-content">
      <button className="history-toggle" onClick={()=>setHistoryOpen(value=>!value)}>{historyOpen?'◀':'▶'} Histórico</button>
      <div><h1>{current?runTitle(current):'Painel Execução'}</h1>
        <p>v{version} · {current?.projectName || 'Eventos locais'}{current?' · '+stateLabels[current.state || 'waiting']:''}</p>
      </div>
      <div className="header-meta">
        {current && <><span className={'badge '+current.captureSource}>{current.captureSource==='demo'?'DEMONSTRAÇÃO':current.captureSource==='real'?'CAPTURA':'ORIGEM NÃO VERIFICADA'}</span><span className="meta-text">{current.stages.length} etapas · {current.stages.reduce((sum,s)=>sum+s.actions.length,0)} ações</span></>}
        <button className="history-toggle" onClick={()=>getApi()?.postMessage({command:'load-workflow'})}>Atualizar</button>
      </div>
    </div></header>
    {issue && <div role="status" className="capture-notice">{issue}</div>}
    <main className="App-main">
      {historyOpen && <aside className="history-sidebar"><h3>Histórico</h3><div className="history-list">
        {model.runs.map(run=><div key={run.executionId} role="button" tabIndex={0}
          className={'history-item '+(run.executionId===model.selected?'active':'')}
          onClick={()=>choose(run)} onKeyDown={event=>{if(event.key==='Enter')choose(run);}}>
          <div className="item-header"><div className="item-title">
            {editing?.id===run.executionId?<input aria-label="Título da execução" autoFocus value={editing.value}
              onClick={event=>event.stopPropagation()}
              onChange={event=>setEditing({id:run.executionId,value:event.target.value})}
              onBlur={rename} onKeyDown={event=>{event.stopPropagation();if(event.key==='Enter')rename();if(event.key==='Escape')setEditing(null);}}/>
              :<span title="Duplo clique para renomear" onDoubleClick={event=>{event.stopPropagation();setEditing({id:run.executionId,value:runTitle(run)});}}>{runTitle(run)}</span>}
          </div><span className={'item-state state-'+run.state}>{run.state==='failed'?'!':run.state==='completed'?'✓':run.state==='running'?'▶':'○'}</span></div>
          <div className="item-summary">{run.summary || run.stages.length+' etapas'}</div>
          <div className="item-time">{new Date(run.updatedAt || run.createdAt).toLocaleString('pt-BR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'})}</div>
        </div>)}
      </div></aside>}
      {current?<><div className="canvas-wrapper"><CanvasWorkflow key={current.executionId} executionId={current.executionId} stages={current.stages} onStageSelect={stage=>setSelectedStageId(stage.id)}/></div>
        {selectedStage && <StageInspector stage={selectedStage} onClose={()=>setSelectedStageId(null)}/>}</>
        :<div className="empty-workspace"><h2>{loading?'Carregando eventos…':'Nenhuma ação capturada ainda'}</h2><p>Novas ações aparecem automaticamente. Seus registros existentes não serão apagados.</p>
          <button onClick={showDemo}>Ver demonstração</button></div>}
    </main>
  </div>;
}
