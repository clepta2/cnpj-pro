/**
 * regularizacao-dividas-pro.js
 * Módulo de Diagnóstico de Débitos, Negociação Tributária (PGFN/Desenrola) e Acompanhamento de Quitação
 * 
 * Funcionalidades Completas:
 * 1. Detalhamento de Inscrições em Dívida Ativa da União e débitos tributários federais
 * 2. Simulador de Transação Tributária (Lei nº 13.988 / Edital Regularize PGFN) com descontos de até 70%
 * 3. Geração de Guias de Pagamento (DARF / DAS PGFN) com Pix Copia e Cola
 * 4. Painel de Acompanhamento de Quitação (Timeline, amortização e liberação de CND/CPEND)
 * 5. Monitoramento de risco de exclusão do Simples Nacional ou cancelamento de acordo
 * 
 * @license MIT
 * @see https://github.com/clepta2/cnpj-pro
 */

// Casos de exemplo realistas de empresas com passivo e empresas 100% regulares
export const DEBITOS_FISCAIS_DATABASE = {
  // Petrobras (Regular com exigibilidade suspensa)
  '33000167000101': {
    totalDividaBruta: 0,
    totalComDesconto: 0,
    descontoPossivel: 0,
    possuiDebitosAtivos: false,
    aptidaoTransacaoPGFN: false,
    motivoAptidao: 'Empresa com certidão regular e sem inscrições ativas em cobrança na PGFN.',
    inscricoes: []
  },

  // Banco do Brasil (Nada Consta)
  '00000000000191': {
    totalDividaBruta: 0,
    totalComDesconto: 0,
    descontoPossivel: 0,
    possuiDebitosAtivos: false,
    aptidaoTransacaoPGFN: false,
    motivoAptidao: 'Certidão Negativa Plena. Empresa sem pendências tributárias.',
    inscricoes: []
  },

  // Exemplo de Empresa com Dívida em Cobrança (para teste completo de negociação e quitação)
  '11111111000191': {
    totalDividaBruta: 48650.00,
    totalComDesconto: 21890.00,
    descontoPossivel: 26760.00,
    descontoMaximoPercentual: 55,
    possuiDebitosAtivos: true,
    aptidaoTransacaoPGFN: true,
    programaNegociacao: 'Transação por Adesão PGFN / Edital Regularize Pequeno Porte',
    inscricoes: [
      {
        numeroInscricao: '80.6.24.009124-12',
        tributo: 'Simples Nacional / DAS em Atraso (2023-2024)',
        orgao: 'Procuradoria-Geral da Fazenda Nacional (PGFN)',
        dataExigibilidade: '2024-03-15',
        valorOriginal: 18200.00,
        multaDeMora: 3640.00,
        jurosSelic: 4210.00,
        encargosLegais: 2605.00,
        valorTotalAtualizado: 28655.00,
        statusCobranca: 'Inscrição Ativa / Em Fase de Execução Fiscal',
        descontoAplicavelJurosMulta: '65% de abatimento nos acréscimos legais'
      },
      {
        numeroInscricao: '80.2.23.004512-88',
        tributo: 'Contribuição Previdenciária Patronal (INSS)',
        orgao: 'Receita Federal / PGFN',
        dataExigibilidade: '2023-10-20',
        valorOriginal: 12500.00,
        multaDeMora: 2500.00,
        jurosSelic: 3245.00,
        encargosLegais: 1750.00,
        valorTotalAtualizado: 19995.00,
        statusCobranca: 'Inscrição em Dívida Ativa da União',
        descontoAplicavelJurosMulta: '50% de abatimento nos acréscimos legais'
      }
    ]
  }
};

/**
 * Consulta a lista detalhada de dívidas ativas e passivos tributários da empresa.
 */
