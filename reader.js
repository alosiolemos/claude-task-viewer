#!/usr/bin/env node

/**
 * Painel Execução — Leitor de Eventos
 *
 * Lê os eventos capturados e mostra em formato legível
 */

import fs from 'fs';
import path from 'path';
import os from 'os';

const PROJECT_NAME = process.argv[2] || 'default';
const COLLECTOR_DIR = path.join(os.homedir(), '.painel-execucao', 'data', PROJECT_NAME);
const EVENTS_FILE = path.join(COLLECTOR_DIR, 'events.jsonl');
const STATUS_FILE = path.join(COLLECTOR_DIR, 'status.json');

console.log('\n📊 Painel Execução — Leitor de Eventos\n');
console.log(`📂 Projeto: ${PROJECT_NAME}`);
console.log(`📁 Diretório: ${COLLECTOR_DIR}`);
console.log('');

// ========================================
// Mostrar status
// ========================================

if (fs.existsSync(STATUS_FILE)) {
  try {
    const status = JSON.parse(fs.readFileSync(STATUS_FILE, 'utf8'));
    console.log('✅ Status do Coletor:');
    console.log(`   Habilitado: ${status.enabled}`);
    console.log(`   Última verificação: ${status.lastCheck}`);
    console.log(`   PID: ${status.pid}`);
  } catch (e) {
    console.log('❌ Erro ao ler status');
  }
} else {
  console.log('⚠️  Arquivo de status não encontrado (coletor ainda não foi acionado)');
}

console.log('');

// ========================================
// Listar eventos
// ========================================

if (!fs.existsSync(EVENTS_FILE)) {
  console.log('📭 Nenhum evento capturado ainda.');
  console.log('\n💡 Dicas:');
  console.log('   1. O hook precisa estar ativado em settings.json (ou aplicado manualmente)');
  console.log('   2. Execute uma ação no Claude Code (ex: leia um arquivo, execute um comando)');
  console.log('   3. Re-execute este script para ver os eventos');
  process.exit(0);
}

try {
  const lines = fs.readFileSync(EVENTS_FILE, 'utf8').split('\n').filter(l => l.trim());
  console.log(`📋 Eventos capturados: ${lines.length}\n`);

  lines.forEach((line, idx) => {
    try {
      const event = JSON.parse(line);
      console.log(`\n[${idx + 1}] ${event.timestamp}`);
      console.log(`    Tipo: ${event.event?.type || 'unknown'}`);

      if (event.event?.type === 'tool') {
        console.log(`    Ferramenta: ${event.event.toolName}`);
        console.log(`    Status: ${event.event.status}`);
      } else if (event.event?.type === 'session') {
        console.log(`    Evento de Sessão: ${event.event.event}`);
      }

      if (event.event?.available) {
        console.log(`    ✅ Captura ativa`);
      }

      // Mostrar dados adicionais se houver
      if (event.event?.input) {
        console.log(`    Entrada: ${JSON.stringify(event.event.input).substring(0, 60)}...`);
      }
      if (event.event?.output) {
        console.log(`    Saída: ${JSON.stringify(event.event.output).substring(0, 60)}...`);
      }
    } catch (e) {
      console.log(`[${idx + 1}] ❌ Erro ao decodificar: ${e.message}`);
    }
  });

  console.log(`\n✅ Total de eventos: ${lines.length}`);
} catch (e) {
  console.log(`❌ Erro ao ler eventos: ${e.message}`);
}

console.log('\n');
