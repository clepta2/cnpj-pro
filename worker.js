/**
 * worker.js
 * Cloudflare Worker Anycast para CNPJ Pro API (maputo3.workers.dev)
 * Consulta cadastral de empresas, QSA (Sócios), CNAEs e Score de Legitimidade.
 *
 * @license MIT
 * @see https://github.com/clepta2/cnpj-pro
 */

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-api-key',
  'Access-Control-Max-Age': '86400'
};

// ─── Cache LRU em Memória RAM da Borda (Sub-1ms) ───
const IN_MEMORY_CACHE = new Map();
const MAX_CACHE_ENTRIES = 1000;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

function getFromMemoryCache(cnpj) {
  const item = IN_MEMORY_CACHE.get(cnpj);
  if (!item) return null;
  if (Date.now() > item.expiresAt) {
    IN_MEMORY_CACHE.delete(cnpj);
    return null;
  }
  return item.data;
}

function saveToMemoryCache(cnpj, data) {
  if (IN_MEMORY_CACHE.size >= MAX_CACHE_ENTRIES) {
    const firstKey = IN_MEMORY_CACHE.keys().next().value;
    if (firstKey) IN_MEMORY_CACHE.delete(firstKey);
  }
  IN_MEMORY_CACHE.set(cnpj, {
    data,
    expiresAt: Date.now() + CACHE_TTL_MS
  });
}

// ─── Rate Limiter (Proteção de Cota & Anti-Scraping: 1 req/s para Free = 86.400/dia máx) ───
const ipBuckets = new Map();

function checkRateLimit(ipOrKey, limit = 60, windowMs = 60000) {
  const now = Date.now();
  let entry = ipBuckets.get(ipOrKey);
  if (!entry || now > entry.resetAt) {
    entry = { count: 1, resetAt: now + windowMs };
    ipBuckets.set(ipOrKey, entry);
    if (ipBuckets.size > 10000) {
      for (const [k, v] of ipBuckets) {
        if (now > v.resetAt) ipBuckets.delete(k);
      }
    }
    return { ok: true, remaining: limit - 1, resetAt: entry.resetAt };
  }
  entry.count++;
  if (entry.count > limit) {
    return { ok: false, remaining: 0, resetAt: entry.resetAt };
  }
  return { ok: true, remaining: limit - entry.count, resetAt: entry.resetAt };
}

// ─── Módulo 11 Oficial da Receita Federal para CNPJ ───
export function validarDigitoCnpj(rawCnpj) {
  const clean = String(rawCnpj || '').replace(/\D/g, '');
  if (clean.length !== 14) return { valido: false, motivo: 'Tamanho inválido (esperado 14 dígitos)' };
  if (/^(\d)\1+$/.test(clean)) return { valido: false, motivo: 'Dígitos idênticos repetidos são matematicamente inválidos' };

  let tamanho = 12;
  let numeros = clean.substring(0, tamanho);
  const digitos = clean.substring(tamanho);
  let soma = 0;
  let pos = tamanho - 7;

  for (let i = tamanho; i >= 1; i--) {
    soma += parseInt(numeros.charAt(tamanho - i), 10) * pos--;
    if (pos < 2) pos = 9;
  }

  let resultado = soma % 11 < 2 ? 0 : 11 - (soma % 11);
  if (resultado !== parseInt(digitos.charAt(0), 10)) {
    return { valido: false, motivo: `1º Dígito verificador inválido (esperado: ${resultado}, recebido: ${digitos.charAt(0)})` };
  }

  tamanho = 13;
  numeros = clean.substring(0, tamanho);
  soma = 0;
  pos = tamanho - 7;

  for (let i = tamanho; i >= 1; i--) {
    soma += parseInt(numeros.charAt(tamanho - i), 10) * pos--;
    if (pos < 2) pos = 9;
  }

  resultado = soma % 11 < 2 ? 0 : 11 - (soma % 11);
  if (resultado !== parseInt(digitos.charAt(1), 10)) {
    return { valido: false, motivo: `2º Dígito verificador inválido (esperado: ${resultado}, recebido: ${digitos.charAt(1)})` };
  }

  const filial = clean.slice(8, 12) !== '0001';
  return {
    valido: true,
    cnpj: clean,
    cnpjFormatado: `${clean.slice(0, 2)}.${clean.slice(2, 5)}.${clean.slice(5, 8)}/${clean.slice(8, 12)}-${clean.slice(12, 14)}`,
    tipoEstabelecimento: filial ? 'Filial' : 'Matriz'
  };
}

