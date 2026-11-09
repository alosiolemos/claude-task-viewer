export type EventKind = 'prompt' | 'action' | 'reply';

export interface ToolResult {
  content: unknown;
  isError: boolean;
  time: string;
  structured?: unknown;
}

export interface TranscriptEvent {
  key: string;
  kind: EventKind;
  time: string;
  text?: string;
  tool?: string;
  input?: Record<string, unknown>;
  group?: string;
  result?: ToolResult;
}

export interface FormatReport {
  records: number;
  malformed: number;
  recognized: boolean;
  humanRule: 'origin' | 'approximate' | 'none';
  unknownTypes: string[];
  sidechainSkipped: number;
}

const KNOWN_TYPES = new Set([
  'user', 'assistant', 'system', 'attachment', 'summary', 'ai-title', 'custom-title', 'last-prompt',
  'session-owner', 'queue-operation', 'file-history-snapshot', 'file-history-delta', 'atis-latch',
  'api-request', 'api-request-blob', 'api-request-shape', 'cost-state', 'mode', 'frame-link', 'tools-used',
]);

const isObject = (value: unknown): value is Record<string, any> => !!value && typeof value === 'object' && !Array.isArray(value);

export function blockText(content: unknown): string {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return content === undefined || content === null ? '' : JSON.stringify(content, null, 2);
  return content.map(block => {
    if (!isObject(block)) return String(block);
    if (block.type === 'text') return String(block.text ?? '');
    if (block.type === 'image') return '[imagem]';
    return JSON.stringify(block, null, 2);
  }).join('\n');
}

/** Projection of a Claude Code transcript into prompts, tool actions and final replies. */
export interface ActionComment {
  text: string;
  scope: 'step' | 'round';
  actions: number;
}

export class TranscriptModel {
  events: TranscriptEvent[] = [];
  title = '';
  private byKey = new Map<string, TranscriptEvent>();
  private seenRecords = new Set<string>();
  private orphanResults = new Map<string, ToolResult>();
  private originSeen = false;
  private approximateUsed = false;
  private conversational = 0;
  private records = 0;
  private malformed = 0;
  private sidechain = 0;
  private unknown = new Set<string>();
  private comments = new Map<string, string>();

  reset(): void {
    Object.assign(this, new TranscriptModel());
  }

  report(): FormatReport {
    return {
      records: this.records,
      malformed: this.malformed,
      recognized: this.records === 0 || this.conversational > 0,
      humanRule: this.originSeen ? 'origin' : this.approximateUsed ? 'approximate' : 'none',
      unknownTypes: [...this.unknown].sort(),
      sidechainSkipped: this.sidechain,
    };
  }

  get(key: string): TranscriptEvent | undefined {
    return this.byKey.get(key);
  }

  /** Public text written in the same assistant message as the action. Thinking blocks are never stored. */
  commentFor(event: TranscriptEvent): ActionComment | undefined {
    if (event.kind !== 'action' || !event.group) return undefined;
    const text = this.comments.get(event.group);
    if (!text) return undefined;
    const actions = this.events.filter(e => e.kind === 'action' && e.group === event.group).length;
    return { text, scope: actions > 1 ? 'round' : 'step', actions };
  }

  /** Returns how many events were added or changed. Re-ingesting the same records changes nothing. */
  ingest(records: unknown[], malformed = 0): number {
    this.malformed += malformed;
    let changes = 0;
    for (const record of records) {
      if (!isObject(record)) { this.malformed++; continue; }
      this.records++;
      const type = String(record.type ?? '');
      if (!KNOWN_TYPES.has(type)) { this.unknown.add(type || '(sem tipo)'); continue; }
      if (type === 'ai-title' && typeof record.aiTitle === 'string') { this.title = record.aiTitle; continue; }
      if (type !== 'user' && type !== 'assistant') continue;
      if (!isObject(record.message)) continue;
      this.conversational++;
      if (record.isSidechain === true) { this.sidechain++; continue; }
      const recordId = typeof record.uuid === 'string' ? record.uuid : '';
      if (recordId) {
        if (this.seenRecords.has(recordId)) continue;
        this.seenRecords.add(recordId);
      }
      if ('origin' in record) this.originSeen = true;
      changes += type === 'user' ? this.ingestUser(record, recordId) : this.ingestAssistant(record, recordId);
    }
    return changes;
  }

  private add(event: TranscriptEvent): number {
    if (this.byKey.has(event.key)) return 0;
    this.byKey.set(event.key, event);
    this.events.push(event);
    return 1;
  }

  private ingestUser(record: Record<string, any>, recordId: string): number {
    const content = record.message.content;
    const time = String(record.timestamp ?? '');
    const results = Array.isArray(content) ? content.filter(b => isObject(b) && b.type === 'tool_result') : [];
    if (results.length) {
      let changes = 0;
      for (const block of results) {
        const id = String(block.tool_use_id ?? '');
        if (!id) continue;
        const structured = isObject(record.toolUseResult) && (results.length === 1 || record.sourceToolUseID === id) ? record.toolUseResult : undefined;
        const result: ToolResult = { content: block.content, isError: block.is_error === true, time, structured };
        const action = this.byKey.get('t:' + id);
        if (action) {
          if (!action.result) { action.result = result; changes++; }
        } else {
          this.orphanResults.set(id, result);
        }
      }
      return changes;
    }
    if (!recordId || record.isMeta === true || record.isCompactSummary === true) return 0;
    const text = blockText(content);
    let human: boolean;
    if ('origin' in record) {
      human = isObject(record.origin) && record.origin.kind === 'human';
    } else if (this.originSeen) {
      human = false;
    } else {
      human = !!text.trim() && !text.trimStart().startsWith('<');
      if (human) this.approximateUsed = true;
    }
    if (!human) return 0;
    return this.add({ key: 'p:' + recordId, kind: 'prompt', time, text });
  }

  private ingestAssistant(record: Record<string, any>, recordId: string): number {
    const message = record.message;
    const content = Array.isArray(message.content) ? message.content : [];
    const time = String(record.timestamp ?? '');
    const group = typeof message.id === 'string' ? message.id : recordId;
    let changes = 0;
    for (const block of content) {
      if (!isObject(block) || block.type !== 'tool_use' || typeof block.id !== 'string') continue;
      const event: TranscriptEvent = {
        key: 't:' + block.id, kind: 'action', time, tool: String(block.name ?? 'Ferramenta'),
        input: isObject(block.input) ? block.input : {}, group,
      };
      const orphan = this.orphanResults.get(block.id);
      if (orphan) { event.result = orphan; this.orphanResults.delete(block.id); }
      changes += this.add(event);
    }
    if (message.stop_reason === 'end_turn' && recordId) {
      const text = content.filter((b: any) => isObject(b) && b.type === 'text').map((b: any) => String(b.text ?? '')).join('\n').trim();
      if (text) changes += this.add({ key: 'r:' + recordId, kind: 'reply', time, text });
    }
    const comment = content.filter((b: any) => isObject(b) && b.type === 'text').map((b: any) => String(b.text ?? '')).join('\n').trim();
    if (comment && recordId) this.comments.set(group, [this.comments.get(group), comment].filter(Boolean).join('\n\n'));
    return changes;
  }
}
