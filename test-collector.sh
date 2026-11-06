#!/bin/bash

# Painel Execução — Teste Rápido do Coletor
# Este script simula eventos para validar que o collector.js funciona

set -e

echo ""
echo "🧪 Teste do Collector — Painel Execução"
echo "========================================"
echo ""

PROJECT="test-demo"

echo "📝 Simulando eventos..."
echo ""

# Simular evento de sessão
echo "  1️⃣  Evento de sessão (startup)..."
CLAUDE_CODE_PROJECT="$PROJECT" node collector.js session start

# Simular evento de ferramenta (Read)
echo "  2️⃣  Evento de ferramenta (Read)..."
CLAUDE_CODE_PROJECT="$PROJECT" node collector.js tool Read start

# Simular evento de ferramenta (Bash)
echo "  3️⃣  Evento de ferramenta (Bash)..."
CLAUDE_CODE_PROJECT="$PROJECT" node collector.js tool Bash start

# Simular evento de ferramenta (Edit)
echo "  4️⃣  Evento de ferramenta (Edit)..."
CLAUDE_CODE_PROJECT="$PROJECT" node collector.js tool Edit start

echo ""
echo "✅ Eventos simulados!"
echo ""

# Mostrar o arquivo de eventos
echo "📋 Exibindo eventos capturados..."
echo ""

node reader.js "$PROJECT"

echo ""
echo "✅ Teste concluído!"
echo ""
echo "📂 Arquivo bruto: $(echo ~/.painel-execucao/data/$PROJECT/events.jsonl | sed "s|~|$HOME|")"
echo ""
