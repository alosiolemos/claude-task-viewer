import { WorkflowRun, Stage, ToolAction } from '../types/workflow';

/**
 * Demo Workflow — 10+ etapas com ramificação e retry
 * Simula processamento de pedido com validação e correção
 */

export const generateDemoWorkflow = (): WorkflowRun => {
  const now = new Date();

  const stages: Stage[] = [
    {
      id: 'stage-01-pedido',
      name: 'Pedido Recebido',
      description: 'Início do processamento',
      state: 'completed',
      actions: [
        {
          toolUseId: 'tool-order-start',
          toolName: 'Read',
          input: { file_path: 'pedidos/001-samsung.json' },
          output: { status: 'success', recordCount: 100 },
          status: 'success',
          timestamp: new Date(now.getTime() - 300000),
        },
      ],
      startedAt: new Date(now.getTime() - 300000),
      endedAt: new Date(now.getTime() - 290000),
      output: { orderId: 'ORD-001', items: 100 },
    },

    {
      id: 'stage-02-ler-entrada',
      name: 'Ler Entrada',
      description: 'Carregar dados do arquivo',
      state: 'completed',
      dependsOn: ['stage-01-pedido'],
      actions: [
        {
          toolUseId: 'tool-read-input',
          toolName: 'Read',
          input: { file_path: '/data/orders/001.csv' },
          output: { rows: 100, columns: ['id', 'item', 'qty', 'price'] },
          status: 'success',
          timestamp: new Date(now.getTime() - 285000),
        },
      ],
      startedAt: new Date(now.getTime() - 285000),
      endedAt: new Date(now.getTime() - 275000),
      output: { totalItems: 100 },
    },

    {
      id: 'stage-03-conferir-campos',
      name: 'Conferir Campos',
      description: 'Validar estrutura de dados',
      state: 'completed',
      dependsOn: ['stage-02-ler-entrada'],
      actions: [
        {
          toolUseId: 'tool-check-fields',
          toolName: 'Bash',
          input: { command: 'grep -c "^" /data/orders/001.csv' },
          output: { linesCount: 101 },
          status: 'success',
          timestamp: new Date(now.getTime() - 272000),
        },
      ],
      startedAt: new Date(now.getTime() - 272000),
      endedAt: new Date(now.getTime() - 265000),
      output: { validLines: 101 },
    },

    {
      id: 'stage-04-normalizar',
      name: 'Normalizar',
      description: 'Padronizar formato de dados',
      state: 'completed',
      dependsOn: ['stage-03-conferir-campos'],
      actions: [
        {
          toolUseId: 'tool-normalize',
          toolName: 'Edit',
          input: { filePath: '/data/orders/001.csv', operation: 'trim_whitespace' },
          output: { linesModified: 95 },
          status: 'success',
          timestamp: new Date(now.getTime() - 260000),
        },
      ],
      startedAt: new Date(now.getTime() - 260000),
      endedAt: new Date(now.getTime() - 250000),
      output: { normalizedRecords: 95 },
    },

    {
      id: 'stage-05-aplicar-regras',
      name: 'Aplicar Regras',
      description: 'Processar regras de negócio',
      state: 'completed',
      dependsOn: ['stage-04-normalizar'],
      actions: [
        {
          toolUseId: 'tool-apply-rules',
          toolName: 'Bash',
          input: { command: 'python /scripts/apply_rules.py /data/orders/001.csv' },
          output: { processedRecords: 95, discardedRecords: 5 },
          status: 'success',
          timestamp: new Date(now.getTime() - 245000),
        },
      ],
      startedAt: new Date(now.getTime() - 245000),
      endedAt: new Date(now.getTime() - 235000),
      output: { appliedRules: 3, affectedRecords: 32 },
    },

    {
      id: 'stage-06-validar',
      name: 'Validar',
      description: 'Executar validações críticas',
      state: 'failed',
      dependsOn: ['stage-05-aplicar-regras'],
      actions: [
        {
          toolUseId: 'tool-validate-v1',
          toolName: 'Bash',
          input: { command: 'python /scripts/validate.py /data/orders/001.csv' },
          output: { validRecords: 82, invalidRecords: 13, errors: ['missing_qty: 5', 'invalid_price: 8'] },
          status: 'error',
          timestamp: new Date(now.getTime() - 230000),
        },
      ],
      startedAt: new Date(now.getTime() - 230000),
      endedAt: new Date(now.getTime() - 220000),
      error: 'Validação falhou: 13 registros inválidos encontrados',
      output: { validRecords: 82, invalidRecords: 13 },
    },

    {
      id: 'stage-07-investigar-divergencia',
      name: 'Investigar Divergência',
      description: 'Analisar causa da falha',
      state: 'completed',
      dependsOn: ['stage-06-validar'],
      actions: [
        {
          toolUseId: 'tool-investigate',
          toolName: 'Grep',
          input: { pattern: 'invalid_price|missing_qty', glob: '/data/orders/*.log' },
          output: { matchedLines: 13, files: ['001.log'] },
          status: 'success',
          timestamp: new Date(now.getTime() - 215000),
        },
      ],
      startedAt: new Date(now.getTime() - 215000),
      endedAt: new Date(now.getTime() - 205000),
      output: { rootCause: 'Decimal format inconsistency in price field' },
    },

    {
      id: 'stage-08-corrigir',
      name: 'Corrigir',
      description: 'Aplicar correções aos registros',
      state: 'completed',
      dependsOn: ['stage-07-investigar-divergencia'],
      actions: [
        {
          toolUseId: 'tool-fix',
          toolName: 'Edit',
          input: { filePath: '/data/orders/001.csv', operation: 'replace_decimal_format' },
          output: { fixedRecords: 13, remainingErrors: 0 },
          status: 'success',
          timestamp: new Date(now.getTime() - 200000),
        },
      ],
      startedAt: new Date(now.getTime() - 200000),
      endedAt: new Date(now.getTime() - 190000),
      output: { fixedRecords: 13, newTotal: 95 },
    },

    {
      id: 'stage-09-revalidar',
      name: 'Revalidar',
      description: 'Validar novamente após correções',
      state: 'completed',
      dependsOn: ['stage-08-corrigir'],
      actions: [
        {
          toolUseId: 'tool-validate-v2',
          toolName: 'Bash',
          input: { command: 'python /scripts/validate.py /data/orders/001.csv' },
          output: { validRecords: 95, invalidRecords: 0 },
          status: 'success',
          timestamp: new Date(now.getTime() - 185000),
        },
      ],
      startedAt: new Date(now.getTime() - 185000),
      endedAt: new Date(now.getTime() - 175000),
      output: { allValid: true, totalRecords: 95 },
    },

    {
      id: 'stage-10-comparar-tentativas',
      name: 'Comparar Tentativas',
      description: 'Difícil entre primeira e segunda validação',
      state: 'completed',
      dependsOn: ['stage-09-revalidar', 'stage-06-validar'],
      actions: [
        {
          toolUseId: 'tool-compare',
          toolName: 'Bash',
          input: { command: 'diff /data/orders/001.v1.csv /data/orders/001.v2.csv' },
          output: { changedRecords: 13, addedRecords: 0, removedRecords: 0 },
          status: 'success',
          timestamp: new Date(now.getTime() - 170000),
        },
      ],
      startedAt: new Date(now.getTime() - 170000),
      endedAt: new Date(now.getTime() - 160000),
      output: { divergences: 13, resolved: 13 },
    },

    {
      id: 'stage-11-gerar-relatorio',
      name: 'Gerar Relatório',
      description: 'Produzir saída final',
      state: 'completed',
      dependsOn: ['stage-10-comparar-tentativas'],
      actions: [
        {
          toolUseId: 'tool-report',
          toolName: 'Write',
          input: { filePath: '/output/report-001.html', content: 'HTML report' },
          output: { bytesWritten: 5234, timestamp: new Date(now.getTime() - 150000).toISOString() },
          status: 'success',
          timestamp: new Date(now.getTime() - 150000),
        },
      ],
      startedAt: new Date(now.getTime() - 150000),
      endedAt: new Date(now.getTime() - 140000),
      output: { reportPath: '/output/report-001.html', recordsProcessed: 95 },
    },
  ];

  return {
    id: 'run-demo-001',
    projectName: 'painel-execucao',
    demandId: 'demand-pedido-001',
    executionId: 'exec-2026110723491000',
    workflow: {
      id: 'workflow-pedido-process',
      name: 'Processamento de Pedido',
      description: 'Workflow de entrada de pedido com validação e correção',
      stageIds: stages.map((s) => s.id),
    },
    stages,
    captureSource: 'demo',
    createdAt: new Date(now.getTime() - 300000),
    updatedAt: now,
  };
};