export function consultarDividasEmpresa(rawCnpj, dadosEmpresa = {}) {
  const clean = String(rawCnpj || '').replace(/\D/g, '');

  if (DEBITOS_FISCAIS_DATABASE[clean]) {
    return {
      cnpj: clean.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5'),
      razaoSocial: dadosEmpresa.razaoSocial || 'EMPRESA CONSULTADA',
      ...DEBITOS_FISCAIS_DATABASE[clean]
    };
  }

  // Geração algorítmica determinística para qualquer CNPJ
  let hash = 0;
  for (let i = 0; i < clean.length; i++) hash = (hash * 31 + clean.charCodeAt(i)) >>> 0;

  const temDivida = (hash % 5 === 0); // 20% das empresas possuem passivo para simulação
  if (!temDivida) {
    return {
      cnpj: clean.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5'),
      razaoSocial: dadosEmpresa.razaoSocial || 'EMPRESA CONSULTADA',
      totalDividaBruta: 0,
      totalComDesconto: 0,
      descontoPossivel: 0,
      possuiDebitosAtivos: false,
      aptidaoTransacaoPGFN: false,
      motivoAptidao: 'Sem pendências fiscais em cobrança. Certidão Negativa Disponível.',
      inscricoes: []
    };
  }

  const valOriginal = 15000 + (hash % 35000);
  const multa = valOriginal * 0.20;
  const juros = valOriginal * 0.25;
  const encargos = valOriginal * 0.10;
  const totalBruto = valOriginal + multa + juros + encargos;
  const desconto = (multa + juros + encargos) * 0.65;
  const totalLiquido = totalBruto - desconto;

  return {
    cnpj: clean.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5'),
    razaoSocial: dadosEmpresa.razaoSocial || 'EMPRESA CONSULTADA',
    totalDividaBruta: parseFloat(totalBruto.toFixed(2)),
    totalComDesconto: parseFloat(totalLiquido.toFixed(2)),
    descontoPossivel: parseFloat(desconto.toFixed(2)),
    descontoMaximoPercentual: 65,
    possuiDebitosAtivos: true,
    aptidaoTransacaoPGFN: true,
    programaNegociacao: 'Transação Excepcional Tributária PGFN (Lei nº 13.988)',
    inscricoes: [
      {
        numeroInscricao: `80.${hash % 9}.24.${String(hash).slice(0, 6)}-01`,
        tributo: 'Débitos Tributários Federais e Previdenciários Consolidados',
        orgao: 'Procuradoria-Geral da Fazenda Nacional (PGFN)',
        dataExigibilidade: '2024-01-10',
        valorOriginal: parseFloat(valOriginal.toFixed(2)),
        multaDeMora: parseFloat(multa.toFixed(2)),
        jurosSelic: parseFloat(juros.toFixed(2)),
        encargosLegais: parseFloat(encargos.toFixed(2)),
        valorTotalAtualizado: parseFloat(totalBruto.toFixed(2)),
        statusCobranca: 'Inscrição Ativa em Dívida Ativa da União',
        descontoAplicavelJurosMulta: 'Até 65% de abatimento sobre juros e encargos'
      }
    ]
  };
}

/**
 * Simula propostas oficiais de negociação, parcelamento e quitação de dívidas.
 */
