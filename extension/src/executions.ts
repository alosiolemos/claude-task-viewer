import { createHash } from 'node:crypto';

type Captured = { timestamp?: string; projectName?: string; executionId?: string; event?: Record<string, any> };
const hash = (value: string) => createHash('sha256').update(value).digest('hex').slice(0, 20);
const norm = (value: unknown) => typeof value === 'string' ? value.replace(/\\/g, '/').replace(/\/+/g, '/') : '';
const base = (value: string) => value.split('/').filter(Boolean).pop() || '';
const time = (value: unknown) => { const n = Date.parse(String(value || '')); return Number.isFinite(n) ? n : 0; };
const failure = (e: Record<string, any>) =>
  e.hook_event_name === 'PostToolUseFailure' || !!e.error ||
  e.tool_response?.isError === true || e.tool_response?.status === 'error' ||
  (typeof e.tool_response?.exitCode === 'number' && e.tool_response.exitCode !== 0);

function legacyTitle(folder: string) {
  const leaf = base(folder);
  if (leaf === 'teste-auditoria') return 'Auditoria — 10 registros';
  if (leaf === 'teste-refresh') return 'Teste refresh';
  return leaf ? leaf.replace(/[-_]/g, ' ') : 'Ações não associadas';
}

function describe(e: Record<string, any>) {
  const file = base(norm(e.tool_input?.file_path || e.tool_input?.path));
  const tool = e.tool_name || 'Ação';
  if (tool === 'Read') return file ? 'Ler ' + file : 'Ler arquivo';
  if (tool === 'Write') return file ? 'Criar ' + file : 'Criar arquivo';
  if (tool === 'Edit') return file ? 'Editar ' + file : 'Editar arquivo';
  if (tool === 'Bash' || tool === 'PowerShell') {
    const command = String(e.tool_input?.command || '').replace(/\s+/g, ' ').trim();
    return 'Executar ' + (command ? command.slice(0, 65) : 'comando');
  }
  return tool === 'Grep' ? 'Buscar texto' : tool === 'Glob' ? 'Localizar arquivos' : tool;
}

/** Pure projection: never writes logs or changes the captured input.
 * Historical records have no demand ID. Group them by session + full folder,
 * label that association as historical and never pretend it is an explicit plan.
 */
export function buildExecutions(records: Captured[]): any[] {
  const groups = new Map<string, { project: string; title: string; explicit: boolean; events: Captured[] }>();
  const active = new Map<string, { id: string; title: string }>();
  const sorted = records.filter(r => r && r.event && typeof r.event === 'object')
    .slice().sort((a, b) => time(a.timestamp) - time(b.timestamp));

  for (const record of sorted) {
    const e = record.event!;
    const project = String(record.projectName || 'Projeto');
    const session = String(e.session_id || 'legado');
    const context = project + '|' + session;

    if (e.hook_event_name === 'UserPromptSubmit') {
      active.set(context, {
        id: String(e.execution_id || 'prompt-' + hash(context + '|' + record.timestamp)),
        title: String(e.execution_title || e.prompt || 'Nova demanda').split('\n')[0].slice(0, 100),
      });
    }

    let explicit = e.execution_id || e.executionId || record.executionId;
    if (!explicit && session !== 'legado') {
      const active_exec = active.get(context)?.id;
      if (active_exec) explicit = active_exec;
    }

    const file = norm(e.tool_input?.file_path || e.tool_input?.path);
    const folder = file.includes('/') ? file.slice(0, file.lastIndexOf('/')) : '';
    const key = explicit ? context + '|execution|' + explicit : context + '|folder|' + folder;

    if (!groups.has(key)) groups.set(key, {
      project,
      title: String(e.execution_title || active.get(context)?.title || legacyTitle(folder)),
      explicit: !!explicit,
      events: [],
    });
    groups.get(key)!.events.push(record);
  }

  const runs: any[] = [];
  for (const [key, group] of groups) {
    const actions = new Map<string, { first: Captured; last: Captured }>();
    for (const record of group.events) {
      const e = record.event!;
      if (!e.tool_name) continue;
      const id = String(e.tool_use_id || 'record-' + hash(JSON.stringify(record)));
      const previous = actions.get(id);
      if (previous) previous.last = record;
      else actions.set(id, {first: record, last: record});
    }
    if (!actions.size) continue;
    const executionId = 'exec-' + hash(key);
    const stages = new Map<string, any>();
    for (const [callId, pair] of actions) {
      const e = pair.last.event!;
      const declaredStage = e.step_id || e.stage_id;
      const stageId = declaredStage ? executionId + '-step-' + hash(String(declaredStage)) : executionId + '-call-' + hash(callId);
      const pending = e.hook_event_name === 'PreToolUse';
      const failed = failure(e);
      const action = {
        toolUseId: callId, toolName: String(e.tool_name),
        input: e.tool_input || {}, output: e.tool_response || (e.error ? {error:e.error} : {}),
        status: failed ? 'error' : pending ? 'pending' : 'success',
        timestamp: new Date(time(pair.last.timestamp)),
      };
      if (!stages.has(stageId)) stages.set(stageId, {
        id:stageId, name:String(e.step_name || e.stage_name || describe(e)),
        description: declaredStage ? 'Etapa declarada pelo agente.' : 'Ação capturada. Vínculo de etapa não informado.',
        state: pending ? 'running' : failed ? 'failed' : 'completed', actions:[],
        startedAt: pair.first.event?.hook_event_name === 'PreToolUse' ? new Date(time(pair.first.timestamp)) : undefined,
      });
      const stage = stages.get(stageId);
      stage.actions.push(action);
      stage.input ??= action.input;
      stage.output = action.output;
      if (failed) {stage.state='failed'; stage.error=String(e.error || e.tool_response?.error || 'A ferramenta informou erro.');}
      else if (pending && stage.state !== 'failed') stage.state='running';
      if (!pending) stage.endedAt=new Date(time(pair.last.timestamp));
    }
    const entries = [...actions.values()];
    const hasError = entries.some(p=>failure(p.last.event!));
    const hasPending = entries.some(p=>p.last.event?.hook_event_name==='PreToolUse');
    const ended = group.events.some(r=>['Stop','execution_end'].includes(r.event?.hook_event_name || r.event?.type));
    const state = hasError ? 'failed' : hasPending ? 'running' : ended ? 'completed' : 'waiting';
    const first = Math.min(...group.events.map(r=>time(r.timestamp)));
    const last = Math.max(...group.events.map(r=>time(r.timestamp)));
    const source = group.events.every(r=>r.event?.session_id && r.event?.hook_event_name) ? 'real' : 'unverified';
    const allStages = [...stages.values()];
    const shown = allStages.slice(-120);
    runs.push({
      id:executionId, executionId, demandId:executionId, projectName:group.project,
      workflow:{id:executionId,name:group.title,description:group.explicit?'Execução identificada pelo agente.':'Histórico agrupado por sessão e pasta; a demanda não foi declarada.',stageIds:shown.map(s=>s.id)},
      title:group.title, summary:actions.size+' ação(ões) capturada(s)'+(allStages.length>120?' · últimas 120 exibidas':''),
      state,captureSource:source,createdAt:new Date(first),updatedAt:new Date(last),stages:shown,
      totalActions:actions.size,association:group.explicit?'explicit':'historical',
    });
  }
  return runs.sort((a,b)=>time(b.updatedAt)-time(a.updatedAt) || a.executionId.localeCompare(b.executionId));
}

