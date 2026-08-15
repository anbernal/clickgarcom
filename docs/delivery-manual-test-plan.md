# Plano de teste manual visual — Delivery V2

Este roteiro é para validar o módulo visualmente no Admin, no KDS e no fluxo
fake de Delivery. Ele não depende do sandbox do iFood. O objetivo é confirmar
que o operador consegue configurar, criar, acompanhar e resolver entregas sem
expor PII, credenciais, PIN ou detalhes técnicos ao usuário.

## 0. Resultado dos builds locais

Executados antes do teste manual:

```bash
cd apps/tenant-admin/api && npm run build
cd platform/core-backend && go build ./...
cd apps/kds-mobile && npx tsc --noEmit
```

Regressões automatizadas aprovadas:

```text
Core Go: go test ./...                 OK
API smoke: 4/4                         OK
API contrato: 4/4                     OK
API segurança: 2/2                    OK
Admin Delivery UX: 17/17              OK
Admin/KDS UX: 9/9                     OK
```

O frontend Admin é estático e não possui etapa de compilação; o servidor é
executado diretamente com `node server.js`.

## 1. Preparar o ambiente

### 1.1 Serviços

Para o fluxo completo, iniciar PostgreSQL, RabbitMQ, Core Go, worker e API
NestJS. As migrations são `000040` até `000045`.

Variáveis mínimas:

```bash
DATABASE_HOST=localhost
DATABASE_PORT=5432
DATABASE_USER=postgres
DATABASE_PASSWORD=postgres123
DATABASE_NAME=clickgarcom_db
RABBITMQ_HOST=localhost
RABBITMQ_PORT=5672
RABBITMQ_USER=clickgarcom
RABBITMQ_PASSWORD=clickgarcom123
RABBITMQ_VHOST=/
INTERNAL_SERVICE_TOKEN=clickgarcom-internal-token
DELIVERY_FAKE_PROVIDER_MODE=SUCCESS
```

O `DELIVERY_CREDENTIAL_ENCRYPTION_KEY` só é necessário para testar gravação de
credenciais criptografadas. O fake não chama iFood, CEP ou Maps externos.

### 1.2 Executar os processos

Em terminais separados, a partir da raiz do projeto:

```bash
# API NestJS
cd apps/tenant-admin/api
npm run build
ADMIN_WEB_ENABLED=false npm run start:prod
```

```bash
# Core HTTP
cd platform/core-backend
go run ./cmd/api
```

```bash
# Worker/outbox
cd platform/core-backend
go run ./cmd/worker
```

```bash
# Admin Web
cd apps/tenant-admin/web
PORT=4318 node server.js
```

Abrir `http://localhost:4318/login.html`.

Para visualizar o KDS mobile no navegador:

```bash
cd apps/kds-mobile
npm run web
```

### 1.3 Dados QA

Se o banco estiver disponível, executar:

```bash
cd apps/tenant-admin/api
npm run seed:qa
```

Credenciais geradas pelo seed:

```text
Tenant: Anderson Restaurant
Login: admin.qa@clickgarcom.local
Senha: Teste@123
```

Criar depois um usuário `DISPATCHER` no Admin para validar o limite de
permissões. Não usar telefone, endereço ou credencial real nas evidências.

## 2. Configuração e acesso

### T01 — Acesso por perfil

1. Entrar como `ADMIN` e abrir **Entregas**.
2. Confirmar que aparecem configuração, clientes/endereço, operação,
   exceções, reservas e relatório.
3. Entrar como `MANAGER`; confirmar operação e fallback, mas não gravação de
   segredo.
4. Entrar como `DISPATCHER`; confirmar saída/conclusão própria e fallback
   autorizado, sem configurações sensíveis.
5. Entrar como `KITCHEN`, `BAR` ou `CASHIER`; confirmar que o acesso é somente
   o previsto pela matriz de permissões.
6. Confirmar que usuário `DRIVER` não acessa a central administrativa.

**Esperado:** nenhuma tela indevida aparece no menu e nenhuma credencial fica
no DOM.

### T02 — Ativar entrega própria

1. Abrir **Configurar operação**.
2. Ativar o módulo e selecionar **Entrega própria**.
3. Informar origem, raio e quantidade de entregadores disponíveis.
4. Configurar cada modelo de taxa: `NONE`, `FIXED`, `DISTANCE_BANDS`, `PER_KM`
   e `HYBRID`.
5. Usar o simulador e observar breakdown, centavos e valor final.
6. Salvar, recarregar a página e comparar o snapshot salvo.
7. Reduzir a capacidade abaixo das reservas exibidas; confirmar o alerta
   persistente de capacidade insuficiente.
8. Desativar o módulo e confirmar a janela de confirmação.

