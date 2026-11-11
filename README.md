# 🏢 CNPJ Pro — SDK & API de Consulta Cadastral de Empresas

> **API REST de alta performance em Cloudflare Edge para consulta cadastral, situação na Receita Federal, quadro societário (QSA), CNAEs e endereço de 20 milhões de empresas brasileiras.**

[![Status](https://img.shields.io/badge/Status-Cloudflare%20Edge%20API-success.svg)](#)
[![Empresas](https://img.shields.io/badge/Base-19.753.951%20Empresas-blue.svg)](#)
[![Ativas](https://img.shields.io/badge/Ativas-8.013.584%20Empresas-emerald.svg)](#)
[![Latency](https://img.shields.io/badge/Latência-<30ms-cyan.svg)](#)
[![Auth](https://img.shields.io/badge/Auth-RFC%206750%20Bearer-orange.svg)](#)
[![License](https://img.shields.io/badge/License-MIT%20SDK-purple.svg)](LICENSE)

---

## ⚡ O que é o CNPJ Pro?

O **CNPJ Pro** é um microsserviço em nuvem da OZPro Enterprise que transforma a base aberta completa da Receita Federal em uma **API de borda Anycast ultrarrápida (<30ms de latência)** com dados higienizados e indexados.

Criado para abastecer **ERPs, CRMs, sistemas de checkout, prevenção a fraudes, onboarding de clientes e automações B2B de WhatsApp**, o CNPJ Pro evita que sua aplicação precise manter bancos de dados gigantescos (+12 GB) localmente.

---

## 🔒 Modelo de Acesso & Licenciamento

> [!IMPORTANT]
> **Este repositório público contém o SDK oficial (cliente JavaScript/TypeScript), contratos de tipos e a documentação completa de integração.**
> 
> As consultas em tempo real na base de produção são processadas na borda da Cloudflare e requerem autenticação via chave de API.
> 
> **Para obter uma Chave de API de Produção (`cnpj_live_...`) ou créditos pré-pagos (a partir de R$ 0,02 por consulta), adquira seu acesso no Marketplace oficial:**  
> 👉 **[Acessar Ponte API Marketplace](https://ponte.ozpro.com.br)**

---

## 🚀 Como Integrar em seu Projeto

### 1. Instalação

```bash
npm install cnpj-pro
```

*(Ou inclua `cnpj-pro.js` diretamente em seu projeto Node.js ou navegador)*.

### 2. Uso Rápido com o SDK

```javascript
import CnpjPro from 'cnpj-pro';

const cnpj = new CnpjPro({
  apiKey: 'cnpj_live_SEU_TOKEN' // Obtenha no Ponte API Marketplace
});

// 1. Consulta completa por CNPJ (com ou sem pontuação)
const empresa = await cnpj.consultar('48.916.772/0001-00');
console.log('Razão Social:', empresa.razaoSocial);
console.log('Situação Cadastral:', empresa.situacaoCadastral);
console.log('CNAE:', empresa.cnaePrincipalDescricao);
console.log('Sócios Administradores:', empresa.socios);

// 2. Validação instantânea de dígito verificador na máquina (sem gastar cota)
const valido = cnpj.validarDigito('48.916.772/0001-00');
console.log('Dígito é válido?', valido); // true

// 3. Formatação automática
console.log(cnpj.formatar('48916772000100')); // "48.916.772/0001-00"
```

---

## 🔑 Autenticação Oficial (Padrão RFC 6750 & HTTP Headers)

A API adota o padrão internacional **RFC 6750 ****** para todas as requisições de produção.

### Cabeçalhos aceitos:

```http
Authorization: ******
```
*Ou alternativamente:*
```http
x-api-key: cnpj_live_SEU_TOKEN_AQUI
```

### Prefixos de Chaves por Categoria:

| Prefixo de Chave | Nível de Acesso | Descrição |
| :--- | :--- | :--- |
| `cnpj_sandbox_...` | **Sandbox Gratuito** | Retorna dados simulados e modelos de teste para homologação. |
| `cnpj_credit_...` | **Por Crédito (Pré-pago)** | Cobrança por consulta realizada (R$ 0,02 a R$ 0,08 por consulta). |
| `cnpj_pro_...` | **Plano Mensal Pro** | Até 20.000 consultas/mês com 300 RPM e busca avançada. |
| `cnpj_master_...` | **Master Admin** | Vazão dedicada até 3.000 RPM, webhooks e consultas ilimitadas. |

---

## 📡 Endpoints da API

Base URL Oficial de Borda (Cloudflare Anycast):  
`https://ponte.ozpro.com.br`

### 1. `GET /api/cnpj/:cnpj` (Cadastro Completo Enriquecido)
Retorna todos os dados cadastrais detalhados, porte, regime tributário, CNAE decodificado, endereço, sócios e o bloco de **Validação de Empresa Real (Score de Legitimidade)**:

> ℹ️ **Nota de Transparência:** Este índice **NÃO é um score de crédito financeiro/bancário**. Trata-se de uma métrica algorítmica proprietária que verifica a **autenticidade e consistência cadastral** (se a empresa é real, se está ATIVA na Receita Federal, seu tempo de mercado e se possui canais de contato e endereço completos para prevenção a empresas fantasmas/fraudes).

```json
"validacaoEmpresaReal": {
  "scoreLegitimidade": 890,
  "empresaAtiva": true,
  "tempoAtividadeAnos": 4,
  "statusLegitimidade": "ALTA_LEGITIMIDADE",
  "contatoVerificado": true,
  "enderecoCompleto": true
}
```

---

### 2. `GET /api/cnpj/:cnpj/resumo` (Puxada Ultraleve para Checkout)
Retorna payload ultraleve (< 200 bytes) com apenas os dados essenciais para preenchimento de formulário em **10ms**:
```json
{
  "ok": true,
  "data": {
    "cnpj": "48916772000100",
    "cnpjFormatado": "48.916.772/0001-00",
    "razaoSocial": "OZPRO ENTERPRISE TECNOLOGIA LTDA",
    "nomeFantasia": "OZPRO CLOUD",
    "tipo": "LTDA",
    "situacaoCadastral": "ATIVA",
    "anoFundacao": 2022,
    "cnae": "62.01-5/01",
    "cnaeDescricao": "Desenvolvimento de programas sob encomenda (SaaS)",
    "uf": "SP",
    "municipio": "SAO PAULO"
  }
}
```

---

### 3. `GET /api/cnpj/:cnpj/contato` (Puxada B2B, WhatsApp & Telemarketing)
Retorna dados de contato higienizados, identificação de celular e **link direto para WhatsApp**:
```json
{
  "ok": true,
  "data": {
    "cnpj": "48916772000100",
    "razaoSocial": "OZPRO ENTERPRISE TECNOLOGIA LTDA",
    "telefoneFormatado": "(11) 99682-6349",
    "whatsappProvavel": true,
    "whatsappLink": "https://wa.me/5511996826349",
    "email": "contato@ozpro.com.br",
    "enderecoCompleto": "AVENIDA PAULISTA, 1000 - BELA VISTA, SAO PAULO - SP, CEP 01310-100",
    "socios": [{ "nome": "CLEBERSON NOVAIS", "qualificacao": "49 - Sócio-Administrador" }]
  }
}
```

---

### 4. `GET /api/cnpj/:cnpj/socios` (Quadro Societário - QSA)
Retorna os sócios e administradores registrados:
```json
{
  "ok": true,
  "data": {
    "cnpj": "48916772000100",
    "razaoSocial": "OZPRO ENTERPRISE TECNOLOGIA LTDA",
    "totalSocios": 1,
    "socios": [{ "nome": "CLEBERSON NOVAIS", "qualificacao": "49 - Sócio-Administrador" }]
  }
}
```

---

### 5. `GET /api/cnpj/:cnpj/validar` (Validação & Ano de Fundação)
Valida os dígitos verificadores pelo algoritmo módulo 11 da Receita Federal e calcula o ano de fundação estimado sem gastar créditos.

---

### 6. `GET /api/cnpj/busca` (Busca Multi-Critério)
Busca prospectiva por Razão Social, CNAE, UF, Ano e Tipo Societário.

* **Filtros Disponíveis:**
  * `q` (string): Busca textual por nome ou sócio.
  * `tipo` (string): Filtrar por natureza societária (`MEI`, `LTDA`, `SA`, `INDIVIDUAL`).
  * `ano` (number): Filtrar por ano de abertura (ex: `ano=2015`).
  * `uf` (string): Sigla do estado (ex: `"SP"`, `"RJ"`, `"MG"`).
  * `cnae` (string): Código CNAE de atividade (ex: `"9511502"` para conserto de celular).
  * `comWhatsapp` (boolean): `true` para retornar apenas empresas com celular móvel.
  * `comTelefone` (boolean): `true` para retornar apenas empresas com telefone.
  * `comEmail` (boolean): `true` para retornar apenas empresas com e-mail cadastrado.
  * `puxada` (string): Formato do resultado (`completo`, `resumo` ou `contato`).
  * `limite` (number): Quantidade máxima de resultados (padrão: 20, máx: 100).

---

### 7. `POST /api/cnpj/lote` (Consulta em Lote - Batch)
Envia até 100 CNPJs em uma única requisição HTTP para enriquecimento massivo de cadastros:
```json
// POST /api/cnpj/lote
{
  "cnpjs": ["48916772000100", "33000167000101", "00000000000191"],
  "puxada": "resumo"
}
```
* **Resposta (200 OK):**
```json
{
  "ok": true,
  "totalConsultados": 3,
  "totalEncontrados": 3,
  "puxada": "resumo",
  "data": [
    {
      "cnpj": "48916772000100",
      "razaoSocial": "OZPRO ENTERPRISE TECNOLOGIA LTDA",
      "tipo": "LTDA",
      "situacaoCadastral": "ATIVA",
      "anoFundacao": 2022,
      "score": 890,
      "uf": "SP"
    }
  ]
}
```

---

### 8. `GET /api/cnpj/:cnpj/vcard` (Cartão de Contato .vcf)
Gera arquivo de contato oficial compatível com iPhone, Android e Outlook para adicionar o CNPJ e o WhatsApp na agenda em 1 clique.

---

## 💻 Exemplos em Outras Linguagens

### cURL

```bash
curl -X GET "https://ponte.ozpro.com.br/api/cnpj/48916772000100" \
  -H "Authorization: ****** \
  -H "Accept: application/json"
```

### Python (`requests`)

```python
import requests

cnpj = "48916772000100"
url = f"https://ponte.ozpro.com.br/api/cnpj/{cnpj}"
headers = {
    "Authorization": "******",
    "Accept": "application/json"
}

response = requests.get(url, headers=headers)
empresa = response.json().get("data")
print(f"Razão: {empresa['razaoSocial']} | Status: {empresa['situacaoCadastral']}")
```

### PHP

```php
<?php
$apiKey = "cnpj_live_SEU_TOKEN";
$ch = curl_init("https://ponte.ozpro.com.br/api/cnpj/48916772000100");
curl_setopt($ch, CURLOPT_HTTPHEADER, [
    "Authorization: ****** . $apiKey,
    "Accept: application/json"
]);
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
$response = curl_exec($ch);
curl_close($ch);

$dados = json_decode($response, true);
echo $dados['data']['razaoSocial'];
?>
```

---

## 📊 Matriz de Tarifas no Ponte API Marketplace

| Modalidade | Preço Base | Vantagem Principal |
| :--- | :--- | :--- |
| **Por Crédito** | A partir de **R$ 0,02** por consulta | Pague somente pelo que consultar. Saldo pré-pago sem expiração. |
| **Plano Starter** | **R$ 29,90** / mês | Até 2.000 consultas/mês com 60 RPM. Ideal para lojas e cadastros. |
| **Plano Pro** | **R$ 79,90** / mês | Até 20.000 consultas/mês com 300 RPM e busca avançada por CNAE. |
| **Plano Enterprise** | Sob consulta | Consultas ilimitadas, rate-limit dedicado e sincronização de dados. |

Adquira sua chave instantaneamente via PIX:  
👉 **[https://ponte.ozpro.com.br](https://ponte.ozpro.com.br)**

---

## 📄 Licença

O SDK e os exemplos deste repositório estão sob a licença [MIT](LICENSE).  
O serviço de API, cluster de borda e infraestrutura em nuvem são propriedades da **OZPro Enterprise Cloud**.
