const esbuild = require('esbuild');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const outDir = path.join(os.tmpdir(), 'painel-execucao-tests');

/** Bundles the real implementation from extension/src so tests never re-implement it. */
function load(name) {
  const outfile = path.join(outDir, name + '-' + process.pid + '.cjs');
  esbuild.buildSync({
    entryPoints: [path.join(__dirname, '../extension/src', name + '.ts')],
    bundle: true, platform: 'node', format: 'cjs', outfile, logLevel: 'silent',
  });
  delete require.cache[outfile];
  return require(outfile);
}

function tempFile(name) {
  fs.mkdirSync(outDir, { recursive: true });
  const file = path.join(outDir, Date.now() + '-' + Math.random().toString(36).slice(2) + '-' + name);
  return file;
}

// Synthetic records shaped like Claude Code transcripts (fields observed locally; content invented).
const base = (type, uuid, time, extra) => ({ type, uuid, timestamp: time, isSidechain: false, sessionId: 's-1', ...extra });
const fx = {
  prompt: (uuid, text, time) => base('user', uuid, time, { origin: { kind: 'human' }, message: { role: 'user', content: text } }),
  meta: (uuid, text, time) => base('user', uuid, time, { isMeta: true, message: { role: 'user', content: text } }),
  noOrigin: (uuid, text, time) => base('user', uuid, time, { message: { role: 'user', content: [{ type: 'text', text }] } }),
  toolUse: (uuid, messageId, id, name, input, time) => base('assistant', uuid, time, {
    message: { id: messageId, role: 'assistant', stop_reason: 'tool_use', content: [{ type: 'tool_use', id, name, input }] },
  }),
  toolResult: (uuid, id, content, isError, time, structured) => base('user', uuid, time, {
    sourceToolUseID: id, toolUseResult: structured,
    message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: id, content, is_error: isError }] },
  }),
  text: (uuid, messageId, text, stop, time) => base('assistant', uuid, time, {
    message: { id: messageId, role: 'assistant', stop_reason: stop, content: [{ type: 'text', text }] },
  }),
  title: (aiTitle) => ({ type: 'ai-title', aiTitle, sessionId: 's-1' }),
};

const line = record => JSON.stringify(record) + '\n';

module.exports = { load, tempFile, fx, line };
