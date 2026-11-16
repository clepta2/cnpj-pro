---
description: "Use when creating, modifying, integrating or auditing features that need icons, fonts, charts, QR codes, barcodes, vehicle data, CNPJ, CEP, CPF, Pix, currency rates, people/mock data, translation, or security. Mandates using internal Ponte/OZPro APIs instead of third-party CDNs or external services."
name: "Soberania Tecnológica e APIs Próprias"
applyTo: "**/*.{html,js,ts,css}"
---

# Regra de Soberania Tecnológica — Usar Sempre Nossas APIs (Zero Terceiros)

Antes de adicionar qualquer recurso ou dependência ao frontend ou backend, verifique a tabela de microsserviços do ecossistema Ponte / OZPro. **Nunca use bibliotecas ou serviços de terceiros quando já possuímos a solução em nossa rede.**

## 1. Ícones e Tipografia
- **PROIBIDO:** `<script src="https://unpkg.com/lucide@latest"></script>`, FontAwesome CDN, `fonts.googleapis.com`.
- **OBRIGATÓRIO:** Motor nativo em memória `ponte-icons.js` ou endpoint oficial da `icons-pro` (`https://icons-pro-api.maputo2.workers.dev/api/icons/{slug}.svg`).
- **Fontes:** Usar pilha nativa do sistema operacional (`-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`) ou catálogo WOFF2 de fontes soberanas da `icons-pro`.

## 2. Gráficos e Telemetria Visual
- **PROIBIDO:** Importar Chart.js, Recharts, ApexCharts ou bibliotecas de terceiros via CDN.
- **OBRIGATÓRIO:** Consumir a API `graficos-pro` (`https://graficos-pro-api.maputo2.workers.dev/api/grafico?tipo={gauge|donut|area|barra}`), que renderiza SVGs nativos Anycast em sub-3ms diretamente da borda.

## 3. Pagamentos, Boletos e Pix
- **PROIBIDO:** Serviços externos de QR Code (`api.qrserver.com`, `chart.googleapis.com`) ou validadores de boleto de terceiros.
- **OBRIGATÓRIO:**
  - `pixvalidator-pro` para gerar códigos Pix Copia e Cola oficiais (EMV BR Code) e QR Codes vetoriais em SVG.
  - `boletovalidator-pro` para validação FEBRABAN Módulo 10/11 e renderização vetorial de código de barras ITF-25.

## 4. Cadastros, Veículos e Dados Oficiais
- **Veículos e Trânsito:** Usar `placas-pro` (Mercosul, CONTRAN 27 UFs, RENAVAM Módulo 11, Chassi VIN ISO 3779, FIPE, isenção de IPVA e placa SVG).
- **Empresas:** Usar `cnpj-pro` (Receita Federal Anycast, QSA, Sócios, CNAE, Score de Legitimidade).
- **Endereços:** Usar `ceps-pro` (DNE Correios 27 UFs).
- **Pessoas Físicas:** Usar `cpfvalidator-pro` (Módulo 11 oficial).
- **Segurança de Credenciais:** Usar `passvalidator-pro` (k-Anonymity SHA-1 860M+ HIBP e entropia).
- **Mercado Financeiro:** Usar `cotacoes-pro` (177 moedas, cripto e combustíveis da ANP na bomba).
