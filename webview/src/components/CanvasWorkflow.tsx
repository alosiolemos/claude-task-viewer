import React, { useCallback, useState } from 'react';
import ReactFlow, {
  Node,
  Edge,
  addEdge,
  Connection,
  useNodesState,
  useEdgesState,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { Stage, StageState } from '../types/workflow';
import './CanvasWorkflow.css';

interface CanvasWorkflowProps {
  stages: Stage[];
  onStageSelect: (stage: Stage) => void;
}

const getStateColor = (state: StageState): string => {
  switch (state) {
    case 'planned': return '#6b7280';
    case 'running': return '#f59e0b';
    case 'completed': return '#10b981';
    case 'failed': return '#ef4444';
    case 'cancelled': return '#8b5cf6';
    case 'no-evidence': return '#9ca3af';
    default: return '#e5e7eb';
  }
};

const stateIcon = (state: StageState): string => {
  switch (state) {
    case 'planned': return '◯';
    case 'running': return '▶';
    case 'completed': return '✓';
    case 'failed': return '✕';
    case 'cancelled': return '⊘';
    case 'no-evidence': return '?';
    default: return '◯';
  }
};

export const CanvasWorkflow: React.FC<CanvasWorkflowProps> = ({ stages, onStageSelect }) => {
  const [nodes, setNodes, onNodesChange] = useNodesState<any>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<any>([]);

  React.useEffect(() => {
    // Gerar nós do workflow
    const newNodes: Node[] = stages.map((stage, index) => ({
      id: stage.id,
      data: {
        label: stage.name,
        state: stage.state,
        icon: stateIcon(stage.state),
        actionCount: stage.actions.length,
      },
      position: { x: index * 220, y: 100 },
      style: {
        background: getStateColor(stage.state),
        color: '#fff',
        padding: '12px',
        borderRadius: '6px',
        border: '2px solid #1f2937',
        fontSize: '12px',
        fontWeight: '600',
        minWidth: '140px',
        textAlign: 'center',
        cursor: 'pointer',
      },
    }));

    // Gerar arestas (dependências)
    const newEdges: Edge[] = [];
    stages.forEach((stage) => {
      if (stage.dependsOn && stage.dependsOn.length > 0) {
        stage.dependsOn.forEach((depId) => {
          newEdges.push({
            id: `${depId}-${stage.id}`,
            source: depId,
            target: stage.id,
            animated: stage.state === 'running',
            style: { stroke: '#6366f1', strokeWidth: 2 },
          });
        });
      } else if (index > 0) {
        // Default: conectar ao anterior se sem dependência explícita
        const prevStage = stages[index - 1];
        newEdges.push({
          id: `${prevStage.id}-${stage.id}`,
          source: prevStage.id,
          target: stage.id,
          style: { stroke: '#6b7280', strokeWidth: 1 },
        });
      }
    });

    setNodes(newNodes);
    setEdges(newEdges);
  }, [stages, setNodes, setEdges]);

  const handleNodeClick = useCallback(
    (event: React.MouseEvent, node: any) => {
      const stage = stages.find((s) => s.id === node.id);
      if (stage) onStageSelect(stage);
    },
    [stages, onStageSelect]
  );

  return (
    <div className="canvas-workflow-container">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={handleNodeClick}
        fitView
      >
        <div className="canvas-controls">
          <span className="canvas-state-legend">
            ◯ Planejado • ▶ Executando • ✓ Concluído • ✕ Falhou • ⊘ Cancelado
          </span>
        </div>
      </ReactFlow>
    </div>
  );
};
