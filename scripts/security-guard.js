/**
 * security-guard.js — Guarda de Segurança e Bloqueio de Segredos da Ponte API
 * Impede terminantemente commits ou pushes contendo tokens, chaves ou senhas.
 *
 * Pode ser executado:
 * 1. Como Git Pre-Commit Hook (.git/hooks/pre-commit)
 * 2. Em pipelines de CI/CD (GitHub Actions)
 * 3. Como auditor manual (node scripts/security-guard.js)
 *
 * @license MIT
 */

import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const FORBIDDEN_FILES = [
  /^\.env$/i,
  /^\.env\.(local|production|staging|test)$/i,
  /^\.dev\.vars$/i,
  /\.key$/i,
  /\.pem$/i,
  /\.pfx$/i,
  /\.cert$/i,
  /id_rsa/i
];

const SECRET_PATTERNS = [
  {
    nome: 'Supabase JWT / Secret Key',
    regex: /eyJhbGciOi[a-zA-Z0-9_\-]+\.[a-zA-Z0-9_\-]+\.[a-zA-Z0-9_\-]+/g
  },
  {
    nome: 'Chave de API de IA (sk-...)',
    regex: /sk-[a-zA-Z0-9_\-]{20,}/g
  },
  {
    nome: 'Cloudflare API Token (cfat_...)',
    regex: /cfat_[a-zA-Z0-9_\-]{20,}/g
  },
  {
    nome: 'Google API Key (AIzaSy...)',
    regex: /AIzaSy[a-zA-Z0-9_\-]{33}/g
  },
  {
    nome: 'GitHub Access Token (ghp_...)',
    regex: /ghp_[a-zA-Z0-9_\-]{20,}/g
  },
  {
    nome: 'Groq API Key (gsk_...)',
    regex: /gsk_[a-zA-Z0-9_\-]{20,}/g
  },
  {
    nome: 'OpenRouter Key (sk-or-v1-...)',
    regex: /sk-or-v1-[a-zA-Z0-9_\-]{20,}/g
  },
  {
    nome: 'String de Conexão com Senha de Banco de Dados',
    regex: /postgres(?:ql)?:\/\/[a-zA-Z0-9_\-\.]+:[^@\s]+@[a-zA-Z0-9_\-\.]+/g
  },
  {
    nome: 'Chave Privada Criptográfica (RSA/SSH/PEM)',
    regex: /-----BEGIN [A-Z ]*PRIVATE KEY-----/g
  }
];

// Valores permitidos de mock / documentação / placeholders
function isPlaceholder(val) {
  const v = val.toLowerCase();
  return (
    v.includes('dummy') ||
    v.includes('example') ||
    v.includes('mock') ||
    v.includes('placeholder') ||
    v.includes('change-me') ||
    v.includes('sua_chave') ||
    v.includes('sua-chave') ||
    v.includes('seu_token') ||
    v.includes('seu-token') ||
    v.includes('your_token') ||
    v.includes('your-key') ||
    v.includes('pnt_test_mock') ||
    v.startsWith('sk-diffai-master-key') ||
    v.startsWith('sk-quest') // skill id do DiffAI
  );
}

export function executarAuditoriaSeguranca(repoDir = process.cwd()) {
  let violacoes = 0;
  const erros = [];

  // 1. Arquivos no Git
  let arquivos = [];
  try {
    const out = execSync('git ls-files', { cwd: repoDir, encoding: 'utf8' });
    arquivos = out.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
  } catch (e) {
    arquivos = [];
  }

  // Se estiver rodando como pre-commit, verifica arquivos em staging
  try {
    const staged = execSync('git diff --cached --name-only', { cwd: repoDir, encoding: 'utf8' });
    const stagedFiles = staged.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
    arquivos = [...new Set([...arquivos, ...stagedFiles])];
  } catch (_) {}

  for (const relPath of arquivos) {
    const baseName = path.basename(relPath);

    // Ignora o próprio script de auditoria e arquivos de regras/instruções que documentam os padrões proibidos
    if (baseName === 'security-guard.js' || baseName === 'audit-secrets.js' || relPath.endsWith('.instructions.md')) continue;

    // A. Verifica arquivos proibidos no Git
    for (const reg of FORBIDDEN_FILES) {
      if (reg.test(baseName)) {
        violacoes++;
        erros.push(`[ARQUIVO PROIBIDO] ${relPath} não pode ser versionado no Git.`);
      }
    }

    // B. Verifica conteúdo dos arquivos de código
    const absPath = path.join(repoDir, relPath);
    if (!fs.existsSync(absPath)) continue;

    try {
      const stat = fs.statSync(absPath);
      if (stat.size > 2 * 1024 * 1024) continue; // Pula arquivos gigantes (>2MB)

      const content = fs.readFileSync(absPath, 'utf8');

      for (const pattern of SECRET_PATTERNS) {
        const matches = content.match(pattern.regex);
        if (matches) {
          for (const m of matches) {
            if (!isPlaceholder(m)) {
              violacoes++;
              const mascarado = m.length > 12 ? `${m.slice(0, 8)}...${m.slice(-4)}` : '******';
              erros.push(`[SEGREDO DETECTADO] ${pattern.nome} em "${relPath}" -> ${mascarado}`);
            }
          }
        }
      }
    } catch (_) {}
  }

  return { ok: violacoes === 0, violacoes, erros };
}

// Execução Direta via CLI
if (import.meta.url === `file:///${process.argv[1].replace(/\\/g, '/')}`) {
  console.log('🛡️ Executando Guarda de Segurança (Zero Hardcoded Secrets)...\n');
  const res = executarAuditoriaSeguranca(process.cwd());

  if (!res.ok) {
    console.error('========================================================================');
    console.error('🚨 VIOLAÇÃO DE SEGURANÇA DETECTADA: O COMMIT / BUILD FOI ABORTADO!    ');
    console.error('========================================================================\n');
    res.erros.forEach(e => console.error(`  ❌ ${e}`));
    console.error('\n⚠️ REGRA INVIOLÁVEL:');
    console.error('  1. NUNCA coloque tokens reais em código, HTML, scripts ou .example.');
    console.error('  2. Todas as chaves devem vir de variáveis de ambiente (process.env.*).');
    console.error('  3. Arquivos .env e .dev.vars devem estar sempre no .gitignore.\n');
    process.exit(1);
  } else {
    console.log('✅ Guarda de Segurança: NENHUM segredo detectado. O código está 100% seguro.');
    process.exit(0);
  }
}
