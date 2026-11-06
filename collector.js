#!/usr/bin/env node

/**
 * Painel Execução — Coletor de Eventos
 *
 * Este script é invocado pelos hooks do Claude Code e registra eventos
 * em um arquivo JSON local. Ele NUNCA interrompe a execução do Claude,
 * mesmo em caso de erro.
 */

import fs from 'fs';
import path from 'path';
import os from 'os';

// ============================================
// Configuração e Caminhos
// ============================================

// Derivar nome do projeto: cwd → última pasta
// argv[2] pode ser cwd passado pelo hook
// Fallback: CLAUDE_CODE_PROJECT ou 'default'
function deriveProjectName() {
  if (process.argv[2] && process.argv[2].length > 0 && !process.argv[2].startsWith('-')) {
    const cwd = process.argv[2];
    const parts = cwd.split(path.sep).filter(p => p);
    if (parts.length > 0) {
      return parts[parts.length - 1];
    }
  }
  return process.env.CLAUDE_CODE_PROJECT || 'default';
}

const PROJECT_NAME = deriveProjectName();
const COLLECTOR_DIR = path.join(os.homedir(), '.painel-execucao', 'data', PROJECT_NAME);
const EVENTS_FILE = path.join(COLLECTOR_DIR, 'events.jsonl');
const STATUS_FILE = path.join(COLLECTOR_DIR, 'status.json');

// ============================================
// Utilitários Seguros
// ============================================

/**
 * Garante que o diretório existe, sem falhar
 */
function ensureDir() {
  try {
    if (!fs.existsSync(COLLECTOR_DIR)) {
      fs.mkdirSync(COLLECTOR_DIR, { recursive: true });
    }
  } catch (e) {
    // Silenciosamente falha; não interrompe Claude
  }
}

/**
 * Redige dados sensíveis (caminhos privados, tokens, etc.)
 * Protegido: nunca retorna dados brutos após profundidade limite
 */
function redactSensitive(obj, depth = 0, maxDepth = 8) {
  if (depth > maxDepth) {
    // Proteção contra loop infinito: redactar todo o conteúdo
    if (typeof obj === 'string' && obj.length > 100) {
      return '[REDACTED_DEEP_OBJECT]';
    }
    return obj;
  }

  if (obj === null || obj === undefined) return obj;

  if (typeof obj === 'string') {
    // Remover caminhos completos de usuário (funciona no Windows e Unix)
    const homeDir = os.homedir();
    if (obj.includes(homeDir)) {
      obj = obj.replaceAll(homeDir, '~');
    }

    // Remover tokens/chaves (40+ chars alfanuméricos)
    if (obj.match(/^[A-Za-z0-9_\-]{40,}$/)) {
      return '[REDACTED_TOKEN]';
    }

    // Remover strings longas suspeitas (prováveis valores codificados)
    if (obj.length > 200 && obj.match(/[A-Za-z0-9+\/=]{100,}/)) {
      return '[REDACTED_LONG_VALUE]';
    }

    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.slice(0, 100).map(item => redactSensitive(item, depth + 1, maxDepth));
  }

  if (typeof obj === 'object') {
    const result = {};
    const keys = Object.keys(obj).slice(0, 50); // Limitar chaves
    for (const key of keys) {
      // Redactar campos verdadeiramente sensíveis
      if (key.match(/^(password|token|secret|api_key|apiKey|access_key|private_key|private|auth|credential|bearer|authorization|x-api-key)$/i)) {
        result[key] = '[REDACTED]';
      } else {
        result[key] = redactSensitive(obj[key], depth + 1, maxDepth);
      }
    }
    return result;
  }

  return obj;
}

/**
 * Registra um evento em JSONL (uma linha = um evento)
 */
