import { randomUUID } from 'node:crypto';
import type { TranscriptEvent } from './transcript-model';

export const LEGACY_ID = 'legado';

export interface TaskInfo {
  id: string;
  title: string;
  titleSource: 'user' | 'prompt' | 'default';
  createdAt: string;
}

/** Events from startKey onward (in transcript order) belong to taskId until the next segment. */
export interface Segment {
  startKey: string;
  taskId: string;
}

export interface TaskState {
  version: 1;
  initialized: boolean;
  legacyEndKey: string | null;
  lastAssignedKey: string | null;
  segments: Segment[];
  tasks: TaskInfo[];
  activeTaskId: string | null;
  selectedTaskId: string | null;
  selectionPinned: boolean;
}

export function emptyState(): TaskState {
  return {
    version: 1, initialized: false, legacyEndKey: null, lastAssignedKey: null, segments: [], tasks: [],
    activeTaskId: null, selectedTaskId: null, selectionPinned: false,
  };
}

export function normalizeState(value: unknown): TaskState {
  const state = emptyState();
  if (!value || typeof value !== 'object') return state;
  const v = value as Record<string, any>;
  if (v.version !== 1) return state;
  const str = (x: unknown) => (typeof x === 'string' ? x : null);
  state.initialized = v.initialized === true;
  state.legacyEndKey = str(v.legacyEndKey);
  state.lastAssignedKey = str(v.lastAssignedKey);
  state.segments = Array.isArray(v.segments) ? v.segments.filter((s: any) => s && typeof s.startKey === 'string' && typeof s.taskId === 'string') : [];
  state.tasks = Array.isArray(v.tasks) ? v.tasks.filter((t: any) => t && typeof t.id === 'string' && typeof t.title === 'string') : [];
  const ids = new Set(state.tasks.map(t => t.id));
  state.activeTaskId = ids.has(v.activeTaskId) ? v.activeTaskId : null;
  state.selectedTaskId = ids.has(v.selectedTaskId) || v.selectedTaskId === LEGACY_ID ? v.selectedTaskId : null;
  state.selectionPinned = v.selectionPinned === true;
  return state;
}

export function shortTitle(text: string): string {
  const cleaned = text
    .replace(/<([a-zA-Z_-]+)[^>]*>[\s\S]*?<\/\1>/g, ' ')
    .split('\n').map(l => l.trim()).find(l => l.length > 0) || '';
  const single = cleaned.replace(/\s+/g, ' ');
  return single.length > 80 ? single.slice(0, 77).trimEnd() + '…' : single;
}

function newId(): string {
  return randomUUID();
}

function hasEvents(state: TaskState, taskId: string): boolean {
  return state.segments.some(s => s.taskId === taskId);
}

/** Earliest human prompt after the last observed final reply, if that round is open. */
function openPromptIndex(events: TranscriptEvent[], through = events.length - 1): number {
  let start = 0;
  for (let i = 0; i <= through; i++) if (events[i].kind === 'reply') start = i + 1;
  for (let i = start; i <= through; i++) if (events[i].kind === 'prompt') return i;
  return -1;
}

/** Repair only the old bootstrap split: an unnamed first task immediately after an open legacy prompt. */
function repairBootstrapSplit(state: TaskState, events: TranscriptEvent[]): boolean {
  if (!state.legacyEndKey || state.tasks.length !== 1 || !state.segments.length) return false;
  const task = state.tasks[0];
  if (task.titleSource !== 'default' || task.title !== 'Tarefa sem título') return false;
  const boundary = events.findIndex(e => e.key === state.legacyEndKey);
  if (boundary < 0 || state.segments[0].taskId !== task.id || state.segments[0].startKey !== events[boundary + 1]?.key) return false;
  const prompt = openPromptIndex(events, boundary);
  if (prompt < 0) return false;
  state.legacyEndKey = prompt > 0 ? events[prompt - 1].key : null;
  state.segments[0].startKey = events[prompt].key;
  task.title = shortTitle(events[prompt].text || '') || task.title;
  task.titleSource = 'prompt';
  if (state.selectedTaskId === LEGACY_ID && state.legacyEndKey === null) {
    state.selectedTaskId = task.id;
    state.selectionPinned = task.id !== state.activeTaskId;
  }
  return true;
}