**Esperado:** a configuração fica vinculada ao tenant, a taxa vem da API, não
há seletor de entregador individual e a desativação não remove entregas já
ativas.

### T03 — Configurar operador externo fake

1. Selecionar **Operador externo** e manter `IFOOD` na ordem configurada.
2. Abrir **Gerenciar credenciais**.
3. Informar valores de teste e salvar.
4. Reabrir o modal e confirmar que os segredos não retornam.
5. Clicar em **Testar conexão fake**.
6. Confirmar status `CONNECTED` e adapter `FAKE`.

**Esperado:** nenhuma chamada para domínio externo, nenhum segredo no DOM ou
no relatório, e a ordem do operador continua controlada pelo tenant.

## 3. Cliente, endereço e cotação

### T04 — Cadastro por telefone e CEP

1. Abrir **Clientes e endereços**.
2. Buscar o telefone de teste `5511999999999`.
3. Criar um endereço usando CEP `01311-000`.
4. Confirmar preenchimento de logradouro, bairro, cidade e UF.
5. Editar o número/complemento, salvar e definir como default.
6. Excluir o endereço e confirmar a operação.
7. Tentar criar um sexto endereço para o mesmo cliente.

**Esperado:** o CEP preenche o formulário sem apagar dados manuais, o endereço
é editável/excluível, o limite de cinco é respeitado e o histórico de entregas
não muda.

### T05 — Falha de CEP e confirmação manual

1. Informar um CEP inexistente ou simular resposta `NOT_FOUND`.
2. Preencher o endereço manualmente.
3. Confirmar o endereço e voltar ao checkout.

**Esperado:** a falha não apaga o formulário; o endereço manual só fica
disponível depois de confirmado e o cliente não vê erro técnico.

### T06 — Cotação própria

1. Selecionar uma área dentro do raio configurado.
2. Solicitar a cotação.
3. Repetir a cotação sem alterar o endereço.
4. Testar uma distância fora da última faixa.

**Esperado:** o mesmo input produz o mesmo valor, a faixa inválida fica
indisponível e nenhuma fórmula é calculada pelo navegador.

## 4. Fluxo de entrega própria

### T07 — Checkout, capacidade e pagamento

1. Criar um pedido Delivery próprio pelo fluxo WhatsApp/Core ou pelo endpoint
   interno de QA.
2. Confirmar endereço, frete e total.
3. Confirmar o pagamento.
4. Voltar ao board de Entregas.

**Esperado:** o checkout cria hold/reserva de capacidade, o frete aparece
separado, o preço fica congelado e o card não exibe motorista, GPS, PIN ou
tracking próprio.

### T08 — Fila Delivery no KDS, expedição e entrega própria

1. Abrir o KDS como `ADMIN`, `MANAGER`, `WAITER` ou `DISPATCHER` e acessar a
   aba **🛵 Delivery**.
2. Confirmar que o pedido pago aparece em **Aguardando preparo**, sem ação de
   mesa, comanda ou chamar garçom.
3. Clicar em **Definir previsão e iniciar preparo**, informar os minutos e
   confirmar que o pedido aparece na cozinha/bar somente como item de preparo
   e que a entrega muda para **Em preparo**.
4. Marcar todos os itens como prontos no KDS de cozinha/bar.
5. Confirmar que a entrega migra para **Pronto para saída** e clicar em
   **Imprimir expedição**.
6. Conferir no ticket: código do pedido, itens, endereço, referência, telefone,
   frete e total.
7. Clicar em **Registrar saída** e depois em **Confirmar entrega**.
8. Repetir rapidamente os dois comandos e abrir a linha do tempo/reservas.

**Esperado:** a jornada é `aguardando preparo -> em preparo -> pronto para
saída -> em rota -> entregue`; não há motorista individual, PIN ou tracking
próprio. A segunda tentativa é idempotente, a reserva é liberada uma única vez
e o usuário responsável fica registrado na auditoria.

### T08.1 — Mensagens ao cliente durante a entrega

1. Repetir T08 usando um telefone de QA no WhatsApp.
2. Após iniciar o preparo, confirmar uma única mensagem com a previsão
   escolhida: “Seu pedido foi aceito e está sendo preparado. A previsão é de
   10 minutos.”
3. Após **Registrar saída**, confirmar uma única mensagem: “Seu pedido está indo
   até você”.
4. Após **Confirmar entrega**, confirmar uma única mensagem: “Entrega
   confirmada. Volte sempre!”.
5. Confirmar que a aprovação do pagamento é informada apenas no checkout e não
   gera uma quarta mensagem normal no WhatsApp.

**Esperado:** exatamente três mensagens no fluxo feliz. Mensagens de falha ou
cancelamento continuam sendo exceções operacionais e não contam neste total.

## 5. Fluxo externo fake

