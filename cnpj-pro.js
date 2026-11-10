/**
 * CNPJ Pro SDK v1.0.0
 * Biblioteca cliente oficial para consulta cadastral de empresas brasileiras via API CNPJ Pro (OZPro Cloud).
 * Compatível com Node.js (18+), navegadores modernos, Bun e Cloudflare Workers.
 *
 * @license MIT
 * @see https://github.com/clepta2/cnpj-pro
 */
(function (root, factory) {
  if (typeof define === 'function' && define.amd) {
    define([], factory);
  } else if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.CnpjPro = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const DEFAULT_BASE_URL = 'https://cnpj-pro-api.fichatecnica-api.workers.dev';
  const DEFAULT_TIMEOUT = 10000;

  // Modelo de amostra para testes em modo Sandbox (sem chave de produção)
  const SANDBOX_MOCKS = {
    '48916772000100': {
      cnpj: '48916772000100',
      razaoSocial: 'OZPRO ENTERPRISE TECNOLOGIA LTDA',
      nomeFantasia: 'OZPRO CLOUD',
      situacaoCadastral: 'ATIVA',
      dataSituacaoCadastral: '2022-09-15',
      dataInicioAtividade: '2022-09-15',
      cnaePrincipal: '6201501',
      cnaePrincipalDescricao: 'Desenvolvimento de programas de computador sob encomenda',
      naturezaJuridica: '206-2 - Sociedade Empresária Limitada',
      capitalSocial: 100000,
      porte: 'ME',
      opcaoSimples: true,
      opcaoMei: false,
      endereco: {
        tipoLogradouro: 'AVENIDA',
        logradouro: 'PAULISTA',
        numero: '1000',
        complemento: 'SALA 802',
        bairro: 'BELA VISTA',
        cep: '01310100',
        uf: 'SP',
        municipio: 'SAO PAULO'
      },
      contato: {
        ddd1: '11',
        telefone1: '32001000',
        email: 'contato@ozpro.com.br'
      },
      socios: [
        { nome: 'CLEBERSON NOVAIS', qualificacao: '49 - Sócio-Administrador' }
      ]
    }
  };

  class CnpjPro {
    /**
     * @param {Object} [config]
     * @param {string} [config.apiKey] - Chave da API (cnpj_live_... ou cnpj_free_...)
     * @param {string} [config.baseUrl] - URL base da API Cloudflare Edge
     * @param {number} [config.timeoutMs] - Timeout da requisição em milissegundos
     */
    constructor(config = {}) {
      this.apiKey = config.apiKey || (typeof process !== 'undefined' && process.env && process.env.CNPJ_PRO_API_KEY) || '';
      this.baseUrl = (config.baseUrl || DEFAULT_BASE_URL).replace(/\/+$/, '');
      this.timeoutMs = config.timeoutMs || DEFAULT_TIMEOUT;
      this.cache = new Map();
    }

    /**
     * Remove caracteres não numéricos
     * @param {string} cnpj
     * @returns {string}
     */
    limpar(cnpj) {
      return String(cnpj || '').replace(/\D/g, '');
    }

    /**
     * Aplica máscara clássica de CNPJ (00.000.000/0000-00)
     * @param {string} cnpj
     * @returns {string}
     */
    formatar(cnpj) {
      const v = this.limpar(cnpj).padStart(14, '0');
      return v.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
    }

    /**
     * Valida os dígitos verificadores pelo algoritmo módulo 11 da Receita Federal
     * @param {string} cnpj
     * @returns {boolean}
     */
    validarDigito(cnpj) {
      const clean = this.limpar(cnpj);
      if (clean.length !== 14) return false;
      if (/^(\d)\1+$/.test(clean)) return false;

      let tamanho = clean.length - 2;
      let numeros = clean.substring(0, tamanho);
      const digitos = clean.substring(tamanho);
      let soma = 0;
      let pos = tamanho - 7;

      for (let i = tamanho; i >= 1; i--) {
        soma += parseInt(numeros.charAt(tamanho - i), 10) * pos--;
        if (pos < 2) pos = 9;
      }

      let resultado = soma % 11 < 2 ? 0 : 11 - (soma % 11);
      if (resultado !== parseInt(digitos.charAt(0), 10)) return false;

      tamanho = tamanho + 1;
      numeros = clean.substring(0, tamanho);
      soma = 0;
      pos = tamanho - 7;

      for (let i = tamanho; i >= 1; i--) {
        soma += parseInt(numeros.charAt(tamanho - i), 10) * pos--;
        if (pos < 2) pos = 9;
      }

      resultado = soma % 11 < 2 ? 0 : 11 - (soma % 11);
      return resultado === parseInt(digitos.charAt(1), 10);
    }

    _getHeaders() {
      const headers = {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'User-Agent': 'CnpjPro-SDK/1.0.0'
      };
      if (this.apiKey) {
        headers['Authorization'] = `****** ${this.apiKey}`;
        headers['x-api-key'] = this.apiKey;
      }
      return headers;
    }

    async _request(path, params = {}) {
      const qs = new URLSearchParams();
      for (const [k, v] of Object.entries(params)) {
        if (v !== undefined && v !== null && v !== '') {
          qs.set(k, String(v));
        }
      }
      const url = `${this.baseUrl}${path}${qs.toString() ? '?' + qs.toString() : ''}`;

      if (this.cache.has(url)) {
        return this.cache.get(url);
      }

      const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
      const timeoutId = controller ? setTimeout(() => controller.abort(), this.timeoutMs) : null;

      try {
        const res = await fetch(url, {
          method: 'GET',
          headers: this._getHeaders(),
          signal: controller ? controller.signal : undefined
        });

        if (timeoutId) clearTimeout(timeoutId);

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          const err = new Error(errData.message || `Erro na API CNPJ Pro (HTTP ${res.status})`);
          err.status = res.status;
          err.code = errData.code || 'API_ERROR';
          err.details = errData;
          throw err;
        }

        const data = await res.json();
        this.cache.set(url, data);
        return data;
      } catch (err) {
        if (timeoutId) clearTimeout(timeoutId);

        // Fallback para sandbox demo caso esteja sem chave
        if (!this.apiKey && path.includes('/api/cnpj/')) {
          const c = path.replace('/api/cnpj/', '').replace(/\D/g, '');
          const mock = SANDBOX_MOCKS[c] || SANDBOX_MOCKS['48916772000100'];
          return { ok: true, sandbox: true, data: mock };
        }
        throw err;
      }
    }

    /**
     * Consulta os dados cadastrais completos de uma empresa pelo CNPJ
     * @param {string} cnpj - Número do CNPJ com ou sem pontuação
     * @returns {Promise<Object>}
     */
    async consultar(cnpj) {
      const clean = this.limpar(cnpj);
      if (!clean || clean.length !== 14) {
        throw new Error('CNPJ inválido. Forneça 14 dígitos numéricos.');
      }
      return this._request(`/api/cnpj/${clean}`);
    }

    /**
     * Busca empresas por Razão Social, Nome Fantasia, CNAE, UF ou Município
     * @param {Object} options
     * @returns {Promise<Object>}
     */
    async buscar(options = {}) {
      return this._request('/api/cnpj/busca', options);
    }
  }

  return CnpjPro;
});