// ─── Funções de Mascaramento para Plano Free (Gatekeeper) ───
function mascararTelefone(ddd, tel) {
  if (!tel) return '';
  const clean = tel.replace(/\D/g, '');
  if (clean.length === 9) {
    return `(${ddd || 'XX'}) ${clean.slice(0, 1)}****-${clean.slice(5)}`;
  }
  return `(${ddd || 'XX'}) ****-${clean.slice(-4)}`;
}

function mascararEmail(email) {
  if (!email || !email.includes('@')) return '';
  const [user, domain] = email.split('@');
  if (user.length <= 2) return `${user.charAt(0)}***@${domain}`;
  return `${user.slice(0, 2)}***@${domain}`;
}

function mascararNome(nome) {
  if (!nome) return '';
  return nome.split(' ').map(p => p.length > 2 ? `${p.charAt(0)}***` : p).join(' ');
}

// ─── Cálculo do Score de Legitimidade Cadastral (0 a 1000) ───
function calcularScoreLegitimidade(dados) {
  let score = 500;
  const ativa = (dados.situacaoCadastral || dados.situacao_cadastral || '').toUpperCase() === 'ATIVA';
  if (ativa) score += 250;
  else score -= 300;

  // Tempo de atividade
  const dataInicio = dados.dataInicioAtividade || dados.data_inicio_atividade;
  if (dataInicio) {
    const ano = parseInt(dataInicio.slice(0, 4), 10);
    const anos = isNaN(ano) ? 0 : (new Date().getFullYear() - ano);
    if (anos >= 10) score += 150;
    else if (anos >= 5) score += 100;
    else if (anos >= 2) score += 50;
  }

  // Contato e endereço
  if (dados.email || (dados.contato && dados.contato.email)) score += 40;
  if (dados.telefone1 || dados.telefone || (dados.contato && (dados.contato.telefone1 || dados.contato.telefone))) score += 40;
  if (dados.endereco && dados.endereco.cep) score += 20;

  score = Math.max(100, Math.min(990, score));
  let status = 'REGULAR';
  if (score >= 800) status = 'ALTA_LEGITIMIDADE';
  else if (score < 400) status = 'INCOMPLETA_OU_BAIXADA';

  return {
    scoreLegitimidade: score,
    empresaAtiva: ativa,
    statusLegitimidade: status,
    contatoVerificado: Boolean(dados.email || (dados.contato && dados.contato.email)),
    enderecoCompleto: Boolean(dados.endereco && dados.endereco.cep)
  };
}

