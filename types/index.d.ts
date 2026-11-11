/**
 * CNPJ Pro — TypeScript Definitions
 * Versão 1.0.0
 */

export interface Socio {
  nome: string;
  qualificacao: string;
  pais?: string;
  faixaEtaria?: string;
  dataEntrada?: string;
}

export interface EnderecoEmpresa {
  tipoLogradouro?: string;
  logradouro: string;
  numero: string;
  complemento?: string;
  bairro: string;
  cep: string;
  uf: string;
  municipio: string;
  codigoMunicipio?: string;
}

export interface ContatoEmpresa {
  ddd1?: string;
  telefone1?: string;
  ddd2?: string;
  telefone2?: string;
  email?: string;
}

export interface DadosCadastraisEmpresa {
  cnpj: string;
  razaoSocial: string;
  nomeFantasia?: string;
  situacaoCadastral: 'ATIVA' | 'BAIXADA' | 'INAPTA' | 'SUSPENSA' | 'NULA';
  dataSituacaoCadastral?: string;
  motivoSituacaoCadastral?: string;
  dataInicioAtividade?: string;
  cnaePrincipal: string;
  cnaePrincipalDescricao: string;
  cnaesSecundarios?: string[];
  naturezaJuridica?: string;
  capitalSocial?: number;
  porte?: 'ME' | 'EPP' | 'DEMAIS';
  opcaoSimples?: boolean;
  opcaoMei?: boolean;
  endereco: EnderecoEmpresa;
  contato: ContatoEmpresa;
  socios: Socio[];
}

export interface BuscaCnpjOptions {
  q?: string;
  uf?: string;
  municipio?: string;
  cnae?: string;
  tipo?: 'MEI' | 'LTDA' | 'SA' | 'INDIVIDUAL' | 'EIRELI' | 'SLU';
  ano?: number;
  situacao?: 'ATIVA' | 'BAIXADA' | 'INAPTA' | 'SUSPENSA';
  comTelefone?: boolean;
  comWhatsapp?: boolean;
  comEmail?: boolean;
  puxada?: 'completo' | 'resumo' | 'contato';
  limite?: number;
  pagina?: number;
}

export interface ResumoEmpresa {
  cnpj: string;
  cnpjFormatado: string;
  razaoSocial: string;
  nomeFantasia?: string;
  tipo: string;
  situacaoCadastral: string;
  anoFundacao: number;
  cnae: string;
  cnaeDescricao: string;
  uf: string;
  municipio: string;
}

export interface ContatoB2BEmpresa {
  cnpj: string;
  razaoSocial: string;
  telefoneFormatado?: string;
  whatsappProvavel: boolean;
  whatsappLink?: string;
  email?: string;
  enderecoCompleto: string;
  socios: Socio[];
}

export interface ValidacaoCnpjResultado {
  ok: boolean;
  cnpj: string;
  cnpjFormatado: string;
  valido: boolean;
  anoFundacaoEstimado: number;
  shardShardR2: string;
}

export interface RespostaBuscaCnpj {
  ok: boolean;
  totalRetornado: number;
  filtrosAplicados: any;
  data: any[];
}

export interface CnpjProClientConfig {
  apiKey?: string;
  baseUrl?: string;
  timeoutMs?: number;
  cacheTtlMs?: number;
}

export declare class CnpjPro {
  constructor(config?: CnpjProClientConfig);
  consultar(cnpj: string): Promise<DadosCadastraisEmpresa>;
  consultarResumo(cnpj: string): Promise<ResumoEmpresa>;
  consultarContato(cnpj: string): Promise<ContatoB2BEmpresa>;
  consultarSocios(cnpj: string): Promise<{ ok: boolean; cnpj: string; razaoSocial: string; totalSocios: number; socios: Socio[] }>;
  validar(cnpj: string): Promise<ValidacaoCnpjResultado>;
  obterVcardUrl(cnpj: string): string;
  consultarLote(cnpjs: string[], options?: { puxada?: 'resumo' | 'contato' | 'completo' }): Promise<{ ok: boolean; totalConsultados: number; totalEncontrados: number; puxada: string; data: any[] }>;
  buscar(options?: BuscaCnpjOptions): Promise<RespostaBuscaCnpj>;
  validarDigito(cnpj: string): boolean;
  formatar(cnpj: string): string;
  limpar(cnpj: string): string;
}

export default CnpjPro;
