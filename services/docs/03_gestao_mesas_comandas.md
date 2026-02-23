# Gestão de Mesas e Comandas

A infraestrutura de Mesa (Table) e Comanda (Tab) dita o faturamento lógico de qualquer sessão no restaurante. Elas existem de forma complementar.

## 1. Entidade Mesa (`Table`)
Representa um espaço físico ou alocação abstrata de assentos dentro do restaurante.
- Um restaurante (`Tenant`) possui `1..N` Mesas.
- **Regras de Status das Mesas**:
  - `AVAILABLE` (Livre): A mesa não detém nenhuma Sessão de WhatsApp ou Comanda aberta.
  - `OCCUPIED` (Ocupada): Há usuários atrelados fisicamente/digitalmente a esta mesa consumindo via WhatsApp ou análogo. **Requer uma `Tab` vinculada.**
  - `RESERVED` (Reservada): Aguarda a ocupação.
  - `CLEANING` (Em Limpeza): A conta foi paga e o garçom marcou via dashboard que a mesa deve ser checada.

## 2. Fluxo de Integração Cliente-Mesa (Table Requests)
O Módulo assíncrono de `TableRequests` resolve o problema de **"Como vincular um Celular de Cliente à Vida Inteira de uma Comanda"**.

### Rota A: Escaneando o QR Code (Self Service)
1. Cliente senta e lê um QRCode em seu celular que dispara via `[App do WhatsApp]` uma mensagem predefinida: `"MESA 05"`.
2. O Core detecta a tag `"Mesa"` em Regex/Parsing.
3. Transita a sessão do usuário para `WAITING_TABLE_CONFIRMATION` pedindo a quantia de Pessoas.
4. Constrói um `TableRequest` (`RequestStatus = PENDING`) que dispara notificação via Redis para atualizar automaticamente o WebSocket do Node-Admin.
5. O cliente fica "parcialmente" bloqueado aguardando no WhatsApp.

### Rota B: Forçando a Mesa via Admin (Alocação Manual)
1. Cliente senta sem escanear o QRCode e chama o Garçom.
2. O Garçom pelo painel Node abre "Forçar Mesa Manual".
3. Vincula o WhatsApp do cliente (`5511...`) a um número de Mesa Livre.
4. O Admin emite imediatamente um evento de aprovação da solicitação (`APPROVE`) na fila `admin.table.events`.
5. Ponto de convergência da Rota A e B: Ambos vão pro fluxo de **Assentamento da Mesa**.

### Fluxo de Assentamento e Abertura (Go-Core AMQP Consumer)
A aprovação, quer seja via modal do painel ou do click de aprovar na sidebar de _solicitações pendentes_, emite o evento RabbitMQ lido pelo worker Go:
- O banco atualiza o request para `APPROVED`.
- O status da Table é alterado para `OCCUPIED`.
- Ocorre a geração de UUID da nova Comanda (`Tab`) com status `OPEN`.
- A Sessão de WhatsApp vincula o `TableID` e a recém-criada `TabID`, e o cliente é destravado no bot (liberado para pedir itens).

## 3. Entidade Comanda (`Tab`)
- Atributos vitais calculados dinamicamente: `Subtotal`, `ServiceFee`, `Total` e `PaidAmount`.
- **Estados**: `OPEN`, `WAITING_PAYMENT`, `PARTIALLY_PAID`, `PAID`, `CLOSED`.
- Quando um **Pedido (`Order`)** é confirmado na Cozinha e alterado o status (Ex: `DELIVERED`), o valor dos itens é somado a função `tab.AddOrderTotal(orderTotal)` na camada de serviço. A taxa de serviço (`tab.CalculateTotal(...)`) recalcula sobre todos os somatórios.

## 4. Mesas Compartilhadas e Comandas Individuais (Split Checks - Fase 14)
Para lidar com a realidade de dividir a conta de maneira precisa, uma única mesa `Table` pode possuir múltiplas `Tabs` vinculadas em simultâneo.
- O sistema acompanha a `Tab` "principal" (A primeira a ser aberta na mesa).
- Outro usuário pode escanear o mesmo QR Code da mesa já ocupada e optar por:
  - **Entrar na Comanda** (Compartilhada: Todos veem e pedem na mesma conta primária).
  - **Comanda Individual** (Uma nova `Tab` secundária é criada vinculada à mesma mesa, permitindo que a pessoa peça e pague apenas o dela).

## 5. Autorização para Entrar na Mesa (Tab Join Approval - Fase 15)
Como segurança, a entrada de convidados na mesa (mesmo para Split Checks) não é feita automaticamente.
1. O novo cliente escaneia o QRCode e seleciona a modalidade de entrada (Compartilhada/Individual).
2. O sistema emite um `TabJoinRequest` em status `PENDING`.
3. O cliente fica em estado de espera no WhatsApp (`StateWaitingJoinApproval`).
4. O cliente original que abriu a mesa (o `Opener`) recebe uma notificação interativa com opções para `✅ Aprovar` ou `❌ Recusar` (`StateWaitingOpenerDecision`).
5. Apenas com a aprovação do dono a pessoa acessa o cardápio e os pedidos da mesa.
