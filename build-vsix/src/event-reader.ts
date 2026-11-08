import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

export interface PainelEvent {
  timestamp: string;
  projectName: string;
  event: {
    tool_use_id?: string;
    tool_name?: string;
    tool_input?: any;
    tool_response?: any;
    captureSource?: string;
    available?: boolean;
  };
}

export class EventReader {
  private getEventsPath(projectName: string = 'painel-execucao'): string {
    const homeDir = os.homedir();
    return path.join(homeDir, '.painel-execucao', 'data', projectName, 'events.jsonl');
  }

  async readEvents(projectName: string = 'painel-execucao'): Promise<PainelEvent[]> {
    const eventsPath = this.getEventsPath(projectName);

    if (!fs.existsSync(eventsPath)) {
      return [];
    }

    try {
      const content = fs.readFileSync(eventsPath, 'utf8');
      const lines = content.trim().split('\n').filter(l => l);

      return lines.map((line) => {
        try {
          return JSON.parse(line);
        } catch {
          return null;
        }
      }).filter(Boolean) as PainelEvent[];
    } catch {
      return [];
    }
  }

  async watchEvents(
    projectName: string = 'painel-execucao',
    callback: (events: PainelEvent[]) => void
  ): Promise<() => void> {
    const eventsPath = this.getEventsPath(projectName);

    const watcher = fs.watch(path.dirname(eventsPath), async () => {
      const events = await this.readEvents(projectName);
      callback(events);
    });

    return () => watcher.close();
  }
}
