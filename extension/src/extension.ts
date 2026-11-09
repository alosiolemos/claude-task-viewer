import * as vscode from 'vscode';
import { randomBytes } from 'node:crypto';
import { EventReader } from './event-reader';
import { buildExecutions } from './executions';

export function activate(context: vscode.ExtensionContext) {
  let panel: vscode.WebviewPanel | undefined;
  const reader = new EventReader();

  const open = async () => {
    if (panel) { panel.reveal(vscode.ViewColumn.Beside); return; }
    const view = vscode.window.createWebviewPanel('painel-execucao-canvas','Painel Execução — Workflow',vscode.ViewColumn.Beside,{
      enableScripts:true,retainContextWhenHidden:true,
      localResourceRoots:[vscode.Uri.joinPath(context.extensionUri,'webview','dist')],
    });
    panel=view;
    let disposed=false;
    let reading=false;
    let previous='';
    const version=String(context.extension.packageJSON.version);
    const send = async (initial=false) => {
      if(disposed || reading)return;
      reading=true;
      try {
        const events=await reader.readEvents();
        const executions=buildExecutions(events);
        const signature=JSON.stringify({executions,issue:reader.lastIssue});
        if(initial || signature!==previous) {
          await view.webview.postMessage({command:initial?'workflow-loaded':'workflow-updated',executions,version,issue:reader.lastIssue});
          previous=signature;
        }
      } catch {
        await view.webview.postMessage({command:'capture-error',message:'Não foi possível ler os eventos locais.',version});
      } finally {reading=false;}
    };
    view.webview.onDidReceiveMessage(message=>{
      if(message && message.command==='load-workflow') void send(true);
    },undefined,context.subscriptions);
    view.iconPath=vscode.Uri.joinPath(context.extensionUri,'resources','icon.svg');
    try {
      const file=vscode.Uri.joinPath(context.extensionUri,'webview','dist','index.html');
      const html=new TextDecoder().decode(await vscode.workspace.fs.readFile(file));
      const dist=view.webview.asWebviewUri(vscode.Uri.joinPath(context.extensionUri,'webview','dist')).toString();
      const nonce=randomBytes(16).toString('hex');
      const csp="default-src 'none'; img-src "+view.webview.cspSource+" data:; style-src "+view.webview.cspSource+" 'unsafe-inline'; script-src 'nonce-"+nonce+"' "+view.webview.cspSource+"; font-src "+view.webview.cspSource+"; connect-src 'none';";
      view.webview.html=html
        .replace('<head>','<head><meta http-equiv="Content-Security-Policy" content="'+csp+'">')
        .replace(/(src|href)="(?:\/|\.\/)assets\//g,'$1="'+dist+'/assets/')
        .replace(/<script /g,'<script nonce="'+nonce+'" ');
    } catch {
      view.webview.html='<html><body><h2>Painel Execução '+version+'</h2><p>Instalação incompleta: os recursos da interface não foram encontrados. Reinstale o .vsix desta versão.</p></body></html>';
    }
    const config=vscode.workspace.getConfiguration('painel-execucao');
    const delay=Math.max(1000,Number(config.get('refreshInterval',2000))||2000);
    const timer=config.get('autoRefresh',true)?setInterval(()=>void send(),delay):undefined;
    view.onDidDispose(()=>{disposed=true;if(timer)clearInterval(timer);panel=undefined;},undefined,context.subscriptions);
  };
  context.subscriptions.push(vscode.commands.registerCommand('painel-execucao.open',open));
  context.subscriptions.push({dispose(){panel?.dispose();}});
}
export function deactivate() {}
