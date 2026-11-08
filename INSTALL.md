# 📦 Painel Execução — Instalação & Uso

## ✅ Arquivos Prontos

```
C:\Users\alois\OneDrive\Documentos\Projetos\estudos\painel-execucao\
├── painel-execucao-0.1.0-alpha.tar.gz (3.2KB) ← Instalável
├── extension/dist/extension.js (5.4KB)         ← Build compilado
├── webview/dist/index.html (5.8KB)             ← UI renderizado
├── collector.js                                ← Backend funcional
└── 12 commits prontos para GitHub
```

---

## 🚀 Opção 1: Testar Localmente (Recomendado)

### Setup

```bash
cd "C:\Users\alois\OneDrive\Documentos\Projetos\estudos\painel-execucao"
npm install
npm run ext:build
npm run collect:demo
```

### Abrir em VS Code

```
F5 → "Extension Development Host"
     (abre nova janela com extensão carregada)

View → Open View Container "Painel Execução"
       (ou clique no ícone na Activity Bar)
```

### Ver Timeline

- 4 eventos demo aparecem com badges amarelos "DEMO"
- Clique em cada um para expandir entrada/saída
- Confirme que tudo funciona

### Capturar Dados Reais

1. Reinicie Claude Code (settings.local.json tem hooks)
2. Execute no Claude Code: *"Leia o arquivo README.md"*
3. Novo evento aparece com badge azul "REAL"

---

## 🔧 Opção 2: Instalar Extensão

### Extrair Pacote

```bash
cd "C:\Users\alois\OneDrive\Documentos\Projetos\estudos\painel-execucao"
tar -xzf painel-execucao-0.1.0-alpha.tar.gz

# Agora você tem: dist/, resources/, package.json
```

### Instalar em VS Code (Manual)

```
1. Abra VS Code
2. Vá para: Extensions (Ctrl+Shift+X)
3. Clique: "..." → "Install from VSIX"
4. Procure por: painel-execucao-0.1.0-alpha.vsix
   (ou use o arquivo extraído)
5. Clique: Install
```

---

## 🌐 Publicar no GitHub

### Criar Repositório

1. Abra: https://github.com/new
2. Preencha:
   - Nome: `painel-execucao`
   - Descrição: "Painel local em VS Code para auditar execução do Claude Code"
   - Público: ✓
   - NÃO inicialize com README/LICENSE

3. Clique: "Create repository"

### Fazer Push

```bash
cd "C:\Users\alois\OneDrive\Documentos\Projetos\estudos\painel-execucao"

git remote set-url origin https://github.com/alosiolemos/painel-execucao.git
git branch -M main
git push -u origin main

# Pronto! Repositório está público em:
# https://github.com/alosiolemos/painel-execucao
```

---

## 📋 Estrutura Instalada

```
painel-execucao-0.1.0-alpha/
├── dist/
│   └── extension.js (5.4KB) — Backend compilado
├── resources/
│   └── icon.svg — Ícone do painel
└── package.json — Manifesto da extensão
```

---

## 🎮 Como Usar Após Instalar

### Via Command Palette

```
Ctrl+Shift+P → "Open View Container: Painel Execução"
```

### Via Activity Bar

```
Clique no ícone "Painel Execução" na Activity Bar esquerda
```

### Ver Eventos

- **Demo:** 4 eventos pré-carregados
- **Real:** Execute ação no Claude Code
- Cada evento mostra:
  - Timestamp
  - Nome da ferramenta (Read, Bash, Grep, etc.)
  - Entrada (tool_input) — expandível
  - Saída (tool_response) — expandível

---

## 🔒 Segurança

✅ Validado:
- Caminhos privados reduzidos automaticamente
- Tokens e passwords removidos
- Armazenamento local apenas
- Nenhuma telemetria

---

## 🐛 Troubleshooting

### Painel não aparece

```bash
# Reconstruir
npm run ext:build

# F5 em VS Code
# View → Open View Container "Painel Execução"
```

### Eventos não aparecem

```bash
# Verificar dados
node reader.js painel-execucao

# Reset demo
npm run collect:demo
npm run collect:read
```

### Erro de compilação

```bash
cd extension
npm run build
# Deve gerar: dist/extension.js (5.4KB+)
```

---

## 📞 Próximas Etapas

1. ✅ **Instalar:** Use Opção 1 ou 2 acima
2. ✅ **Testar:** npm run collect:demo
3. ✅ **Publicar:** Criar repo em GitHub e fazer push
4. 📊 **Visualização:** Grafo de dependências (próxima fase)
5. 🔄 **Comparação:** Diff entre execuções (próxima fase)

---

## 📞 Links

- **Local:** C:\Users\alois\OneDrive\Documentos\Projetos\estudos\painel-execucao
- **Código:** collector.js + extension/ + webview/
- **Docs:** README.md, USAGE.md, DELIVERY.md
- **GitHub:** https://github.com/alosiolemos/painel-execucao (depois de publicar)

---

**Tudo pronto. Escolha uma opção acima e comece a usar!** 🎉
