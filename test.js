/**
 * test.js
 * Bateria de Testes Unitários e Validação Criptográfica do CNPJ Pro
 */
import worker, { validarDigitoCnpj } from './worker.js';
import { auditarSaudeFiscalCnpj, SUBLIMITES_SIMPLES_ESTADUAIS } from './saude-fiscal-pgfn.js';

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    passed++;
    console.log(`  ✅ PASS: ${message}`);
  } else {
    failed++;
    console.error(`  ❌ FAIL: ${message}`);
  }
}

console.log('🧪 Iniciando Bateria de Testes do CNPJ Pro (Módulo 11 & Gatekeeper)...');

// 1. Validação de CNPJs Autênticos
console.log('\n--- 1. Validação de CNPJs Reais ---');
const c1 = validarDigitoCnpj('33.000.167/0001-01'); // Petrobras Matriz
assert(c1.valido === true, 'Valida CNPJ autêntico da Petrobras');
assert(c1.tipoEstabelecimento === 'Matriz', 'Identifica corretamente como Matriz');

const c2 = validarDigitoCnpj('00.000.000/0001-91'); // Banco do Brasil Matriz
assert(c2.valido === true, 'Valida CNPJ autêntico do Banco do Brasil');
assert(c2.tipoEstabelecimento === 'Matriz', 'Identifica como Matriz');

const c3 = validarDigitoCnpj('00.000.000/0002-72'); // Banco do Brasil Filial
assert(c3.valido === true, 'Valida filial com DVs matemáticos corretos');
assert(c3.tipoEstabelecimento === 'Filial', 'Identifica corretamente como Filial');

// 2. Rejeição de CNPJs Inválidos e Fraudes
console.log('\n--- 2. Bloqueio de Dígitos Inválidos & Repetidos ---');
const fakeRep = validarDigitoCnpj('11.111.111/1111-11');
assert(fakeRep.valido === false, 'Bloqueia dígitos repetidos sequenciais');

const fakeDv = validarDigitoCnpj('33.000.167/0001-99'); // DVs adulterados
assert(fakeDv.valido === false, 'Detecta adulteração nos dígitos verificadores');

const fakeTam = validarDigitoCnpj('123456');
assert(fakeTam.valido === false, 'Rejeita CNPJs com tamanho menor que 14 dígitos');

// 3. Formatação Canônica
console.log('\n--- 3. Formatação Canônica ---');
assert(c1.cnpjFormatado === '33.000.167/0001-01', 'Formata com máscara oficial');

// 4. Rota de lote e limites de payload
console.log('\n--- 4. Rota de Consulta em Lote ---');
const loteResponse = await worker.fetch(new Request('https://api.test/api/cnpj/lote', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ cnpjs: ['invalido'] })
}), {});
const loteBody = await loteResponse.json();
assert(loteResponse.status === 200, 'A rota de lote não é interceptada pela consulta individual');
assert(loteBody.totalSolicitado === 1 && loteBody.resultados[0].ok === false, 'A resposta do lote informa o erro do item solicitado');

const cnpjTeste = '00000000000191';
const sucessoLoteResponse = await worker.fetch(new Request('https://api.test/api/cnpj/lote', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ cnpjs: [cnpjTeste] })
}), {
  CNPJ_KV: {
    get: async (key) => key === cnpjTeste ? {
      cnpj: cnpjTeste,
      razaoSocial: 'Empresa de teste',
      situacaoCadastral: 'ATIVA',
      cnaePrincipal: '0000000',
      endereco: { uf: 'SP', municipio: 'São Paulo' }
    } : null
  }
});
const sucessoLoteBody = await sucessoLoteResponse.json();
assert(sucessoLoteBody.totalEncontrado === 1 && sucessoLoteBody.resultados[0].cnpj === cnpjTeste, 'O lote retorna apenas o registro solicitado encontrado no KV');

