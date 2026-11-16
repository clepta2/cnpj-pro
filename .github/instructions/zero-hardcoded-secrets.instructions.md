---
applyTo: "**/*"
priority: 100
---

# 🛡️ REGRA DE OURO INVIOLÁVEL: ZERO HARDCODED SECRETS

## 1. PROIBIÇÃO ABSOLUTA DE CHAVES E TOKENS NO CÓDIGO
É **terminantemente proibido** inserir qualquer valor literal de credencial, chave de API, token de acesso, JWT ou senha em arquivos de código-fonte, HTML, JSON, scripts de exemplo ou documentação.

### Padrões Específicos Estritamente Proibidos:
- Tokens de IA com prefixo: `sk-...` (OpenAI, OmniRouter, OpenRouter)
- Tokens Supabase JWT: `eyJhbGciOi...` (Anon Key ou Service Role Key)
- Tokens Cloudflare: `cfat_...`
- Chaves Google AI: `AIzaSy...`
- Chaves Groq: `gsk_...`
- Tokens GitHub: `ghp_...`
- Strings de conexão PostgreSQL com credenciais: `postgres://usuario:senha@...`
- Chaves privadas: `-----BEGIN PRIVATE KEY-----`

## 2. ORIGEM DAS CREDENCIAIS (ONDE DEVEM FICAR)
1. **Em ambiente de desenvolvimento local:** Use exclusivamente arquivos `.env` ou `.dev.vars` (que NUNCA são commitados no Git).
2. **Em código JavaScript/TypeScript:** Acesse apenas através de `process.env.NOME_VARIAVEL` ou `env.NOME_VARIAVEL`.
3. **Em clientes web / frontend:** Leia de `window.SITE_CONFIG` ou rota proxy autenticada do backend. NUNCA insira chaves privadas no HTML.
4. **Em arquivos de documentação / exemplos:** Use estritamente placeholders genéricos como:
   - `pnt_live_SEU_TOKEN_AQUI`
   - `sk-seu-token-aqui`
   - `cfat_seu_token_aqui`

## 3. BLOQUEIO AUTOMÁTICO EM CASCATA
Todo commit e push neste repositório é fiscalizado por 3 camadas ativas:
1. **Git Pre-Commit Hook:** O Git rejeita o commit localmente se qualquer segredo for detectado.
2. **Scanner Local:** `node scripts/security-guard.js`.
3. **GitHub Actions CI:** A esteira de CI no GitHub quebra imediatamente com falha se houver credenciais expostas.
