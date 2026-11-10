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
  situacao?: string;
  apenasAtivas?: boolean;
  limite?: number;
  pagina?: number;
}

export interface RespostaBuscaCnpj {
  ok: boolean;
  total: number;
  pagina: number;
  limite: number;
  data: DadosCadastraisEmpresa[];
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
  buscar(options: BuscaCnpjOptions): Promise<RespostaBuscaCnpj>;
  validarDigito(cnpj: string): boolean;
  formatar(cnpj: string): string;
  limpar(cnpj: string): string;
}

export default CnpjPro;
