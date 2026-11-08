# 🚀 Painel Execução — Quick Start

## 1️⃣ Instalar

```bash
# Opção A: Do GitHub (recomendado)
# Baixe painel-execucao-0.2.1.vsix em:
# https://github.com/alosiolemos/painel-execucao/releases

# Opção B: Compilar localmente
git clone https://github.com/alosiolemos/painel-execucao.git
cd painel-execucao
npm install
npm run ext:build
```

## 2️⃣ Abrir no VS Code

### Instalação via VSIX:
1. **Extensions** (Ctrl+Shift+X)
2. Clique **"..."** (canto superior direito)
3. **Install from VSIX**
4. Selecione `painel-execucao-0.2.1.vsix`

### Desenvolvimento local (com hot-reload):
1. Abra este repo em VS Code
2. Pressione **F5**
3. Selecione **Extension Development Host**
4. Nova janela abre com a extensão ativa

## 3️⃣ Abrir o Painel

```
Cmd+Shift+P (ou Ctrl+Shift+P no Windows/Linux)
Digitar: "Abrir Painel Execução"
Pressionar Enter
```

Painel abre em aba ampla ao lado do chat.

## 4️⃣ Usar

### ✅ Painel com demo (sem ações)
- Mostra workflow demo com 11 etapas
- Canvas renderiza com estados coloridos
- Clique em nó → Inspector mostra entrada/saída

### ✅ Painel com eventos reais
1. Certifique-se de que hooks estão configurados:
   - `~/.claude/settings.json` contém `"hooks": { "PostToolUse": ... }`
2. Execute ações no Claude Code:
   - **Read** um arquivo
   - **Write** um arquivo
   - **Edit** um arquivo
   - **Bash** execute comando
3. Painel captura automaticamente
4. Canvas renderiza com labels descritivos:
   - "Ler README.md"
   - "Criar resultado.json"
   - "Editar arquivo"
   - "Executar npm"

### 🔄 Histórico
- **Esquerda:** Sidebar com lista de execuções
- **Botão ◀/▶:** Recolhe/expande histórico
- **Clique em execução:** Muda para essa execução
- **Badge:** 🎬 DEMO ou 🔴 REAL
- **Timestamp:** Hora da execução (formato local)

### 🖱️ Canvas
- **Clique em nó:** Abre inspector com entrada/saída/erros
- **Arrasta nó:** Posição preservada em localStorage
- **Cores:** Planejado (cinza) → Executando (laranja) → Concluído (verde) → Falhou (vermelho)

### 📋 Inspector (direita)
- **Status:** Estado do nó
- **Ações:** Lista de chamadas (Read, Write, etc.)
- **Entrada:** JSON dos argumentos (clique para expandir)
- **Saída:** JSON do resultado
- **Erros:** Destacados em vermelho
- **Dependências:** Etapas que esse nó depende

## 5️⃣ Configuração (Opcional)

### Ativar captura automática

Se os hooks não estão funcionando, adicione em `~/.claude/settings.json`:

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "*",
        "description": "Painel Execução",
        "hooks": [
          {
            "type": "command",
            "shell": "bash",
            "command": "node \"C:/caminho/para/painel-execucao/collector.js\" \"seu-projeto\"",
            "timeout": 5,
            "async": true,
            "stdin": true
          }
        ]
      }
    ]
  }
}
```

Substituir `C:/caminho/para` pelo seu caminho e `seu-projeto` pelo nome do projeto.

### Ver eventos via CLI

```bash
node reader.js painel-execucao
# Mostra todos os eventos capturados
```

### Limpar histórico

```bash
rm -rf ~/.painel-execucao/data/seu-projeto
# Remove todos os eventos
```

## 6️⃣ Troubleshooting

| Problema | Solução |
|----------|---------|
| Painel não abre | Rebuild: `npm run ext:build` e F5 |
| Eventos não aparecem | Verifique hooks em `~/.claude/settings.json` |
| Canvas vazio | Execute ação (Read, Write, etc.) |
| Posições não preservadas | Limpe localStorage no DevTools (F12) |

## 📊 O Que Você Vê

```
┌─────────────────────────────────────────────────────┐
│  ◀ Histórico  📊 Execução em Tempo Real      🎬 DEMO  │
├─────────────────────────────────────────────────────┤
│                                                     │
│ Histórico    │          Canvas          │Inspector │
│ 12:30        │  ┌─────────────────┐     │          │
│ 🎬 11°       │  │ Ler README  ✓   │     │ Status   │
│ 🔴 5°        │  └────────────┬────┘     │ Entrada  │
│              │               │          │ Saída    │
│ + novo       │  ┌────────────▼────┐     │ Erros    │
│              │  │ Criar arquivo ✓ │     │ Actions  │
│              │  └─────────────────┘     │          │
│              │                          │          │
└─────────────────────────────────────────────────────┘
```

## 🔗 Links

- **GitHub:** https://github.com/alosiolemos/painel-execucao
- **Releases:** https://github.com/alosiolemos/painel-execucao/releases
- **Issues:** https://github.com/alosiolemos/painel-execucao/issues

## 🎯 Próximas Fases

- Phase 3: Comparison (diff entre 2 execuções)
- Phase 4: Gemini explicações (opt-in)
- Phase 5: Temas customizáveis

---

**Pronto!** Execute suas ações e observe o painel capturar em tempo real. 🚀