const limiteResponse = await worker.fetch(new Request('https://api.test/api/cnpj/lote', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ cnpjs: Array(6).fill('invalido') })
}), {});
assert(limiteResponse.status === 413, 'O lote gratuito acima de cinco itens é rejeitado claramente');

const metodoResponse = await worker.fetch(new Request('https://api.test/api/cnpj/lote'), {});
assert(metodoResponse.status === 405, 'A rota de lote exige POST');

// 5. Módulo de Saúde Fiscal, CND, Simples Nacional & PGFN
console.log('\n--- 5. Saúde Fiscal, CND Federal & PGFN ---');
const fiscalPetrobras = auditarSaudeFiscalCnpj('33.000.167/0001-01');
assert(fiscalPetrobras.situacaoFiscal === 'REGULAR', 'Petrobras identificada como situação fiscal REGULAR');
assert(fiscalPetrobras.certidaoNegativaDebitos.aptaParaLicitacoes === true, 'Petrobras apta para licitações com CPEND');
assert(fiscalPetrobras.simplesNacional.optanteSimples === false, 'Petrobras não optante pelo Simples Nacional');
assert(fiscalPetrobras.saudeFiscalScore.score >= 950, 'Score de legitimidade fiscal de excelência (>= 950)');

const fiscalBB = auditarSaudeFiscalCnpj('00.000.000/0001-91');
assert(fiscalBB.certidaoNegativaDebitos.status === 'NEGATIVA_TOTAL', 'Banco do Brasil com CND Negativa Total');
assert(fiscalBB.dividaAtivaPgfn.possuiInscricaoPgfn === false, 'Sem inscrição em dívida ativa da PGFN');

const fiscalOzpro = auditarSaudeFiscalCnpj('48.916.772/0001-00');
assert(fiscalOzpro.simplesNacional.optanteSimples === true, 'Empresa identificada como optante do Simples Nacional');
assert(SUBLIMITES_SIMPLES_ESTADUAIS['SP'] === 4800000, 'Sublimite estadual do Simples Nacional em SP é R$ 4,8 milhões');
assert(SUBLIMITES_SIMPLES_ESTADUAIS['RJ'] === 3600000, 'Sublimite estadual do Simples Nacional no RJ é R$ 3,6 milhões');

// Teste de Sub-rotas fiscais no Worker
const cndResp = await worker.fetch(new Request('https://api.test/api/cnpj/00000000000191/cnd'), {
  CNPJ_KV: {
    get: async () => ({
      cnpj: '00000000000191',
      razaoSocial: 'BANCO DO BRASIL SA',
      situacaoCadastral: 'ATIVA',
      cnaePrincipal: '6422100',
      endereco: { uf: 'DF', municipio: 'Brasília' },
      saudeFiscal: fiscalBB
    })
  }
});
const cndBody = await cndResp.json();
assert(cndResp.status === 200, 'Rota /api/cnpj/:cnpj/cnd responde com 200 OK');
assert(cndBody.certidaoNegativaDebitos !== undefined, 'Rota /cnd retorna objeto da Certidão Negativa');

const simplesResp = await worker.fetch(new Request('https://api.test/api/cnpj/00000000000191/simples'), {
  CNPJ_KV: {
    get: async () => ({
      cnpj: '00000000000191',
      razaoSocial: 'BANCO DO BRASIL SA',
      situacaoCadastral: 'ATIVA',
      cnaePrincipal: '6422100',
      endereco: { uf: 'DF', municipio: 'Brasília' },
      saudeFiscal: fiscalBB
    })
  }
});
const simplesBody = await simplesResp.json();
assert(simplesResp.status === 200, 'Rota /api/cnpj/:cnpj/simples responde com 200 OK');
assert(simplesBody.simplesNacional !== undefined, 'Rota /simples retorna enquadramento tributário');

console.log(`\n📊 Resultado dos Testes: ${passed} passaram, ${failed} falharam.\n`);

if (failed > 0) {
  process.exit(1);
} else {
  console.log('🎉 Todos os testes unitários do CNPJ Pro passaram com 100% de sucesso!');
}