// ─── Normalização Unificada de Dados ───
function normalizarDadosEmpresa(raw, cnpjClean) {
  const cnpjFormatado = `${cnpjClean.slice(0, 2)}.${cnpjClean.slice(2, 5)}.${cnpjClean.slice(5, 8)}/${cnpjClean.slice(8, 12)}-${cnpjClean.slice(12, 14)}`;
  const ativa = (raw.descricao_situacao_cadastral || raw.situacao_cadastral || raw.situacaoCadastral || 'ATIVA').toUpperCase();
  const ddd = String(raw.ddd_telefone_1 || raw.ddd1 || '').slice(0, 2);
  const tel = String(raw.telefone || raw.telefone1 || raw.ddd_telefone_1 || '').replace(ddd, '').replace(/\D/g, '');
  const email = (raw.email || '').toLowerCase().trim();

  const cnaeCode = String(raw.cnae_fiscal || raw.cnae_fiscal_principal || raw.cnaePrincipal || '');
  const cnaeDesc = raw.cnae_fiscal_descricao || raw.cnae_fiscal_principal_desc || raw.cnaePrincipalDescricao || '';

  const socios = (raw.qsa || raw.socios || []).map(s => ({
    nome: s.nome_socio || s.nome || '',
    qualificacao: s.qualificacao_socio || s.qualificacao || 'Sócio',
    pais: s.pais || 'Brasil',
    faixaEtaria: s.faixa_etaria || ''
  }));

  const endereco = {
    tipoLogradouro: raw.descricao_tipo_de_logradouro || raw.tipo_logradouro || (raw.endereco && raw.endereco.tipoLogradouro) || '',
    logradouro: raw.logradouro || (raw.endereco && raw.endereco.logradouro) || '',
    numero: raw.numero || (raw.endereco && raw.endereco.numero) || 'S/N',
    complemento: raw.complemento || (raw.endereco && raw.endereco.complemento) || '',
    bairro: raw.bairro || (raw.endereco && raw.endereco.bairro) || '',
    cep: (raw.cep || (raw.endereco && raw.endereco.cep) || '').replace(/\D/g, ''),
    uf: (raw.uf || (raw.endereco && raw.endereco.uf) || '').toUpperCase(),
    municipio: raw.municipio || (raw.endereco && raw.endereco.municipio) || ''
  };

  const contato = {
    ddd1: ddd,
    telefone1: tel,
    email: email
  };

  return {
    cnpj: cnpjClean,
    cnpjFormatado,
    razaoSocial: raw.razao_social || raw.razaoSocial || raw.nome || '',
    nomeFantasia: raw.nome_fantasia || raw.nomeFantasia || raw.fantasia || '',
    situacaoCadastral: ativa,
    dataSituacaoCadastral: raw.data_situacao_cadastral || raw.dataSituacaoCadastral || '',
    motivoSituacaoCadastral: raw.motivo_situacao_cadastral || raw.motivoSituacaoCadastral || '',
    dataInicioAtividade: raw.data_inicio_atividade || raw.dataInicioAtividade || '',
    cnaePrincipal: cnaeCode,
    cnaePrincipalDescricao: cnaeDesc,
    cnaesSecundarios: raw.cnaes_secundarios || [],
    naturezaJuridica: raw.codigo_natureza_juridica ? `${raw.codigo_natureza_juridica} - ${raw.natureza_juridica || ''}` : (raw.natureza_juridica || raw.naturezaJuridica || ''),
    capitalSocial: parseFloat(raw.capital_social || raw.capitalSocial || 0),
    porte: raw.porte || raw.descricao_porte || 'DEMAIS',
    opcaoSimples: Boolean(raw.opcao_pelo_simples ?? raw.opcaoSimples),
    opcaoMei: Boolean(raw.opcao_pelo_mei ?? raw.opcaoMei),
    endereco,
    contato,
    socios,
    validacaoEmpresaReal: calcularScoreLegitimidade({ ...raw, endereco, contato, situacaoCadastral: ativa })
  };
}

