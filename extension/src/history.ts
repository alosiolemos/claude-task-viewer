import * as path from 'node:path';
import { LEGACY_ID, TaskState } from './task-store';
import type { TaskSummary } from './view';

/**
 * Cross-session history. Task associations stay in the existing per-transcript TaskState; this module only
 * keeps a small identification record per transcript (conversation, project and per-task summary) so the
 * list can be shown without reading every transcript again. Transcript contents are never copied here.
 */
export const META_VERSION = 1;
export const LEGACY_TITLE = 'Registros anteriores ao painel';
const RUNNING_MS = 5 * 60 * 1000;

export type HistoryState = TaskSummary['state'] | 'unknown';

export interface TaskMeta {
  title: string;
  firstTime: string;
  lastTime: string;
  state: HistoryState;
  actions: number;
  failures: number;
}

export interface SessionMeta {
  v: 1;
  file: string;
  sessionId: string;
  conversation: string;
  projectName: string;
  projectKey: string;
  tasks: Record<string, TaskMeta>;
}

export interface HistoryEntry {
  ref: string;
  file: string;
  sessionId: string;
  taskId: string;
  title: string;
  conversation: string;
  project: string;
  projectKey: string;
  time: string;
  state: HistoryState;
  actions: number;
  failures: number;
  legacy: boolean;
  available: boolean;
}

/** Claude Code names each transcript after its session id; the pair (session, task) is the stable identity. */
export const sessionIdOf = (file: string) => path.basename(file).replace(/\.jsonl$/i, '');
export const refOf = (sessionId: string, taskId: string) => sessionId + '|' + taskId;
export const projectKeyOf = (file: string) => path.dirname(file).toLowerCase();

export function projectNameOf(cwd: string, fallback: string): string {
  const name = cwd ? cwd.split(/[\\/]/).filter(Boolean).pop() : '';
  return name || fallback;
}

export function normalizeMeta(value: unknown): SessionMeta | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const v = value as Record<string, any>;
  if (v.v !== META_VERSION || typeof v.file !== 'string' || typeof v.sessionId !== 'string') return undefined;
  const s = (x: unknown) => (typeof x === 'string' ? x : '');
  const n = (x: unknown) => (typeof x === 'number' && Number.isFinite(x) ? x : 0);
  const tasks: Record<string, TaskMeta> = {};
  if (v.tasks && typeof v.tasks === 'object') {
    for (const [id, t] of Object.entries<any>(v.tasks)) {
      if (!t || typeof t !== 'object') continue;
      tasks[id] = { title: s(t.title), firstTime: s(t.firstTime), lastTime: s(t.lastTime), state: s(t.state) as HistoryState || 'unknown', actions: n(t.actions), failures: n(t.failures) };
    }
  }
  return { v: 1, file: v.file, sessionId: v.sessionId, conversation: s(v.conversation), projectName: s(v.projectName), projectKey: s(v.projectKey), tasks };
}

/** Meta refreshed from a live payload. Tasks no longer listed keep their last known summary. */
export function metaFromSummaries(previous: SessionMeta | undefined, file: string, conversation: string, projectName: string, summaries: TaskSummary[]): SessionMeta {
  const tasks: Record<string, TaskMeta> = { ...(previous?.tasks || {}) };
  for (const t of summaries) {
    tasks[t.id] = { title: t.title, firstTime: t.firstTime, lastTime: t.lastTime, state: t.state, actions: t.actions, failures: t.failures };
  }
  return {
    v: 1, file, sessionId: sessionIdOf(file),
    conversation: conversation || previous?.conversation || '',
    projectName: projectName || previous?.projectName || '',
    projectKey: projectKeyOf(file), tasks,
  };
}

export interface TrackedSession {
  file: string;
  state: TaskState;
  meta?: SessionMeta;
  available: boolean;
}

/** One entry per (session, task). Duplicated transcript paths collapse to the most recent record. */
export function buildHistory(sessions: TrackedSession[], now = Date.now()): HistoryEntry[] {
  const byRef = new Map<string, HistoryEntry>();
  for (const s of sessions) {
    const file = s.meta?.file || s.file;
    const sessionId = s.meta?.sessionId || sessionIdOf(file);
    const projectKey = s.meta?.projectKey || projectKeyOf(file);
    const project = s.meta?.projectName || path.basename(path.dirname(file));
    const conversation = s.meta?.conversation || '';
    const add = (taskId: string, title: string, created: string, legacy: boolean) => {
      const m = s.meta?.tasks[taskId];
      let state: HistoryState = m ? m.state : legacy ? 'legacy' : 'unknown';
      const time = m?.lastTime || m?.firstTime || created || '';
      if (state === 'running' && !(now - Date.parse(time) < RUNNING_MS)) state = 'no-reply';
      if (!s.available) state = 'unknown';
      const entry: HistoryEntry = {
        ref: refOf(sessionId, taskId), file, sessionId, taskId, title: title || m?.title || 'Tarefa sem título',
        conversation, project, projectKey, time, state, actions: m?.actions || 0, failures: m?.failures || 0,
        legacy, available: s.available,
      };
      const prev = byRef.get(entry.ref);
      if (!prev || (Date.parse(entry.time) || 0) > (Date.parse(prev.time) || 0)) byRef.set(entry.ref, entry);
    };
    for (const t of s.state.tasks) add(t.id, t.title, t.createdAt, false);
    if (s.state.legacyEndKey !== null || s.meta?.tasks[LEGACY_ID]) add(LEGACY_ID, LEGACY_TITLE, '', true);
  }
  // Newest first; pre-panel records stay together at the end, as in the original list.
  return [...byRef.values()].sort((a, b) => Number(a.legacy) - Number(b.legacy) || (Date.parse(b.time) || 0) - (Date.parse(a.time) || 0));
}