export function simularNegociacaoDividas(rawCnpj, options = {}, dadosEmpresa = {}) {
  const dividas = consultarDividasEmpresa(rawCnpj, dadosEmpresa);

  if (!dividas.possuiDebitosAtivos) {
    return {
      ok: true,
      cnpj: dividas.cnpj,
      temDebitos: false,
      mensagem: 'Esta empresa não possui dívidas ativas para negociação. Situação fiscal regular!'
    };
  }

  const bruto = dividas.totalDividaBruta;
  const clean = String(rawCnpj || '').replace(/\D/g, '');

  // 1. Modalidade À Vista (Desconto Máximo de até 65% nos juros e multas)
  const descAVista = dividas.descontoPossivel;
  const valorAVista = bruto - descAVista;

  // 2. Modalidade 12x (Curto Prazo - Desconto de 45%)
  const desc12x = descAVista * 0.70;
  const total12x = bruto - desc12x;
  const parcela12x = total12x / 12;

  // 3. Modalidade 36x (Médio Prazo - Desconto de 30%)
  const desc36x = descAVista * 0.45;
  const total36x = bruto - desc36x;
  const parcela36x = total36x / 36;

  // 4. Modalidade 60x (Longo Prazo / Teto PGFN - Desconto de 15%)
  const desc60x = descAVista * 0.25;
  const total60x = bruto - desc60x;
  const entrada60x = total60x * 0.05; // 5% de entrada
  const parcela60x = (total60x - entrada60x) / 59;

  // Gerador de Pix simulado para a 1ª Parcela
  const pixCopiaECola = `00020126580014br.gov.bcb.pix0136${clean}520400005303986540${parcela12x.toFixed(2)}5802BR5925RECEITA FEDERAL PGFN6009BRASILIA62070503***6304ABCD`;

  return {
    ok: true,
    cnpj: dividas.cnpj,
    razaoSocial: dividas.razaoSocial,
    valorTotalBrutoOriginal: bruto,
    economiaMaximaDisponivel: descAVista,
    beneficioImediato: 'A emissão da Certidão Positiva com Efeitos de Negativa (CPEND) é liberada em até 48 horas após a confirmação do pagamento da 1ª parcela.',
    propostas: [
      {
        modalidade: 'A_VISTA_DESCONTO_MAXIMO',
        titulo: 'Quitação Integral à Vista com Desconto Máximo',
        valorOriginal: bruto,
        descontoConcedido: descAVista,
        valorFinalAPagar: parseFloat(valorAVista.toFixed(2)),
        percentualEconomia: `${((descAVista / bruto) * 100).toFixed(1)}%`,
        condicao: 'Pagamento único via Pix ou DARF',
        vantagem: 'Extinção imediata da dívida e liberação de CND plena em 24h.'
      },
      {
        modalidade: 'PARCELADO_12X',
        titulo: 'Parcelamento em 12 Meses (Curto Prazo)',
        valorOriginal: bruto,
        descontoConcedido: parseFloat(desc12x.toFixed(2)),
        valorFinalAPagar: parseFloat(total12x.toFixed(2)),
        quantidadeParcelas: 12,
        valorParcelaMensal: parseFloat(parcela12x.toFixed(2)),
        condicao: '12 parcelas mensais fixas corrigidas apenas pela taxa Selic',
        vantagem: 'Parcelas intermediárias com 45% de desconto nos acréscimos.'
      },
      {
        modalidade: 'PARCELADO_36X',
        titulo: 'Parcelamento em 36 Meses (Recomendado para Fluxo de Caixa)',
        valorOriginal: bruto,
        descontoConcedido: parseFloat(desc36x.toFixed(2)),
        valorFinalAPagar: parseFloat(total36x.toFixed(2)),
        quantidadeParcelas: 36,
        valorParcelaMensal: parseFloat(parcela36x.toFixed(2)),
        condicao: '36 parcelas mensais suaves',
        vantagem: 'Equilíbrio ideal entre economia e preservação do caixa da empresa.'
      },
      {
        modalidade: 'PARCELADO_60X',
        titulo: 'Parcelamento Estendido PGFN em 60 Meses',
        valorOriginal: bruto,
        descontoConcedido: parseFloat(desc60x.toFixed(2)),
        valorFinalAPagar: parseFloat(total60x.toFixed(2)),
        entradaInicial: parseFloat(entrada60x.toFixed(2)),
        quantidadeParcelas: 60,
        valorParcelaMensal: parseFloat(parcela60x.toFixed(2)),
        condicao: 'Entrada facilitada de 5% + 59 parcelas mínimas',
        vantagem: 'Menor impacto mensal no orçamento operacional.'
      }
    ],
    guiaPrimeiraParcela: {
      valorSugerido: parseFloat(parcela12x.toFixed(2)),
      codigoPixCopiaCola: pixCopiaECola,
      chavePixTipo: 'Chave Aleatória Governamental',
      vencimentoGuia: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      instrucaoPagamento: 'Efetue o pagamento da entrada ou 1ª parcela via Pix em qualquer banco para suspender a execução fiscal e emitir a Certidão de Regularidade.'
    }
  };
}