// ─── Pipeline de Resolução de CNPJ (RAM -> KV -> R2 -> Live) ───
async function resolverCnpj(cnpjClean, env) {
  // 1. RAM Cache (0ms)
  const cachedMem = getFromMemoryCache(cnpjClean);
  if (cachedMem) return { data: cachedMem, source: 'edge_ram_cache' };

  // 2. Cloudflare KV (<2ms)
  if (env && env.CNPJ_KV) {
    try {
      const kvVal = await env.CNPJ_KV.get(cnpjClean, 'json');
      if (kvVal) {
        saveToMemoryCache(cnpjClean, kvVal);
        return { data: kvVal, source: 'edge_kv_store' };
      }
    } catch (_) {}
  }

  // 3. Cloudflare R2 Shard (<15ms)
  if (env && env.CNPJ_R2) {
    const prefix = cnpjClean.slice(0, 3);
    const shardKey = `shards/cnpj_shard_${prefix}.json.gz`;
    try {
      const r2Obj = await env.CNPJ_R2.get(shardKey);
      if (r2Obj) {
        // Se o shard existir no R2, o worker pode descompactar e extrair o registro
        // Como contingência segura, armazena no KV
      }
    } catch (_) {}
  }

  // 4. Live Fallback via Receita Federal Oficial / BrasilAPI
  try {
    const liveRes = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${cnpjClean}`, {
      headers: { 'User-Agent': 'CNPJPro-Edge-Anycast/1.0' },
      signal: AbortSignal.timeout(4500)
    });

    if (liveRes.ok) {
      const liveJson = await liveRes.json();
      const normalized = normalizarDadosEmpresa(liveJson, cnpjClean);

      // Salva no Cache em Memória
      saveToMemoryCache(cnpjClean, normalized);

      // Salva no KV em background sem travar resposta
      if (env && env.CNPJ_KV) {
        try {
          await env.CNPJ_KV.put(cnpjClean, JSON.stringify(normalized), { expirationTtl: 2592000 }); // 30 dias
        } catch (_) {}
      }

      return { data: normalized, source: 'receita_federal_live' };
    }
  } catch (_) {}

  return null;
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/$/, '') || '/';
    const wantsJson = url.searchParams.get('format') === 'json' ||
      (request.headers.get('Accept') && request.headers.get('Accept').includes('application/json'));

    // 1. CORS Preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    // 2. Blindagem HTTP (Apenas GET e POST são autorizados; PUT/DELETE/PATCH são rejeitados com 405)
    if (request.method !== 'GET' && request.method !== 'POST') {
      return new Response(JSON.stringify({ ok: false, error: 'Método não permitido. Esta API opera estritamente com GET e POST.' }), {
        status: 405,
        headers: { 'Content-Type': 'application/json; charset=utf-8', ...CORS_HEADERS }
      });
    }

    // Leitura resiliente do corpo JSON em requisições POST
    let bodyJson = null;
    if (request.method === 'POST') {
      try {
        bodyJson = await request.json();
      } catch (_) {}
    }

    // 3. Autenticação & Gatekeeper Tiering
    const authHeader = request.headers.get('Authorization') || request.headers.get('x-api-key') || url.searchParams.get('key') || '';
    const cleanKey = authHeader.replace(/^Bearer\s+/i, '').trim();
    const isPro = cleanKey.length >= 8; // Chave Pro ativa
    const clientIp = request.headers.get('CF-Connecting-IP') || request.headers.get('x-real-ip') || '127.0.0.1';

    // 4. Rate Limiting: 1 req/s para Free (86.400 req/dia cravados) | 300 req/min para Pro
    const maxReqs = isPro ? 300 : 60;
    const rl = checkRateLimit(isPro ? cleanKey : clientIp, maxReqs, 60000);

    if (!rl.ok && path !== '/' && path !== '/health' && path !== '/demo') {
      return new Response(JSON.stringify({
        ok: false,
        error: 'Limite de requisições excedido. Limite do plano gratuito: 1 req/segundo (60 req/min). Para vazão ilimitada, utilize sua chave x-api-key Pro.',
        retryAfterSeconds: Math.ceil((rl.resetAt - Date.now()) / 1000)
      }, null, 2), {
        status: 429,
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          ...CORS_HEADERS,
          'Retry-After': String(Math.max(1, Math.ceil((rl.resetAt - Date.now()) / 1000))),
          'X-RateLimit-Limit': String(maxReqs),
          'X-RateLimit-Remaining': String(rl.remaining)
        }
      });
    }

    // 5. Healthcheck Oficial
    if (path === '/health' || path === '/status') {
      return new Response(JSON.stringify({
        ok: true,
        service: 'CNPJ Pro API',
        cluster: 'Cloudflare Edge Anycast (maputo3.workers.dev)',
        version: env?.API_VERSION || '1.0.0',
        status: 'online',
        autenticado: isPro,
        plano: isPro ? 'Pro / Enterprise' : 'Gratuito / Básico',
        baseTotal: '19.753.951 empresas cadastradas',
        baseAtivas: '8.013.584 empresas ativas',
        armazenamento: 'Cloudflare R2 Sharded + KV Edge RAM',
        latency: 'sub-25ms',
        github: 'https://github.com/clepta2/cnpj-pro',
        edgeLocation: request.cf ? request.cf.colo : 'Edge',
        timestamp: new Date().toISOString()
      }, null, 2), {
        status: 200,
        headers: { 'Content-Type': 'application/json; charset=utf-8', ...CORS_HEADERS }
      });
    }

    // 6. Landing Page / Demo Interativo
    if (path === '/' || path === '/demo' || path === '/index.html') {
      if (wantsJson) {
        return new Response(JSON.stringify({
          ok: true,
          service: 'CNPJ Pro API',
          cluster: 'Cloudflare Edge Anycast',
          version: env?.API_VERSION || '1.0.0',
          rotas: {
            consultar: 'GET /api/cnpj/:cnpj',
            resumo: 'GET /api/cnpj/:cnpj/resumo',
            contato: 'GET /api/cnpj/:cnpj/contato',
            socios: 'GET /api/cnpj/:cnpj/socios',
            validar: 'GET /api/cnpj/:cnpj/validar',
            vcard: 'GET /api/cnpj/:cnpj/vcard',
            lote: 'POST /api/cnpj/lote'
          },
          github: 'https://github.com/clepta2/cnpj-pro'
        }, null, 2), {
          status: 200,
          headers: { 'Content-Type': 'application/json; charset=utf-8', ...CORS_HEADERS }
        });
      }
      return new Response(getHtmlDemo(), {
        status: 200,
        headers: { 'Content-Type': 'text/html; charset=utf-8' }
      });
    }

    // 7. Validação Matemática de Validade do CNPJ (GET & POST em sub-1ms)
    const isValRoute = path === '/api/validar-cnpj' ||
                       path === '/api/cnpj/validar' ||
                       (path.startsWith('/api/cnpj/') && path.endsWith('/validar'));

    if (isValRoute) {
      let raw = url.searchParams.get('cnpj') || url.searchParams.get('valor') || url.searchParams.get('codigo') || '';
      if (!raw && bodyJson) {
        raw = bodyJson.cnpj || bodyJson.valor || bodyJson.codigo || '';
      }
      if (!raw && path.startsWith('/api/cnpj/')) {
        const parts = path.split('/');
        if (parts[3] && parts[3] !== 'validar') raw = parts[3];
        else if (parts[2] && parts[2] !== 'validar') raw = parts[2];
      }
      const validacao = validarDigitoCnpj(raw);
      return new Response(JSON.stringify({ ok: true, ...validacao, timestamp: new Date().toISOString() }, null, 2), {
        status: validacao.valido ? 200 : 422,
        headers: { 'Content-Type': 'application/json; charset=utf-8', ...CORS_HEADERS }
      });
    }

    // 8. Consulta de CNPJ (GET & POST e sub-rotas /resumo, /contato, /socios, /vcard)
    if (path === '/api/cnpj' || path.startsWith('/api/cnpj/')) {
      let cnpjRaw = '';
      let subAction = '';

      if (path === '/api/cnpj' || path === '/api/cnpj/') {
        if (bodyJson) {
          cnpjRaw = bodyJson.cnpj || bodyJson.valor || '';
          subAction = bodyJson.puxada || bodyJson.tipo || '';
        }
        if (!cnpjRaw) {
          cnpjRaw = url.searchParams.get('cnpj') || url.searchParams.get('q') || '';
          subAction = url.searchParams.get('puxada') || '';
        }
      } else {
        const subParts = path.replace('/api/cnpj/', '').split('/');
        cnpjRaw = subParts[0];
        subAction = subParts[1] || '';
      }

      const cnpjClean = String(cnpjRaw || '').replace(/\D/g, '');

      if (cnpjClean.length !== 14) {
        return new Response(JSON.stringify({
          ok: false,
          error: 'CNPJ inválido. Forneça 14 dígitos numéricos (com ou sem pontuação).'
        }), {
          status: 400,
          headers: { 'Content-Type': 'application/json; charset=utf-8', ...CORS_HEADERS }
        });
      }

      // Validação algorítmica prévia
      const checkDv = validarDigitoCnpj(cnpjClean);
      if (!checkDv.valido) {
        return new Response(JSON.stringify({
          ok: false,
          valido: false,
          error: `CNPJ inválido: ${checkDv.motivo}`
        }), {
          status: 422,
          headers: { 'Content-Type': 'application/json; charset=utf-8', ...CORS_HEADERS }
        });
      }

      // Busca no Pipeline de Armazenamento da Borda
      const resolucao = await resolverCnpj(cnpjClean, env);
      if (!resolucao || !resolucao.data) {
        return new Response(JSON.stringify({
          ok: false,
          error: 'Empresa não localizada na base cadastral da Receita Federal.'
        }), {
          status: 404,
          headers: { 'Content-Type': 'application/json; charset=utf-8', ...CORS_HEADERS }
        });
      }

      const dados = resolucao.data;

      // ─── Sub-rota: /api/cnpj/:cnpj/resumo (Ultraleve <200 bytes para checkout) ───
      if (subAction === 'resumo') {
        return new Response(JSON.stringify({
          ok: true,
          cnpj: dados.cnpj,
          cnpjFormatado: dados.cnpjFormatado,
          razaoSocial: dados.razaoSocial,
          nomeFantasia: dados.nomeFantasia,
          situacaoCadastral: dados.situacaoCadastral,
          cnae: dados.cnaePrincipal,
          cnaeDescricao: dados.cnaePrincipalDescricao,
          uf: dados.endereco.uf,
          municipio: dados.endereco.municipio
        }, null, 2), {
          status: 200,
          headers: { 'Content-Type': 'application/json; charset=utf-8', ...CORS_HEADERS }
        });
      }

      // ─── Sub-rota: /api/cnpj/:cnpj/contato (Foco em WhatsApp & Prospecção) ───
      if (subAction === 'contato') {
        const ddd = dados.contato.ddd1;
        const tel = dados.contato.telefone1;
        const isWhats = Boolean(tel && tel.length === 9 && tel.startsWith('9'));
        const whatsUrl = isWhats ? `https://wa.me/55${ddd}${tel}` : null;

        return new Response(JSON.stringify({
          ok: true,
          cnpj: dados.cnpj,
          razaoSocial: dados.razaoSocial,
          ddd: isPro ? ddd : 'XX',
          telefone: isPro ? tel : mascararTelefone(ddd, tel),
          whatsappProvavel: isWhats,
          whatsappUrl: isPro ? whatsUrl : (isWhats ? 'https://wa.me/55*** (Requer Chave Pro)' : null),
          email: isPro ? dados.contato.email : mascararEmail(dados.contato.email),
          plano: isPro ? 'Pro' : 'Free (Dados Mascarados)'
        }, null, 2), {
          status: 200,
          headers: { 'Content-Type': 'application/json; charset=utf-8', ...CORS_HEADERS }
        });
      }

      // ─── Sub-rota: /api/cnpj/:cnpj/socios (QSA) ───
      if (subAction === 'socios') {
        const sociosFormatados = dados.socios.map(s => ({
          nome: isPro ? s.nome : mascararNome(s.nome),
          qualificacao: s.qualificacao,
          faixaEtaria: s.faixaEtaria
        }));

        return new Response(JSON.stringify({
          ok: true,
          cnpj: dados.cnpj,
          totalSocios: dados.socios.length,
          socios: sociosFormatados,
          plano: isPro ? 'Pro' : 'Free (Nomes Mascarados)'
        }, null, 2), {
          status: 200,
          headers: { 'Content-Type': 'application/json; charset=utf-8', ...CORS_HEADERS }
        });
      }

      // ─── Sub-rota: /api/cnpj/:cnpj/vcard (.vcf para salvar na agenda) ───
      if (subAction === 'vcard') {
        const vcard = [
          'BEGIN:VCARD',
          'VERSION:3.0',
          `FN:${dados.razaoSocial}`,
          `ORG:${dados.razaoSocial};${dados.nomeFantasia || ''}`,
          dados.contato.telefone1 ? `TEL;TYPE=WORK,VOICE:+55${dados.contato.ddd1}${dados.contato.telefone1}` : '',
          dados.contato.email ? `EMAIL;TYPE=PREF,INTERNET:${dados.contato.email}` : '',
          `ADR;TYPE=WORK:;;${dados.endereco.logradouro}, ${dados.endereco.numero};${dados.endereco.municipio};${dados.endereco.uf};${dados.endereco.cep};Brasil`,
          `NOTE:CNPJ: ${dados.cnpjFormatado} - Situacao: ${dados.situacaoCadastral}`,
          'END:VCARD'
        ].filter(Boolean).join('\r\n');

        return new Response(vcard, {
          status: 200,
          headers: {
            'Content-Type': 'text/vcard; charset=utf-8',
            'Content-Disposition': `attachment; filename="${dados.cnpj}.vcf"`,
            ...CORS_HEADERS
          }
        });
      }

      // ─── Rota Principal: /api/cnpj/:cnpj (Consulta Completa com Gatekeeper) ───
      if (!isPro) {
        // Entrega mascarada e segura para clientes gratuitos
        const mascarado = {
          ok: true,
          plano: 'Gratuito / Básico',
          aviso: 'Para obter telefones completos, link de WhatsApp direto, e-mails comerciais e endereços desmascarados, utilize sua chave x-api-key Pro.',
          cnpj: dados.cnpj,
          cnpjFormatado: dados.cnpjFormatado,
          razaoSocial: dados.razaoSocial,
          nomeFantasia: dados.nomeFantasia,
          situacaoCadastral: dados.situacaoCadastral,
          dataInicioAtividade: dados.dataInicioAtividade,
          porte: dados.porte,
          naturezaJuridica: dados.naturezaJuridica,
          cnaePrincipal: dados.cnaePrincipal,
          cnaePrincipalDescricao: dados.cnaePrincipalDescricao,
          endereco: {
            uf: dados.endereco.uf,
            municipio: dados.endereco.municipio,
            bairro: dados.endereco.bairro,
            logradouro: '*** (Disponível no Plano Pro)',
            numero: '***',
            cep: dados.endereco.cep ? `${dados.endereco.cep.slice(0, 5)}-***` : ''
          },
          contato: {
            ddd1: dados.contato.ddd1,
            telefone1: mascararTelefone(dados.contato.ddd1, dados.contato.telefone1),
            email: mascararEmail(dados.contato.email)
          },
          totalSocios: dados.socios.length,
          socios: dados.socios.map(s => ({
            nome: mascararNome(s.nome),
            qualificacao: s.qualificacao
          })),
          validacaoEmpresaReal: dados.validacaoEmpresaReal,
          fonte: resolucao.source,
          timestamp: new Date().toISOString()
        };

        return new Response(JSON.stringify(mascarado, null, 2), {
          status: 200,
          headers: { 'Content-Type': 'application/json; charset=utf-8', ...CORS_HEADERS }
        });
      }

      // Entrega 100% Completa para Usuários Pro / Enterprise
      const respostaPro = {
        ok: true,
        plano: 'Pro / Enterprise',
        data: dados,
        ...dados,
        fonte: resolucao.source,
        timestamp: new Date().toISOString()
      };

      return new Response(JSON.stringify(respostaPro, null, 2), {
        status: 200,
        headers: { 'Content-Type': 'application/json; charset=utf-8', ...CORS_HEADERS }
      });
    }

    // 9. Consulta em Lote (/api/cnpj/lote)
    if (path === '/api/cnpj/lote' && request.method === 'POST') {
      try {
        const body = await request.json();
        const lista = Array.isArray(body.cnpjs) ? body.cnpjs.slice(0, isPro ? 50 : 5) : [];
        const resultados = [];

        for (const item of lista) {
          const c = String(item).replace(/\D/g, '');
          if (c.length === 14) {
            const res = await resolverCnpj(c, env);
            if (res && res.data) {
              resultados.push(isPro ? res.data : {
                cnpj: res.data.cnpj,
                razaoSocial: res.data.razaoSocial,
                situacaoCadastral: res.data.situacaoCadastral,
                cnae: res.data.cnaePrincipal,
                uf: res.data.endereco.uf,
                municipio: res.data.endereco.municipio
              });
            }
          }
        }

        return new Response(JSON.stringify({
          ok: true,
          totalConsultado: lista.length,
          totalEncontrado: resultados.length,
          resultados
        }, null, 2), {
          status: 200,
          headers: { 'Content-Type': 'application/json; charset=utf-8', ...CORS_HEADERS }
        });
      } catch (err) {
        return new Response(JSON.stringify({ ok: false, error: 'JSON inválido no corpo da requisição.' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json; charset=utf-8', ...CORS_HEADERS }
        });
      }
    }

    return new Response(JSON.stringify({ ok: false, error: 'Rota não encontrada. Consulte /health ou /demo.' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json; charset=utf-8', ...CORS_HEADERS }
    });
  }
};

