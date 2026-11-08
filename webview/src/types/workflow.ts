/**
 * Workflow Types — Estrutura de dados para execução visual
 */

export type StageState = 'planned' | 'running' | 'completed' | 'failed' | 'cancelled' | 'no-evidence';
export type CaptureSource = 'real' | 'demo';
export type ActionStatus = 'success' | 'error' | 'pending';
export type ExecutionState = 'waiting' | 'running' | 'completed' | 'failed';

export interface ToolAction {
  toolUseId: string;
  toolName: string;
  input: Record<string, any>;
  output: Record<string, any>;
  status: ActionStatus;
  timestamp: Date;
}

export interface Stage {
  id: string;
  name: string;
  description?: string;
  state: StageState;
  dependsOn?: string[]; // Stage IDs
  actions: ToolAction[];
  startedAt?: Date;
  endedAt?: Date;
  input?: Record<string, any>;
  output?: Record<string, any>;
  error?: string;
}

export interface Workflow {
  id: string;
  name: string;
  description?: string;
  stageIds: string[];
}

export interface WorkflowRun {
  id: string;
  projectName: string;
  demandId: string;
  executionId: string;
  workflow: Workflow;
  stages: Stage[];
  captureSource: CaptureSource;
  createdAt: Date;
  updatedAt: Date;
  // Histórico e UI
  title?: string; // Título editável, ex: "Auditar 10 registros"
  summary?: string; // Resumo factual, ex: "8 ativos, 2 excluídos"
  state?: ExecutionState; // Estado da execução
  aiSummary?: boolean; // Resumo foi gerado por IA
}

export interface CanvasNode {
  id: string;
  stageId: string;
  data: {
    label: string;
    state: StageState;
    actionCount: number;
  };
  position: { x: number; y: number };
}

export interface CanvasEdge {
  id: string;
  source: string;
  target: string;
  type?: string;
}