/**
 * Gera a timeline oficial de acompanhamento da quitação das dívidas parceladas.
 */
export function obterAcompanhamentoQuitacao(rawCnpj, planoEscolhido = '12x', parcelasPagas = 3) {
  const clean = String(rawCnpj || '').replace(/\D/g, '');
  const negociacao = simularNegociacaoDividas(clean);

  if (!negociacao.ok || !negociacao.propostas) {
    return {
      ok: true,
      cnpj: clean.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5'),
      temDebitos: false,
      mensagem: 'Esta empresa não possui dívidas ativas para acompanhamento. Situação 100% regular!'
    };
  }

  let targetModalidade = 'PARCELADO_12X';
  if (String(planoEscolhido).toLowerCase().includes('36')) targetModalidade = 'PARCELADO_36X';
  else if (String(planoEscolhido).toLowerCase().includes('60')) targetModalidade = 'PARCELADO_60X';

  const proposta = negociacao.propostas.find(p => p.modalidade === targetModalidade) || negociacao.propostas[1];
  const totalParcelas = proposta.quantidadeParcelas || 12;
  const pagas = Math.min(totalParcelas, Math.max(0, parcelasPagas));
  const restantes = totalParcelas - pagas;

  const valorParcela = proposta.valorParcelaMensal || (proposta.valorFinalAPagar / totalParcelas);
  const valorPago = pagas * valorParcela;
  const saldoDevedor = Math.max(0, proposta.valorFinalAPagar - valorPago);
  const percentualConcluido = ((pagas / totalParcelas) * 100).toFixed(1);

  // Gera cronograma mês a mês com status
  const timeline = [];
  const hoje = new Date();
  
  for (let i = 1; i <= totalParcelas; i++) {
    const dataVenc = new Date(hoje.getFullYear(), hoje.getMonth() - pagas + i, 20);
    const isPaga = i <= pagas;
    const isAtual = i === (pagas + 1);

    timeline.push({
      numeroParcela: i,
      dataVencimento: dataVenc.toISOString().split('T')[0],
      valor: parseFloat(valorParcela.toFixed(2)),
      status: isPaga ? 'PAGA_CONFIRMADA' : (isAtual ? 'VENCENDO_ESTE_MES' : 'PENDENTE'),
      codigoAutenticacaoBancaria: isPaga ? `AUT-SISBB-${clean.slice(0, 4)}-${i}-OK` : null
    });
  }

  return {
    ok: true,
    cnpj: negociacao.cnpj,
    razaoSocial: negociacao.razaoSocial,
    acordoNumero: `PGFN-ACORDO-${clean.slice(0, 8)}-2026`,
    statusGeralAcordo: restantes === 0 ? 'TOTALMENTE_QUITADO' : 'EM_DIA_REGULAR',
    certidaoStatus: 'CPEND ATIVA (Apta para licitar e obter crédito bancário)',
    progressoQuitacao: {
      percentualPago: `${percentualConcluido}%`,
      parcelasPagas: pagas,
      parcelasRestantes: restantes,
      totalParcelas: totalParcelas,
      valorJaAmortizado: parseFloat(valorPago.toFixed(2)),
      saldoDevedorRestante: parseFloat(saldoDevedor.toFixed(2))
    },
    proximaParcela: restantes > 0 ? {
      numero: pagas + 1,
      vencimento: timeline[pagas] ? timeline[pagas].dataVencimento : '2026-12-20',
      valor: proposta.valorParcelaMensal,
      pixCopiaECola: negociacao.guiaPrimeiraParcela.codigoPixCopiaCola
    } : null,
    alertasManutencaoAcordo: [
      'Mantenha os pagamentos em dia: 3 parcelas não pagas cancelam automaticamente o acordo e restabelecem 100% dos juros e multas.',
      'O recolhimento regular garante que o CNPJ permaneça no Simples Nacional e não sofra penhora online via BacenJud.'
    ],
    cronogramaParcelas: timeline
  };
}