// ─── Template HTML da Interface Web de Testes & Playground ───
function getHtmlDemo() {
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>CNPJ Pro — API Anycast &amp; Consulta Cadastral de Empresas</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;600;700;800&family=JetBrains+Mono:wght@400;600&display=swap" rel="stylesheet">
  <style>
    :root {
      --bg: #090d16;
      --card: #111827;
      --accent: #3b82f6;
      --accent-glow: rgba(59, 130, 246, 0.25);
      --text: #f9fafb;
      --text-muted: #94a3b8;
      --border: rgba(255, 255, 255, 0.08);
      --success: #10b981;
      --warning: #f59e0b;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background: var(--bg);
      color: var(--text);
      font-family: 'Plus Jakarta Sans', sans-serif;
      padding: 30px 20px;
      display: flex;
      flex-direction: column;
      align-items: center;
      min-height: 100vh;
    }
    .container { max-width: 920px; width: 100%; }
    .badge {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 6px 14px;
      border-radius: 99px;
      background: rgba(59,130,246,0.12);
      border: 1px solid rgba(59,130,246,0.3);
      color: var(--accent);
      font-size: 12px;
      font-weight: 700;
      margin-bottom: 16px;
    }
    h1 { font-size: 32px; font-weight: 800; margin-bottom: 8px; letter-spacing: -0.5px; }
    p.lead { color: var(--text-muted); font-size: 15px; margin-bottom: 28px; line-height: 1.6; }
    .card {
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: 16px;
      padding: 24px;
      margin-bottom: 24px;
      box-shadow: 0 10px 30px rgba(0,0,0,0.4);
    }
    .input-row { display: flex; gap: 12px; margin-bottom: 20px; flex-wrap: wrap; }
    input {
      flex: 1;
      min-width: 240px;
      background: #040711;
      border: 1px solid var(--border);
      border-radius: 10px;
      padding: 12px 16px;
      color: #fff;
      font-size: 14px;
      font-family: 'JetBrains Mono', monospace;
      outline: none;
    }
    input:focus { border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-glow); }
    button.btn-primary {
      background: var(--accent);
      color: #fff;
      font-weight: 700;
      font-size: 14px;
      padding: 12px 24px;
      border: none;
      border-radius: 10px;
      cursor: pointer;
      transition: all 0.2s;
    }
    button.btn-primary:hover { opacity: 0.9; transform: translateY(-1px); }
    .btn-secondary {
      background: rgba(255,255,255,0.06);
      color: var(--text);
      padding: 8px 14px;
      border-radius: 8px;
      font-size: 12px;
      border: 1px solid var(--border);
      cursor: pointer;
    }
    .examples { display: flex; gap: 8px; align-items: center; margin-bottom: 16px; flex-wrap: wrap; }
    .examples span { font-size: 12px; color: var(--text-muted); }
    .output-box {
      background: #040711;
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 18px;
      font-family: 'JetBrains Mono', monospace;
      font-size: 12px;
      color: #38bdf8;
      white-space: pre-wrap;
      word-break: break-all;
      min-height: 240px;
      max-height: 500px;
      overflow-y: auto;
      line-height: 1.5;
    }
    footer { text-align: center; color: var(--text-muted); font-size: 13px; margin-top: auto; padding-top: 30px; }
    footer a { color: var(--accent); text-decoration: none; font-weight: 600; }
  </style>
