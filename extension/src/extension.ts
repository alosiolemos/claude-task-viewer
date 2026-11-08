import * as vscode from 'vscode';
import { EventReader } from './event-reader';

let panel: vscode.WebviewPanel | undefined;
const eventReader = new EventReader();

export function activate(context: vscode.ExtensionContext) {
  // Registrar comando para abrir painel
  const command = vscode.commands.registerCommand('painel-execucao.open', () => {
    openPanel(context);
  });

  context.subscriptions.push(command);

  // Auto-abrir painel ao ativar extensão (opcional)
  // openPanel(context);

  console.log('Painel Execução ativado');
}

async function openPanel(context: vscode.ExtensionContext) {
  if (panel) {
    panel.reveal(vscode.ViewColumn.Beside);
    return;
  }

  panel = vscode.window.createWebviewPanel(
    'painel-execucao-canvas',
    'Painel Execução — Workflow',
    vscode.ViewColumn.Beside,
    {
      enableScripts: true,
      retainContextWhenHidden: true,
      localResourceRoots: [
        vscode.Uri.joinPath(context.extensionUri, 'webview', 'dist'),
      ],
    }
  );

  // Definir ícone
  panel.iconPath = vscode.Uri.joinPath(context.extensionUri, 'resources', 'icon.svg');

  // Carregar HTML
  const htmlPath = vscode.Uri.joinPath(context.extensionUri, 'webview', 'dist', 'index.html');
  try {
    let html = await vscode.workspace.fs.readFile(htmlPath);
    let htmlString = new TextDecoder().decode(html);

    // Substituir caminhos de recursos com webview URI scheme
    const distUri = panel.webview.asWebviewUri(
      vscode.Uri.joinPath(context.extensionUri, 'webview', 'dist')
    );
    htmlString = htmlString.replace(/href="\/assets\//g, `href="${distUri.toString()}/assets/`);
    htmlString = htmlString.replace(/src="\/assets\//g, `src="${distUri.toString()}/assets/`);

    panel.webview.html = htmlString;
  } catch (e) {
    panel.webview.html = `<html><body>
      <p>❌ Erro ao carregar Painel Execução</p>
      <p>Execute: cd webview && npm run build</p>
    </body></html>`;
  }

  // Lidar com mensagens do webview
  panel.webview.onDidReceiveMessage(async (message) => {
    switch (message.command) {
      case 'load-workflow':
        const events = await eventReader.readEvents();
        const executions = convertAllEventsToExecutions(events);
        if (executions.length > 0) {
          panel?.webview.postMessage({
            command: 'workflow-loaded',
            executions,
          });
        }
        break;
    }
  });

  // Auto-refresh
  const refreshInterval = setInterval(async () => {
    if (!panel) {
      clearInterval(refreshInterval);
      return;
    }
    const events = await eventReader.readEvents();
    const executions = convertAllEventsToExecutions(events);
    if (executions.length > 0) {
      panel.webview.postMessage({
        command: 'workflow-updated',
        executions,
      });
    }
  }, 2000);

  // Limpar ao fechar
  panel.onDidDispose(() => {
    panel = undefined;
    clearInterval(refreshInterval);
  });
}

function inferDemandForEvent(event: any): string | null {
  const filePath = event.event?.tool_input?.file_path?.toLowerCase() || '';
  if (filePath.includes('teste-auditoria') || filePath.includes('auditoria')) return 'Auditoria';
  if (filePath.includes('teste') && !filePath.includes('teste-auditoria')) return 'Teste';
  if (filePath.includes('processamento')) return 'Processamento';
  return null;
}

function generateSummary(demandTitle: string, events: any[], state?: string): { title: string; summary: string } {
  const actionCount = events.length;
  const hasErrors = events.some((e: any) => e.event?.error);
  const isRunning = state === 'running';
  const statusSuffix = isRunning ? ' · ⏱️ Executando' : (hasErrors ? ' · ⚠️ Erros' : ' · ✅ Concluída');

  if (demandTitle === 'Auditoria') {
    const ativos = events.filter((e: any) => e.event?.tool_input?.file_path?.includes('ativos')).length;
    const excluidos = events.filter((e: any) => e.event?.tool_input?.file_path?.includes('excluido')).length;
    const title = 'Auditar registros';
    const summary = ativos > 0 || excluidos > 0
      ? `${ativos} ativos, ${excluidos} excluídos${statusSuffix}`
      : `${actionCount} ação(ões)${statusSuffix}`;
    return { title, summary };
  }

  if (demandTitle === 'Teste') {
    return {
      title: 'Teste',
      summary: `${actionCount} ação(ões)${statusSuffix}`
    };
  }

  return {
    title: demandTitle,
    summary: `${actionCount} ação(ões)${statusSuffix}`
  };
}

function groupEventsByDemand(events: any[]): { [demand: string]: any[] } {
  const grouped: { [demand: string]: any[] } = {};

  events.forEach((evt) => {
    const demand = inferDemandForEvent(evt);
    const key = demand || 'Eventos não associados';
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(evt);
  });

  return grouped;
}

function groupEventsIntoStages(demandTitle: string, events: any[]): any[] {
  const stages: any[] = [];
  const stageMap: { [key: string]: any[] } = {};

  events.forEach((evt: any) => {
    const filePath = evt.event?.tool_input?.file_path?.toLowerCase() || '';
    let stageKey: string | null = null;

    if (demandTitle === 'Auditoria') {
      if (filePath.includes('entrada') && evt.event?.tool_name === 'Write') stageKey = '1-criar-entrada';
      else if (filePath.includes('entrada') && evt.event?.tool_name === 'Read') stageKey = '2-processar';
      else if ((filePath.includes('ativos') || filePath.includes('excluido')) && evt.event?.tool_name === 'Write') stageKey = '2-processar';
      else if ((filePath.includes('ativos') || filePath.includes('excluido')) && evt.event?.tool_name === 'Read') stageKey = '3-validar';
      else if (filePath.includes('relatorio') || filePath.includes('report')) stageKey = '4-gerar-relatorio';
    }

    if (!stageKey) return;

    if (!stageMap[stageKey]) stageMap[stageKey] = [];
    stageMap[stageKey].push(evt);
  });

  let stageIdx = 0;
  Object.entries(stageMap)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .forEach(([key, evts]: [string, any]) => {
      const stageId = 'stage-' + stageIdx;
      const lastEvent = (evts as any[])[evts.length - 1];
      const firstEvent = (evts as any[])[0];
      const hasError = (evts as any[]).some((e: any) => e.event?.error);

      let stageName = 'Etapa';
      if (key.includes('criar-entrada')) stageName = 'Criar Entrada';
      else if (key.includes('processar')) stageName = 'Processar Registros';
      else if (key.includes('validar')) stageName = 'Validar Resultado';
      else if (key.includes('gerar-relatorio')) stageName = 'Gerar Relatório';

      stages.push({
        id: stageId,
        name: stageName,
        description: `${(evts as any[]).length} ação(ões)`,
        state: hasError ? 'failed' : 'completed',
        actions: (evts as any[]).map((evt: any) => ({
          toolUseId: evt.event?.tool_use_id,
          toolName: evt.event?.tool_name,
          input: evt.event?.tool_input || {},
          output: evt.event?.tool_response || {},
          status: evt.event?.error ? 'failed' : 'success',
          timestamp: new Date(evt.timestamp),
        })),
        input: firstEvent?.event?.tool_input,
        output: lastEvent?.event?.tool_response,
        error: lastEvent?.event?.error || undefined,
        startedAt: new Date(firstEvent?.timestamp),
        endedAt: new Date(lastEvent?.timestamp),
      });
      stageIdx++;
    });

  return stages;
}

function convertEventsToWorkflow(demandTitle: string, events: any[]): any {
  if (!events || events.length === 0) return null;

  let firstEventTime: number | null = null;
  let lastEventTime: number | null = null;
  events.forEach((evt: any) => {
    if (evt.timestamp) {
      const time = new Date(evt.timestamp).getTime();
      if (!firstEventTime) firstEventTime = time;
      lastEventTime = time;
    }
  });

  const stages = groupEventsIntoStages(demandTitle, events);
  const executionId = 'exec-' + demandTitle.toLowerCase().replace(/\s+/g, '-') + '-' + Math.floor((firstEventTime || Date.now()) / 1000);

  // Se último evento é recente (menos de 10 segundos), considerar como "running"
  const now = Date.now();
  const isRunning = lastEventTime && (now - lastEventTime) < 10000;
  const hasErrors = events.some((e: any) => e.event?.error);
  const state = isRunning ? 'running' : (hasErrors ? 'failed' : 'completed');

  const { title, summary } = generateSummary(demandTitle, events, state);

  return {
    id: 'run-real-' + executionId,
    projectName: 'painel-execucao',
    demandId: 'demand-' + demandTitle.toLowerCase(),
    executionId,
    workflow: {
      id: 'workflow-real',
      name: demandTitle,
      description: `${events.length} evento(s) capturado(s)`,
      stageIds: stages.map((s) => s.id),
    },
    stages,
    captureSource: 'real',
    createdAt: new Date(firstEventTime || Date.now()),
    updatedAt: new Date(),
    title,
    summary,
    state,
    aiSummary: false,
  };
}

function convertAllEventsToExecutions(events: any[]): any[] {
  if (!events || events.length === 0) return [];

  const grouped = groupEventsByDemand(events);
  const executions = [];

  for (const [demand, demandEvents] of Object.entries(grouped)) {
    if (demand === 'Eventos não associados') continue;
    const workflow = convertEventsToWorkflow(demand, demandEvents);
    if (workflow) executions.push(workflow);
  }

  return executions.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

export function deactivate() {}
