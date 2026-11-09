import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {build} from 'esbuild';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const require=createRequire(import.meta.url);
const frontend=path.join(root,'webview');
execFileSync(process.execPath,[path.join(path.dirname(require.resolve('vite/package.json')),'bin/vite.js'),'build'],{cwd:frontend,stdio:'inherit'});
await build({entryPoints:[path.join(root,'extension/src/extension.ts')],bundle:true,external:['vscode'],platform:'node',format:'cjs',target:'node18',outfile:path.join(root,'extension/dist/extension.cjs')});
const destination=path.resolve(root,'extension/webview/dist');
if(destination!==path.join(root,'extension','webview','dist'))throw new Error('Destino de build inesperado');
fs.rmSync(destination,{recursive:true,force:true});
fs.mkdirSync(path.dirname(destination),{recursive:true});
fs.cpSync(path.join(frontend,'dist'),destination,{recursive:true});
console.log('Interface e extensão compiladas; assets copiados para o pacote.');