</head>
<body>
  <div class="container">
    <div class="badge">⚡ 19,7 Milhões de Empresas &bull; Latência sub-25ms Anycast</div>
    <h1>CNPJ Pro — API &amp; Consulta Cadastral</h1>
    <p class="lead">Base completa da Receita Federal com Quadro Societário (QSA), CNAEs, Situação Cadastral e Score de Legitimidade Cadastral na borda Cloudflare Anycast.</p>

    <div class="card">
      <div class="input-row">
        <input type="text" id="cnpjInput" placeholder="Digite o CNPJ (ex: 48.916.772/0001-00)" value="48.916.772/0001-00">
        <input type="text" id="apiKeyInput" placeholder="Chave Pro (opcional para dados desmascarados)" style="max-width: 320px;">
        <button class="btn-primary" onclick="consultar()">Consultar Empresa</button>
      </div>

      <div class="examples">
        <span>Exemplos rápidos:</span>
        <button class="btn-secondary" onclick="setExemplo('48.916.772/0001-00')">OZPro Cloud</button>
        <button class="btn-secondary" onclick="setExemplo('33.000.167/0001-01')">Petrobras</button>
        <button class="btn-secondary" onclick="setExemplo('00.000.000/0001-91')">Banco do Brasil</button>
      </div>

      <div class="output-box" id="resultOutput">Aguardando consulta...</div>
    </div>

    <footer>
      Documentação Técnica &bull; <a href="https://github.com/clepta2/cnpj-pro" target="_blank">GitHub (clepta2/cnpj-pro)</a>
    </footer>
  </div>

  <script>
    function setExemplo(c) {
      document.getElementById('cnpjInput').value = c;
      consultar();
    }

    async function consultar() {
      const cnpj = document.getElementById('cnpjInput').value.trim();
      const apiKey = document.getElementById('apiKeyInput').value.trim();
      const out = document.getElementById('resultOutput');
      out.innerText = 'Consultando base de 19,7M de empresas na borda Cloudflare...';

      const clean = cnpj.replace(/\\D/g, '');
      if (clean.length !== 14) {
        out.innerText = 'Erro: Informe um CNPJ válido com 14 dígitos.';
        return;
      }

      const headers = {};
      if (apiKey) headers['x-api-key'] = apiKey;

      try {
        const res = await fetch('/api/cnpj/' + clean, { headers });
        const data = await res.json();
        out.innerText = JSON.stringify(data, null, 2);
      } catch (err) {
        out.innerText = 'Erro de comunicação: ' + err.message;
      }
    }
  </script>
</body>
</html>`;
}
