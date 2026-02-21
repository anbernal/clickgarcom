# Funcionalidades do Painel Administrativo

O **Node-Admin BFF (Backend-for-Frontend)** provê as interfaces gráficas em HTML/JS/CSS puros servidas de maneira estática pela própria API Rest em NestJS, e atua também como Gateway para consumo do bando de dados (TypeORM + PostgreSQL) e publicação de RabbitMQ.

## 1. Módulos e Controllers da API NestJS
A API está dividida de forma limpa em features:
- **`Categories` e `Menu`**: Onde os gerentes do restaurante cadastram, pausam ou alteram preços dos itens do Menu, sincronizando em "tempo real" com o que o cliente vê no WhatsApp.
- **`Orders`**: Foca em consultar o estado de pedidos e despachá-los (Status: `PENDING` -> `PREPARING` -> `DELIVERED`).
- **`Tables`**: Visões sobre mesas (Status: `AVAILABLE`, `OCCUPIED`), acesso a `Tabs` (Comandas) em tempo integral (totalização, taxa de serviço e afins), e gerenciador de `TableRequests`.
- **`Reports`**: Módulo analítico do Dashboard para calcular lucros brutos totais do dia, tickets em andamento, itens mais vendidos na semana e gráficos em barras/linhas via Chart.js agregando faturamentos.

## 2. Visão Geral da Interface (UI)
As páginas Web estão roteadas de forma visual SPA (Single Page Application via DOM hidden trick) na pasta `public/js/app.js`.
- **Dashboard (`dashboard.js`)**: Cards numéricos superiores e exibição consolidada dos lucros através de Fetch API na rota `/admin/api/reports/stats`. Componente gráfico implementado via Chart.js 3+.
- **Pedidos (`pedidos.js`)**: O coração da operação na Cozinha/Balcão. É um painel Kanban-style onde as Ordens PENDING aparecem automaticamente (para isso existe polling dinâmico) e os funcionários podem migrar ordens na linha do tempo. Ideal para rodar em um Tablet para despacho.
- **Comandas e Mesas (`mesas.js`)**: Mapa estrutural do estabelecimento. 
  - Exibe cards das Mesas (Numeradas) pintados por status.
  - Oferece Botões para "Forçar Mesa Livre" ou "Ver Comanda".
  - Aglomera um Sidebar vital (Solicitações Pendentes): Uma seção que captura clientes esparços pedindo mesa via WhatsApp QR Code, aguardando um Click do lado do Admin para soltar as amarras (Aprovar requisição via RabbitMQ Publisher).

## 3. Segurança e AMQP
O Node-Admin não roda o WhatsApp internamente, garantindo escalabilidade caso o Worker do Go trave por picos absurdos no final de semana.
Ao invés disso, o Admin usa o **AmqpService** injetado globalmente que publica eventos seguros (`admin.table.events`) para que o Go processamento as interações de mensageria com os servidores da Meta (WhatsApp Cloud).
