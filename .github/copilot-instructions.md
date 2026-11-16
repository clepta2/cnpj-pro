# Diretrizes de Engenharia — Ponte API Marketplace & Ecossistema OZPro

## Soberania Tecnológica: Uso Obrigatório de Nossas APIs Próprias (Zero Terceiros)

**REGRA SUPREMA E INVIOLÁVEL:**
É expressamente proibido importar scripts de terceiros, bibliotecas hospedadas em CDNs externas (como `unpkg.com`, `cdnjs.cloudflare.com`, `cdn.jsdelivr.net`), serviços de fontes de terceiros (`fonts.googleapis.com`, `fonts.gstatic.com`) ou consumir APIs externas de terceiros para qualquer funcionalidade que nosso ecossistema já forneça ou possa resolver internamente.

Sempre consulte primeiro o catálogo de microsserviços do marketplace (`my-api-marketplace/app.js` -> `allApis()`) e utilize exclusivamente nossas soluções proprietárias de borda Cloudflare Anycast ou motores nativos em memória.

### Tabela de Mapeamento Oficial — Nossas APIs vs Terceiros Proibidos

| Funcionalidade | O que NUNCA usar (3ºs Proibidos) | Nossa API / Módulo Próprio Obrigatório | Onde Encontrar / Como Utilizar |
| :--- | :--- | :--- | :--- |
| **Ícones Vetoriais & Logos de Marcas** | `unpkg.com/lucide`, `cdnjs`, FontAwesome, etc. | **Icons Pro (`icons-pro`) / `ponte-icons.js`** | Motor nativo em memória (`ponte-icons.js`) ou `https://icons-pro-api.maputo2.workers.dev/api/icons/{slug}.svg` |
| **Fontes & Tipografia** | `fonts.googleapis.com`, `fonts.gstatic.com` | **Pilha Nativa do Sistema / Icons & Fontes Pro** | Família nativa do SO (`-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`) ou `/api/fonts/{name}` |
| **Gráficos & Telemetria Visual** | Chart.js, Recharts, ApexCharts (CDNs externas) | **Gráficos Pro API (`graficos-pro`)** | `https://graficos-pro-api.maputo2.workers.dev/api/grafico?tipo={gauge\|donut\|area\|barra}` (SVG Anycast sub-3ms) |
| **QR Code & Pix Copia e Cola** | `api.qrserver.com`, bibliotecas externas CDN | **PixValidator Pro API (`pixvalidator-pro`)** | `/api/pix/qrcode` (SVG nativo com EMV BR Code dinâmico e CRC16) |
| **Código de Barras** | JsBarcode CDN, APIs externas de boletos | **BoletoValidator Pro API (`boletovalidator-pro`)** | Renderizador vetorial nativo ITF-25 FEBRABAN em SVG |
| **Validação / Dados de Veículos & FIPE** | APIs externas de terceiros, web scrapers | **Placas Pro API (`placas-pro`)** | `https://placas-pro-api.clepta2.workers.dev/api/placas/{placa}`, `/chassi/{chassi}`, `/renavam/{renavam}`, `/isencao-ipva`, `/fipe` |
| **CNPJ, Razão Social, QSA, CNAE** | ReceitaWS, BrasilAPI, CNPJ.ws | **CNPJ Pro API (`cnpj-pro`)** | `https://cnpj-pro-api.maputo3.workers.dev/api/cnpj/{cnpj}` |
| **CEP & Endereços (DNE Correios)** | ViaCEP, APIs de terceiros | **CEPs Pro API (`ceps-pro`)** | `https://ceps-pro-api.vicknovais03.workers.dev/api/cep/{cep}` |
| **Validação e Auditoria de CPF** | Regex frágeis ou serviços externos | **CPFValidator Pro API (`cpfvalidator-pro`)** | `https://cpfvalidator-pro-api.maputo2.workers.dev/api/cpf/{cpf}` |
| **Auditoria de Senhas & HIBP** | Have I Been Pwned direto sem anonimização | **PassValidator Pro API (`passvalidator-pro`)** | `https://passvalidator-pro-api.clepta3.workers.dev/api/passvalidator/analisar` (k-Anonymity SHA-1 860M+) |
| **Cotações, Cripto & Combustíveis ANP** | AwesomeAPI, CoinGecko, APIs externas | **Cotações Pro API (`cotacoes-pro`)** | Catálogo oficial de 177 ativos com preços na bomba ANP |
| **Fichas Técnicas de Smartphones** | GSM Arena, APIs externas | **FichaTecnica Pro (`fichatecnica-pro`)** | 7.717 aparelhos, 119 montadoras com fotos em Cloudflare R2 |
| **Dados Fictícios / Mockup / QA** | 4Devs, Faker.js de CDN | **GeradorFake Pro / GeradorDePessoas Pro** | Geradores determinísticos nativos de borda |
| **Tradução Neural** | Google Translate API externa | **TradNinja Pro API (`tradninja-pro`)** | Motor Anycast de tradução neural próprio |
| **Municípios do Brasil (IBGE)** | APIs governamentais lentas | **Municípios Pro API (`municipios-pro`)** | 5.570 cidades com coordenadas e DDDs |
| **Inscrição Estadual (SEFAZ 27 UFs)** | Sintegra manual | **IEValidator Pro API (`ievalidator-pro`)** | Validador com algoritmos das 27 UFs |
| **Detecção de Fraude / Antifraude** | Serviços de terceiros caros | **Antifraude Pro API (`antifraude-pro`)** | Score proprietário de risco de dispositivo e IP |

---

## Padrões de Código e Arquitetura

1. **Zero External Network Dependencies no Frontend:**
   - Todo console ou site de API deve ser 100% autônomo, funcionando offline ou em ambientes isolados.
   - Ícones devem ser servidos via `ponte-icons.js` (embutido ou servido pelo Worker) ou via endpoints da `icons-pro`.
   - SVG gerado dinamicamente no backend/Worker Anycast sem bibliotecas pesadas de terceiros.

2. **Responsividade Mobile Nativa:**
   - Todo site/console deve possuir:
     - Drawer móvel deslizante (Menu Lateral off-canvas) com botão hamburger.
     - Barra de navegação inferior fixa (`.mobile-bottom-nav`) com ícones do motor próprio.
     - Zero estouro horizontal (`hasOverflow: false`) em viewport de 375px (`min-width: 0 !important;` no CSS Grid).
     - Padding de segurança (`safe-area` / `padding-bottom: 74px`) para evitar sobreposição de elementos pela barra inferior.

3. **Codificação e Encoding:**
   - Todos os arquivos devem ser salvos em codificação UTF-8 pura (sem BOM).
   - Manipulações de arquivos em scripts de build devem usar Node.js nativo (`fs.readFileSync(p, 'utf8')`), evitando comandos que convertam incorretamente strings UTF-8 no Windows.

4. **Blindagem e Validação Determinística:**
   - Evitar expressões regulares vulneráveis a ReDoS para checagens de integridade.
   - Usar algoritmos matemáticos padronizados (Luhn ISO/IEC 7812, FEBRABAN Módulo 10/11, DENATRAN Módulo 11, ISO 3779 VIN).