### T09 — Quote antes do pagamento

1. Reiniciar a API com `DELIVERY_FAKE_PROVIDER_MODE=SUCCESS`.
2. Selecionar modalidade externa.
3. Solicitar quote antes do pagamento.
4. Confirmar o checkout e o pagamento.
5. Iniciar o preparo no Core/KDS.

**Esperado:** a contratação só inicia após `PREPARING`, o total do cliente não
muda e o custo cotado fica separado do custo efetivo.

### T10 — Atribuição, tracking e conclusão

1. No board, observar `ALLOCATION_PENDING`, tentativas e atribuição.
2. Confirmar tracking externo somente no detalhe autorizado.
3. Confirmar que o código/PIN não aparece na listagem nem na API Admin.
4. Usar o modo `DELIVERED` para simular conclusão imediata.

**Esperado:** a timeline é cronológica, o link pertence à entrega correta e o
modo próprio nunca gera tracking.

### T11 — Cinco falhas e alerta

1. Reiniciar a API com:

   ```bash
   DELIVERY_FAKE_PROVIDER_MODE=FAIL_FIRST_N \
   DELIVERY_FAKE_PROVIDER_FAILURES=5
   ```

2. Iniciar o preparo de uma nova entrega externa.
3. Acompanhar as tentativas 1 a 5 e a janela de 15 minutos.
4. Abrir o **Centro de exceções**.
5. Reconhecer o alerta e atualizar a tela.

**Esperado:** não existe sexta tentativa, aparece `CYCLE_EXHAUSTED`/`NO_COURIER`,
o pedido permanece válido, a mensagem é não técnica e o reconhecimento não
encerra a exceção.

## 6. Fallback, concorrência e relatórios

### T12 — Fallback administrativo

1. Com ciclo esgotado, reiniciar o ciclo pelo perfil autorizado.
2. Confirmar motivo e observar a nova sequência `cycle 1 / attempt 1`.
3. Converter a entrega para própria.
4. Tentar converter sem capacidade disponível.
5. Repetir a mesma ação com a versão antiga.

**Esperado:** o preço do cliente permanece, o histórico é preservado, a falta
de capacidade não gera mutação parcial e a segunda ação retorna conflito
controlado.

### T13 — Relatório operacional

1. Abrir **Relatório operacional**.
2. Filtrar período, modalidade `OWN`, operador `FAKE` e status de falha/retorno.
3. Carregar o relatório.
4. Exportar CSV.
5. Repetir com um período acima de 500 registros fake, se disponível.

**Esperado:** KPIs e valores em BRL conciliam com o detalhe, o alerta de volume
alto aparece e o CSV não contém telefone, endereço, PIN ou credencial.

### T14 — Responsividade e acessibilidade visual

1. Repetir T02, T04 e T13 em viewport de 360 px.
2. Repetir operação em tablet.
3. Abrir e fechar cada modal usando teclado.
4. Confirmar foco inicial no modal e retorno do foco ao acionador.
5. Confirmar que botões principais têm alvo touch confortável.

**Esperado:** sem rolagem horizontal acidental, sem conteúdo cortado, foco
visível e mensagens de erro próximas ao campo correspondente.

## 7. Regressão KDS/mobile

1. Abrir o KDS Web e validar cozinha, bar, salão, comandas e a nova fila
   **Delivery**.
2. Abrir uma nova comanda e confirmar alinhamento dos campos.
3. Validar QR/link seguro e encerramento da comanda.
4. Abrir o KDS mobile com `npm run web` e testar a tela de demonstração.
5. Repetir em viewport de telefone.

**Esperado:** Delivery não exige o app de entregador, não se mistura ao painel
presencial, e DINE_IN/TAKEOUT continuam operando sem alteração.

## 8. Evidências e limpeza

Para cada caso registrar:

- número do caso (`T01`–`T14`, incluindo `T08.1`);
- screenshot ou gravação curta;
- tenant fictício, `delivery_id` e `checkout_key` sem PII;
- status observado e resultado esperado;
- erro, horário e perfil usado, quando houver.

Não registrar token, telefone real, endereço completo, PIN, credencial ou corpo
bruto de webhook.

Ao terminar:

1. Desativar o módulo no tenant QA.
2. Encerrar API, Core, worker e servidores Web.
3. Restaurar `DELIVERY_FAKE_PROVIDER_MODE=SUCCESS`.
4. Se o banco estiver disponível, remover/recriar somente o tenant QA usando o
   seed; nunca limpar dados de outros tenants.

## 9. Bloqueios conhecidos

O adapter iFood real, sandbox, pagamento real, scanner axe/LGPD, métricas em
infraestrutura e teste de carga com PostgreSQL/RabbitMQ continuam fora deste
roteiro fake e devem ser executados na homologação.
