import React, { useCallback, useEffect, useRef } from 'react';
import ReactFlow, { Node, Edge, Position, Controls, useNodesState, useEdgesState, applyNodeChanges } from 'reactflow';
import 'reactflow/dist/style.css';
import { Stage } from '../types/workflow';
import './CanvasWorkflow.css';

interface Props { stages:Stage[]; executionId:string; onStageSelect:(stage:Stage)=>void; }
const colors:Record<string,string>={planned:'#6b7280',running:'#b7791f',completed:'#108b68',failed:'#c74444',cancelled:'#775da6','no-evidence':'#64748b'};
export function CanvasWorkflow({stages,executionId,onStageSelect}:Props) {
  const [nodes,setNodes]=useNodesState([]);
  const [edges,setEdges,onEdgesChange]=useEdgesState([]);
  const key='canvas-positions:'+executionId;
  const saved=useRef<Record<string,{x:number;y:number}>>({});
  useEffect(()=>{
    try{saved.current=JSON.parse(localStorage.getItem(key)||'{}');}catch{saved.current={};}
  },[key]);
  useEffect(()=>{
    setNodes(previous=>{
      const current=new Map(previous.map(node=>[node.id,node]));
      return stages.map((stage,index)=>({
        id:stage.id,data:{label:stage.name},sourcePosition:Position.Right,targetPosition:Position.Left,
        position:current.get(stage.id)?.position || saved.current[stage.id] || {x:index*260,y:80},
        selected:current.get(stage.id)?.selected || false,
        style:{background:colors[stage.state]||'#64748b',color:'#fff',padding:12,borderRadius:6,border:'2px solid #1f2937',fontSize:11,minWidth:200,maxWidth:280,whiteSpace:'pre-wrap',wordWrap:'break-word'},
      }));
    });
    const known=new Set(stages.map(stage=>stage.id));
    const next:Edge[]=[];
    // Declared dependencies (solid lines)
    for(const stage of stages)for(const dep of stage.dependsOn||[]){
      if(known.has(dep))next.push({id:dep+'->'+stage.id,source:dep,target:stage.id,animated:stage.state==='running',style:{stroke:'#666',strokeDasharray:'0'},type:'smoothstep'});
    }
    // Observed sequence (dashed lines)
    for(let i=0;i<stages.length-1;i++){
      const from=stages[i], to=stages[i+1];
      if(!next.find(e=>e.source===from.id && e.target===to.id))
        next.push({id:from.id+'→'+to.id,source:from.id,target:to.id,animated:to.state==='running' || from.state==='running',style:{stroke:'#888',strokeDasharray:'5,5'},type:'smoothstep',label:'sequência'});
    }
    setEdges(next);
  },[stages,setNodes,setEdges]);
  const change=useCallback((changes:any)=>{
    setNodes(previous=>{
      const next=applyNodeChanges(changes,previous);
      saved.current=Object.fromEntries(next.map(node=>[node.id,node.position]));
      return next;
    });
  },[setNodes]);
  const save=()=>{
    try{localStorage.setItem(key,JSON.stringify(saved.current));}catch{}
  };
  return <div className="canvas-workflow-container"><ReactFlow
    nodes={nodes} edges={edges} onNodesChange={change} onEdgesChange={onEdgesChange}
    onNodeDragStop={save} fitView minZoom={0.15} maxZoom={2}
    onNodeClick={(_,node)=>{const stage=stages.find(s=>s.id===node.id);if(stage)onStageSelect(stage);}}>
    <Controls showInteractive={false}/>
    <div className="canvas-controls"><span className="canvas-state-legend">✓ Ação concluída · ▶ Executando · ! Falhou · Conexões somente quando declaradas</span></div>
  </ReactFlow></div>;
}
