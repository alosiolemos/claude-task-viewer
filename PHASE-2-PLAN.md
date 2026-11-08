# Phase 2: Workflow Visual Horizontal

## Estrutura de Dados

```typescript
// workflow.ts
interface WorkflowRun {
  id: string
  projectName: string
  demandId: string
  executionId: string
  workflow: Workflow
  stages: Stage[]
  captureSource: 'real' | 'demo'
  createdAt: Date
  updatedAt: Date
}

interface Workflow {
  id: string
  name: string
  description?: string
  stageIds: string[]
}

interface Stage {
  id: string
  name: string
  description?: string
  state: 'planned' | 'running' | 'completed' | 'failed' | 'cancelled' | 'no-evidence'
  dependsOn?: string[] // stage IDs
  actions: Action[]
  startedAt?: Date
  endedAt?: Date
  input?: any
  output?: any
  error?: any
}

interface Action {
  toolUseId: string
  toolName: string
  input: any
  output: any
  status: 'success' | 'error' | 'pending'
  timestamp: Date
}
```

## Tarefas

1. **Dados**: Criar workflow.ts com tipos
2. **Canvas**: React Flow component (10+ nós demo)
3. **Demo**: Gerar workflow sintético "Pedido → Validar → Processar"
4. **UI**: Inspetor ao clicar, pan/zoom
5. **Integração**: Atualizar extension para WebviewPanel amplo
6. **Build**: npm run build, novo .vsix
7. **GitHub**: Commit + push
8. **Docs**: Atualizar README

## Demo Workflow (10+ etapas)

1. Pedido (START)
2. Ler entrada
3. Conferir campos
4. Normalizar
5. Aplicar regras
6. Validar
7. [Branch] Investigar divergência
8. Corrigir
9. Revalidar
10. Gerar relatório

Ramificação: Validar → [falha] → Investigar → Corrigir → Revalidar
