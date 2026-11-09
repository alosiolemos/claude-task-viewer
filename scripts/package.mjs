import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const require=createRequire(import.meta.url);
execFileSync(process.execPath,[path.join(root,'scripts/build.mjs')],{cwd:root,stdio:'inherit'});
const manifest=JSON.parse(fs.readFileSync(path.join(root,'extension/package.json'),'utf8'));
const output=path.join(root,'painel-execucao-'+manifest.version+'.vsix');
const cli=path.join(path.dirname(require.resolve('@vscode/vsce/package.json')),'vsce');
execFileSync(process.execPath,[cli,'package','--no-dependencies','--out',output],{cwd:path.join(root,'extension'),stdio:'inherit',env:{...process.env,VSCE_PAT:''}});
console.log(output);

