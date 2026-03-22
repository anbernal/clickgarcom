# Visão Geral do Sistema (System Overview)

## 1. Propósito do Produto
O **ClickGarçom** é um ecossistema digital B2B2C projetado para revolucionar o atendimento em restaurantes, bares e lanchonetes. A plataforma centraliza o autoatendimento do cliente final via WhatsApp e fornece um Painel Administrativo moderno para que o estabelecimento gerencie pedidos, mesas, comandas e relatórios em tempo real.

## 2. Arquitetura de Alto Nível
O sistema adota uma arquitetura híbrida de microsserviços:
- **Go-Core Backend**: Escrito em Go (Golang), atua como o motor de regras críticas (Máquina de Estados do WhatsApp, Processamento de Pedidos e Cálculos de Comandas). Foca em alta concorrência e resiliência.
- **Node-Admin BFF (Backend-for-Frontend)**: Escrito em Node.js (NestJS), serve o Painel Administrativo em HTML/CSS/JS puro, atuando também como API Gateway para as ações dos gerentes administrativos.
- **Comunicação Assíncrona**: Utiliza o **RabbitMQ** para o tráfego de eventos entre os microsserviços (ex: `admin.table.events`, `whatsapp.messages`, `order.events`).
- **Persistência**: Bancos de dados **PostgreSQL** (fonte de verdade relacional para Tabelas, Sessões, Pedidos) e **Redis** (Pub/Sub e WebSocket tracking).

## 3. Personas do Sistema
- **Cliente (Usuário Final)**: Consumidor que está no restaurante. Interage primariamente pelo WhatsApp, escaneando o QR Code da mesa ou conversando diretamente com o número do restaurante.
- **Atendente/Garçom**: Utiliza o Painel Admin. Recebe e aprova pedidos, entrega itens na mesa, gerencia o fechamento de comandas e pode alocar clientes em mesas de forma manual.
- **Gerente/Dono do Restaurante**: Acessa métricas financeiras, gerencia o cardápio, aprova e administra o fluxo das mesas, supervisionando todos os indicadores-chave de desempenho (KPIs) via Dashboard.

## 4. Diferenciais Competitivos (USPs)
- Ausência de download de aplicativos: Toda a jornada do cliente (visualizar cardápio, pedir, acompanhar e finalizar) acontece via **WhatsApp**.
- Interface administrativa Web fluída com suporte a comunicação em tempo real via WebSockets e filas de mensageria.
- Separação entre Pedido e Comanda (gestão de múltiplos pedidos deificados dentro de uma única sessão de pagamento e serviço).
