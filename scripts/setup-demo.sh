#!/bin/bash
# Setup demo events for testing painel UI

DEMO_PROJECT="demo"
PAINEL_DATA_DIR="$HOME/.painel-execucao/data/$DEMO_PROJECT"

mkdir -p "$PAINEL_DATA_DIR"
cp demo-events.jsonl "$PAINEL_DATA_DIR/events.jsonl"

echo "✅ Demo events setup complete:"
echo "   Project: $DEMO_PROJECT"
echo "   Path: $PAINEL_DATA_DIR/events.jsonl"
echo "   Events: $(wc -l < "$PAINEL_DATA_DIR/events.jsonl") captured"
