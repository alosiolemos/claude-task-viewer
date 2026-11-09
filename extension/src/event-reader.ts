import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

export class EventReader {
  lastIssue='';
  async readEvents(): Promise<any[]> {
    const root=path.join(os.homedir(),'.painel-execucao','data');
    this.lastIssue='';
    let folders;
    try {folders=await fs.readdir(root,{withFileTypes:true});}
    catch(error:any){if(error.code==='ENOENT')return [];throw error;}
    const events:any[]=[];
    for(const folder of folders) {
      if(!folder.isDirectory() || folder.isSymbolicLink())continue;
      const file=path.join(root,folder.name,'events.jsonl');
      try {
        const stat=await fs.stat(file);
        if(stat.size>20*1024*1024){this.lastIssue='Um histórico excede 20 MB e não foi carregado. Seus arquivos foram preservados.';continue;}
        const text=await fs.readFile(file,'utf8');
        for(const line of text.split('\n')) {
          if(!line.trim())continue;
          try {
            const record=JSON.parse(line);
            if(record && typeof record==='object' && record.event && typeof record.event==='object') {
              events.push({...record,projectName:record.projectName || folder.name});
            }
          } catch {this.lastIssue='Há linhas incompletas ou inválidas nos registros; os demais eventos foram carregados.';}
        }
      } catch(error:any){if(error.code!=='ENOENT')throw error;}
    }
    return events;
  }
}
