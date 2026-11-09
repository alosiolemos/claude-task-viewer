import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

export interface TranscriptRecord {
  type: string;
  timestamp?: string;
  sessionId?: string;
  parentUuid?: string;
  userUuid?: string;
  attachment?: {
    type?: string;
    toolUseID?: string;
    hookEvent?: string;
    toolName?: string;
    toolInput?: any;
    toolResponse?: any;
    content?: string;
    error?: string;
  };
  [key: string]: any;
}

export interface Action {
  recordIndex: number;
  timestamp: Date;
  type: 'user-input' | 'tool-use' | 'tool-result' | 'system' | 'unknown';
  toolName?: string;
  description: string;
  input?: any;
  output?: any;
  error?: string;
  filePath?: string;
}

export class TranscriptReader {
  private transcriptPath: string;
  private lastReadPosition: number = 0;
  private lastModified: number = 0;

  constructor(sessionId: string, projectPath?: string) {
    const home = os.homedir();
    const claudeProject = projectPath || 'Projetos';
    this.transcriptPath = path.join(
      home,
      '.claude',
      'projects',
      claudeProject,
      `${sessionId}.jsonl`
    );
  }

  /**
   * Lê apenas as novas linhas desde a última leitura.
   * Retorna null se o arquivo não existe ou o formato é incompatível.
   */
  async readNewRecords(): Promise<{ actions: Action[]; error?: string } | null> {
    if (!fs.existsSync(this.transcriptPath)) {
      return null;
    }

    try {
      const stat = fs.statSync(this.transcriptPath);
      const content = fs.readFileSync(this.transcriptPath, 'utf8');
      const lines = content.split('\n').filter(l => l.trim());

      let recordIndex = 0;
      const actions: Action[] = [];

      for (const line of lines) {
        try {
          const record = JSON.parse(line);
          const action = this.parseRecord(record, recordIndex);
          if (action) {
            actions.push(action);
          }
          recordIndex++;
        } catch (e) {
          // Linha mal-formada, ignorar
        }
      }

      this.lastReadPosition = content.length;
      this.lastModified = stat.mtimeMs;
      return { actions };
    } catch (error) {
      return {
        actions: [],
        error: `Erro ao ler transcrição: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }

  private parseRecord(record: TranscriptRecord, index: number): Action | null {
    const timestamp = record.timestamp ? new Date(record.timestamp) : new Date();

    // User input
    if (record.type === 'user-input') {
      return {
        recordIndex: index,
        timestamp,
        type: 'user-input',
        description: this.extractUserMessage(record),
        input: record.input,
      };
    }

    // Tool use
    if (record.type === 'tool-use') {
      const attachment = record.attachment || {};
      return {
        recordIndex: index,
        timestamp,
        type: 'tool-use',
        toolName: attachment.toolName || 'Ferramenta',
        description: this.describeAction(attachment),
        input: attachment.toolInput,
        output: attachment.toolResponse,
        error: attachment.error,
        filePath: this.extractFilePath(attachment),
      };
    }

    // Attachment com resultado de ferramenta
    if (record.type === 'attachment' && record.attachment?.type === 'tool-result') {
      const attachment = record.attachment;
      return {
        recordIndex: index,
        timestamp,
        type: 'tool-result',
        toolName: attachment.toolName || 'Ferramenta',
        description: this.describeAction(attachment),
        input: attachment.toolInput,
        output: attachment.toolResponse,
        error: attachment.error,
        filePath: this.extractFilePath(attachment),
      };
    }

    return null;
  }

  private extractUserMessage(record: any): string {
    if (record.content) return record.content.split('\n')[0].slice(0, 100);
    if (record.input?.message) return record.input.message.split('\n')[0].slice(0, 100);
    return 'Mensagem do usuário';
  }

  private describeAction(attachment: any): string {
    const toolName = attachment.toolName || attachment.tool_name || 'Ação';
    const filePath = this.extractFilePath(attachment);
    const fileName = filePath ? filePath.split(/[\\\/]/).pop() : '';

    if (toolName === 'Read' && fileName) return `Leu ${fileName}`;
    if (toolName === 'Write' && fileName) return `Criou ${fileName}`;
    if (toolName === 'Edit' && fileName) return `Editou ${fileName}`;
    if (toolName === 'Bash') {
      const cmd = String(attachment.toolInput?.command || '').slice(0, 50);
      return cmd ? `Executou: ${cmd}` : 'Executou comando';
    }
    if (toolName === 'Bash') return 'Executou comando';
    if (toolName === 'Grep') return 'Buscou texto';
    if (toolName === 'Glob') return 'Localizou arquivos';

    return toolName;
  }

  private extractFilePath(attachment: any): string {
    const input = attachment.toolInput || attachment.input || {};
    return input.file_path || input.filePath || input.path || '';
  }
}
