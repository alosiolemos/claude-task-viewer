# 📦 Painel Execução — Instalação & Uso

## ✅ Arquivos Prontos

```
C:\Users\alois\OneDrive\Documentos\Projetos\estudos\painel-execucao\
├── painel-execucao-0.1.0-alpha.vsix (7.5KB)   ← Instalável direto
├── extension/dist/extension.js (5.4KB)        ← Build compilado
├── webview/index.html (6.9KB)                 ← UI incluída no .vsix
├── collector.js                               ← Backend funcional
└── pronto para GitHub
```

---

## 🚀 Opção 1: Instalar no VS Code (Recomendado)

### Passo 1: Abrir Extensões

```
1. Abra VS Code
2. Vá para: Extensions (Ctrl+Shift+X)
3. Clique no ícone "..." (canto superior direito do painel Extensions)
4. Selecione: "Install from VSIX..."
```

### Passo 2: Selecionar Arquivo

```
Procure por: painel-execucao-0.1.0-alpha.vsix
Localização: C:\Users\alois\OneDrive\Documentos\Projetos\estudos\painel-execucao\
Clique: Install
```

### Passo 3: Ativar Painel

```
Após instalação, clique no novo ícone "Painel Execução" na Activity Bar (esquerda)
OU
Ctrl+Shift+P → "Painel Execução: Abrir Timeline"
```

### Passo 4: Ver Eventos Demo

- Eventos demo aparecem automaticamente com badge amarelo "DEMO"
- Clique em cada um para expandir entrada/saída
- Dados renderizados como texto puro (sem risco XSS)

---

## 🔨 Opção 2: Testar Localmente (Desenvolvimento)

### Setup

```bash
cd "C:\Users\alois\OneDrive\Documentos\Projetos\estudos\painel-execucao"
npm install
npm run ext:build
```

### Abrir Extension Development Host

```
1. Abra VS Code no diretório raiz do projeto
2. Pressione F5
3. Selecione: "Extension Development Host"
   (abre nova janela com extensão carregada)
```

### Ver Timeline

```
Na nova janela:
View → Open View Container "Painel Execução"
       (ou clique no ícone Painel Execução na Activity Bar)
```

### Executar Demo

```bash
npm run collect:demo
```

- 4 eventos aparecerão com badges amarelos "DEMO"

### Capturar Dados Reais

```
1. Na nova janela, configure Claude Code hooks:
   - Copie settings.local.json para ~/.claude/settings.local.json
2. Reinicie Claude Code no VS Code principal
3. Execute uma ação no Claude Code (ex: "Leia o arquivo README.md")
4. Novo evento aparece com badge azul "REAL"
```

---

## 🔒 Segurança

✅ Proteções implementadas:
- Dados renderizados como texto puro (sem interpretação HTML)
- Paths privados substituídos por `~` automaticamente
- Tokens e passwords redacionados antes de gravar
- Armazenamento apenas local (~/.painel-execucao/)
- Sem telemetria ou cloud sync
- Falhas isoladas (nunca interrompe Claude Code)

---

## 🐛 Troubleshooting

### Painel não aparece

```
1. Verifique se a extensão foi instalada:
   Ctrl+Shift+X → procure "Painel Execução"
   
2. Se não aparecer ativada:
   - Clique no ícone (ativar)
   - Recarregue a janela: Ctrl+R
```

### Nenhum evento aparece

```
1. Se no modo demo:
   npm run collect:demo

2. Se esperando eventos reais:
   - Configure settings.local.json com hooks
   - Reinicie Claude Code
   - Execute uma ação (ex: Read, Bash, Grep, Edit)
   
3. Verificar dados gravados:
   node reader.js painel-execucao
```

### Erro "Webview HTML não encontrado"

```
Reconstruir extensão:
npm run ext:build

F5 para recarregar
```

---

## 📞 Próximas Etapas

1. ✅ **Instalar:** Use Opção 1 ou 2 acima
2. ✅ **Testar:** npm run collect:demo (modo local) ou Opção 2
3. ✅ **Publicar:** GitHub (ver seção abaixo)
4. 📊 **Futuro:** Visualização com grafos, comparação entre execuções

---

## 🌐 Publicar no GitHub (Primeira Vez)

### Criar Repositório

1. Abra: https://github.com/new
2. Preencha:
   - **Repository name:** `painel-execucao`
   - **Description:** "Painel local em VS Code para auditar execução do Claude Code"
   - **Public:** ✓
   - **NÃO inicialize com README/LICENSE** (já existem no projeto)
3. Clique: "Create repository"

### Fazer Push

```bash
cd "C:\Users\alois\OneDrive\Documentos\Projetos\estudos\painel-execucao"

# Autenticar no GitHub (primeira vez)
gh auth login

# Configurar remote (se necessário)
git remote set-url origin https://github.com/alosiolemos/painel-execucao.git

# Garantir branch main
git branch -M main

# Push
git push -u origin main
```

### Resultado

Repositório público em:
```
https://github.com/alosiolemos/painel-execucao
```

---

## 📋 Estrutura do Projeto

```
painel-execucao/
├── collector.js              ← Backend: captura eventos Claude Code
├── reader.js                 ← Ferramenta: debug/lê eventos.jsonl
├── extension/
│   ├── src/
│   │   ├── extension.ts      ← Entry point VS Code
│   │   ├── painel-provider.ts ← Webview manager + auto-refresh
│   │   └── event-reader.ts   ← JSONL parser
│   ├── dist/
│   │   └── extension.js      ← Build compilado
│   ├── webview/
│   │   └── index.html        ← UI (HTML5 + CSS + JS seguro)
│   ├── resources/
│   │   └── icon.svg          ← Ícone Activity Bar
│   └── package.json          ← Manifesto VS Code
├── webview/
│   ├── dist/
│   │   └── index.html        ← Cópia de backup da UI
│   └── public/...
├── painel-execucao-0.1.0-alpha.vsix   ← Instalável
├── settings.local.json       ← Hooks Claude Code (opcional)
└── [README, LICENSE, docs...]
```

---

## ✅ Validações Implementadas

- **XSS Protection:** Dados renderizados com `textContent` (não `innerHTML`)
- **Redaction:** Paths, tokens, campos sensíveis removidos antes gravar
- **Isolation:** Falhas em I/O não interrompem Claude Code
- **Event Routing:** Eventos isolados por projeto (~/.painel-execucao/data/{projectName}/)
- **Demo vs Real:** Badges visuais (DEMO = amarelo, REAL = azul)
- **Auto-Refresh:** Timeline atualiza a cada 2 segundos automaticamente
- **Project Detection:** Nome derivado automaticamente do `cwd`

---

**Tudo pronto para instalar e usar!** 🎉