function logEvent(eventData) {
  try {
    ensureDir();

    const event = {
      timestamp: new Date().toISOString(),
      projectName: PROJECT_NAME,
      captureVersion: '1.0',
      event: redactSensitive(eventData),
    };

    const line = JSON.stringify(event) + '\n';
    fs.appendFileSync(EVENTS_FILE, line, 'utf8');
  } catch (e) {
    // Silenciosamente falha; não interrompe Claude
    process.stderr.write(`[painel-execucao] Failed to log event: ${e.message}\n`);
  }
}

/**
 * Atualiza arquivo de status para indicar que o coletor está ativo
 */
function updateStatus() {
  try {
    ensureDir();
    const status = {
      lastCheck: new Date().toISOString(),
      enabled: true,
      projectName: PROJECT_NAME,
      eventsFile: EVENTS_FILE,
      pid: process.pid,
    };
    fs.writeFileSync(STATUS_FILE, JSON.stringify(status, null, 2), 'utf8');
  } catch (e) {
    // Silenciosamente falha
  }
}

// ============================================
// Interface do Hook
// ============================================

/**
 * Função principal chamada pelo hook do Claude Code
 *
 * Suporta dois canais de entrada:
 * 1. Via processo.argv (argumentos CLI)
 * 2. Via stdin (PostToolUse, recomendado — mais estruturado)
 */
async function main() {
  let eventData = null;
  let source = 'unknown';

  // ========================================
  // Canal 1: Entrada via stdin (PostToolUse)
  // ========================================

  if (!process.stdin.isTTY) {
    try {
      const stdinData = await readStdin();
      if (stdinData && stdinData.trim()) {
        source = 'stdin';
        try {
          eventData = JSON.parse(stdinData);
        } catch {
          // Pode ser formato texto, não JSON
          eventData = { raw: stdinData };
        }
      }
    } catch (e) {
      // Stdin não disponível
    }
  }

  // ========================================
  // Canal 2: Entrada via argv (fallback)
  // ========================================

  if (!eventData && process.argv.length > 2) {
    source = 'argv';
    const eventType = process.argv[2] || 'unknown';
    const eventPayload = process.argv.slice(3);

    if (eventType === 'tool') {
      const [toolName, status, ...rest] = eventPayload;
      eventData = {
        type: 'tool',
        toolName,
        status,
        input: rest[0] || null,
        output: rest[1] || null,
        source: 'argv-cli',
      };
    } else if (eventType === 'session') {
      const [sessionEvent, ...rest] = eventPayload;
      eventData = {
        type: 'session',
        event: sessionEvent,
        metadata: rest[0] || null,
        source: 'argv-cli',
      };
    } else {
      eventData = {
        type: 'unknown',
        eventType,
        data: eventPayload,
        source: 'argv-cli',
      };
    }
  }

  // ========================================
  // Processar evento (qualquer fonte)
  // ========================================

  if (!eventData) {
    eventData = {
      type: 'unknown',
      message: 'No input received',
      source: 'none',
    };
  }

  // Adicionar metadados
  eventData.captureSource = source;
  eventData.available = true; // Indica que coletor está funcionando

  logEvent(eventData);
  updateStatus();
}

/**
 * Ler dados do stdin de forma assíncrona (até 1MB, timeout 5s)
 */
function readStdin() {
  return new Promise((resolve, reject) => {
    let data = '';
    const timeout = setTimeout(() => reject(new Error('stdin timeout')), 5000);

    process.stdin.setEncoding('utf8');
    process.stdin.on('data', chunk => {
      data += chunk;
      if (data.length > 1024 * 1024) {
        clearTimeout(timeout);
        reject(new Error('stdin too large'));
      }
    });

    process.stdin.on('end', () => {
      clearTimeout(timeout);
      resolve(data);
    });

    process.stdin.on('error', err => {
      clearTimeout(timeout);
      reject(err);
    });
  });
}

// ========================================
// Executar
// ========================================

main().catch(e => {
  // Nunca interromper o Claude, mesmo com erro
  process.stderr.write(`[painel-execucao] Collector error: ${e.message}\n`);
  process.exit(0); // Sair silenciosamente
});
