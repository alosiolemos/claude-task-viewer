import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'extension/package.json'), 'utf8'));
const outfile = path.join(root, 'extension', manifest.main);
if (manifest.main !== 'dist/extension.cjs') throw new Error('package.json "main" deve ser dist/extension.cjs');
if (!fs.existsSync(path.join(root, 'extension/webview/painel.html'))) throw new Error('Interface extension/webview/painel.html ausente');
fs.rmSync(path.join(root, 'extension/dist'), { recursive: true, force: true });
await build({
  entryPoints: [path.join(root, 'extension/src/extension.ts')],
  bundle: true, external: ['vscode'], platform: 'node', format: 'cjs', target: 'node18', outfile,
});
console.log('Extensão ' + manifest.version + ' compilada em ' + path.relative(root, outfile) + '.');