/** Completed pre-existing rounds stay legacy; a round already in progress starts in the active task. */
export function assignNewEvents(state: TaskState, events: TranscriptEvent[], now = Date.now()): boolean {
  const lastKey = events.length ? events[events.length - 1].key : null;
  if (!state.initialized) {
    state.initialized = true;
    const prompt = openPromptIndex(events);
    const boundary = prompt >= 0 ? (prompt > 0 ? events[prompt - 1].key : null) : lastKey;
    state.legacyEndKey = boundary;
    state.lastAssignedKey = boundary;
    if (boundary && !state.selectedTaskId && prompt < 0) state.selectedTaskId = LEGACY_ID;
    if (prompt < 0) return true;
  }
  const repaired = repairBootstrapSplit(state, events);
  let from = 0;
  if (state.lastAssignedKey) {
    const index = events.findIndex(e => e.key === state.lastAssignedKey);
    if (index === -1) return false; // transcript not fully read yet (or rewritten): wait.
    from = index + 1;
  }
  if (from >= events.length) return repaired;
  for (let i = from; i < events.length; i++) {
    const event = events[i];
    let task = state.tasks.find(t => t.id === state.activeTaskId);
    if (!task) {
      task = { id: newId(), title: 'Tarefa sem título', titleSource: 'default', createdAt: new Date(now).toISOString() };
      state.tasks.push(task);
      state.activeTaskId = task.id;
    }
    const last = state.segments[state.segments.length - 1];
    if (!last || last.taskId !== task.id) state.segments.push({ startKey: event.key, taskId: task.id });
    if (task.titleSource === 'default' && event.kind === 'prompt' && event.text) {
      const title = shortTitle(event.text);
      if (title) { task.title = title; task.titleSource = 'prompt'; }
    }
    if (!state.selectionPinned) state.selectedTaskId = task.id;
  }
  state.lastAssignedKey = lastKey;
  return true;
}

export function startNewTask(state: TaskState, title: string | undefined, now = Date.now()): TaskInfo {
  const clean = title?.trim().slice(0, 120);
  const current = state.tasks.find(t => t.id === state.activeTaskId);
  let task: TaskInfo;
  if (current && !hasEvents(state, current.id)) {
    task = current;
    if (clean) { task.title = clean; task.titleSource = 'user'; }
  } else {
    task = { id: newId(), title: clean || 'Nova tarefa', titleSource: clean ? 'user' : 'default', createdAt: new Date(now).toISOString() };
    state.tasks.push(task);
  }
  state.activeTaskId = task.id;
  state.selectedTaskId = task.id;
  state.selectionPinned = false;
  return task;
}

export function continueTask(state: TaskState, taskId: string): boolean {
  if (!state.tasks.some(t => t.id === taskId)) return false;
  state.activeTaskId = taskId;
  state.selectedTaskId = taskId;
  state.selectionPinned = false;
  return true;
}

export function selectTask(state: TaskState, taskId: string): boolean {
  if (taskId !== LEGACY_ID && !state.tasks.some(t => t.id === taskId)) return false;
  state.selectedTaskId = taskId;
  state.selectionPinned = taskId !== state.activeTaskId;
  return true;
}

export function renameTask(state: TaskState, taskId: string, title: string): boolean {
  const task = state.tasks.find(t => t.id === taskId);
  const clean = title.trim().slice(0, 120);
  if (!task || !clean) return false;
  task.title = clean;
  task.titleSource = 'user';
  return true;
}

export function taskOfEvents(state: TaskState, events: TranscriptEvent[]): Map<string, string> {
  const result = new Map<string, string>();
  const starts = new Map(state.segments.map(s => [s.startKey, s.taskId]));
  let inLegacy = state.legacyEndKey !== null;
  let current: string | undefined;
  for (const event of events) {
    if (inLegacy) {
      result.set(event.key, LEGACY_ID);
      if (event.key === state.legacyEndKey) inLegacy = false;
      continue;
    }
    current = starts.get(event.key) ?? current;
    if (current) result.set(event.key, current);
  }
  return result;
}
