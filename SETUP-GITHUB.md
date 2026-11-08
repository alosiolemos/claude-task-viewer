# Publicar no GitHub

O código está pronto. Escolha um método para publicar:

## Opção 1: GitHub Web + Git CLI (Recomendado)

```bash
# 1. Criar repositório vazio em https://github.com/new
#    - Nome: painel-execucao
#    - Descrição: Painel local em VS Code para auditar execução do Claude Code
#    - Público: ✓
#    - NÃO inicialize com README/LICENSE

# 2. Fazer push do código local
cd C:\Users\alois\OneDrive\Documentos\Projetos\estudos\painel-execucao

git remote set-url origin https://github.com/alosiolemos/painel-execucao.git
git branch -M main
git push -u origin main

# Pronto! Repositório está público.
```

## Opção 2: GitHub CLI (Se autenticado)

```bash
gh auth login                          # Se não fez ainda
gh repo create painel-execucao \
  --public \
  --source=. \
  --remote=origin \
  --push \
  --description "Painel local em VS Code para auditar execução do Claude Code"
```

## Opção 3: SSH (Se chave SSH configurada)

```bash
ssh-keyscan github.com >> ~/.ssh/known_hosts

git remote set-url origin git@github.com:alosiolemos/painel-execucao.git
git push -u origin main
```

## Verificar Publicação

```bash
# Confirmar que repo está público
open https://github.com/alosiolemos/painel-execucao

# Ou via CLI
gh repo view alosiolemos/painel-execucao
```

---

**Resultado esperado:**
- Repositório público em `https://github.com/alosiolemos/painel-execucao`
- 8+ commits com histórico completo
- Pronto para clone e instalação

**Conteúdo publicado:**
- ✅ collector.js (backend)
- ✅ extension/ (VS Code extension)
- ✅ webview/ (React + HTML)
- ✅ Documentação completa
- ✅ demo-events.jsonl (testes)
- ✅ Sem .env ou secrets
