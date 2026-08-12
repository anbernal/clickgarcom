# Especificação técnica do módulo de logística e Delivery

Entrega própria simplificada e integração com operadores externos para pedidos recebidos pelo ClickGarçom

| Documento | Definição |
|---|---|
| Objetivo | Servir como fonte técnica para criação das tasks de backend, frontend, WhatsApp, banco de dados, segurança, testes e operação do módulo de Delivery. |
| Produto | ClickGarçom |
| Região inicial | Osasco/SP, sem restrição arquitetural que impeça outros municípios brasileiros. |
| Modelo de isolamento | SaaS multi-tenant; cada restaurante ou filial é um tenant independente. |
| Canal inicial | Pedidos recebidos pelo WhatsApp, com operação complementar no Admin do tenant. |
| Modalidades | Entrega própria simplificada ou entrega externa. |
| Operador externo inicial | iFood Sob Demanda para pedidos originados fora do iFood. |
| Versão | 2.0 — 09/08/2026 |
| Status | Decisões de produto consolidadas; pronta para decomposição em tasks. |

> Este documento adapta a ideia original à arquitetura e ao domínio já existentes no ClickGarçom. Em caso de conflito com documentos anteriores em `specs/delivery`, as decisões de escopo descritas aqui devem orientar a revisão das próximas tasks. Código já implementado deve ser preservado sempre que continuar útil e desativado por feature flag quando estiver fora do novo MVP.

# 1. Objetivo do módulo

O módulo de Delivery permitirá que cada tenant habilite o recebimento de pedidos para entrega, cadastre configurações logísticas próprias, reutilize endereços confirmados de seus clientes, calcule o frete antes do pagamento e acompanhe a execução da entrega pelo painel administrativo.

O tenant deverá escolher uma modalidade padrão antes de receber pedidos:

- `OWN`: entrega realizada por frota própria do restaurante;
- `EXTERNAL`: entrega contratada em conta própria do restaurante junto a um operador externo.

O ClickGarçom atuará como integrador técnico. O contrato comercial, a conta, as credenciais, a cobrança do operador e eventuais custos de cancelamento pertencem ao restaurante. O ClickGarçom não receberá nem repassará o pagamento devido ao operador logístico.

## 1.1 Resultado esperado

Quando o módulo estiver habilitado e configurado, o sistema deverá:

1. identificar o cliente pelo número do WhatsApp dentro do tenant;
2. permitir cadastrar e reutilizar até cinco endereços por cliente;
3. consultar CEP para facilitar o preenchimento;
4. geocodificar e confirmar o endereço completo;
5. quando a origem for informada por latitude/longitude ou pela localização do navegador, executar geocodificação reversa, preencher o endereço e exigir revisão do número antes da ativação;
5. verificar área de atendimento e disponibilidade logística;
6. calcular ou obter o frete antes de o cliente pagar;
7. adicionar o frete ao total do pedido;
8. congelar o valor confirmado pelo cliente;
9. reservar capacidade própria ou guardar a cotação externa;
10. iniciar a contratação externa quando o pedido entrar em preparo;
11. permitir intervenção administrativa quando não houver entregador;
12. manter histórico, idempotência, isolamento por tenant e auditoria.

## 1.2 Princípios obrigatórios

- Cada filial é um tenant; não será criada uma entidade de unidade/filial neste módulo.
- Configuração de um tenant nunca poderá ser usada por outro tenant.
- O endereço do cadastro e o endereço usado no pedido são registros diferentes.
- Cada pedido guarda um snapshot imutável do endereço confirmado.
- A taxa cobrada do cliente e o custo do operador são valores diferentes.
- O valor confirmado pelo cliente não será alterado após o pagamento.
- Mudanças de configuração valem somente para novos pedidos, salvo override explícito e auditado.
- O tenant não troca automaticamente de operador; a troca após falha é manual.
- Integrações externas ficam atrás de contrato neutro e adaptadores substituíveis.
- Nenhuma chamada externa participa da transação principal de pedido ou pagamento.
- Toda mutação logística relevante deve ser idempotente e auditável.

# 2. Escopo

## 2.1 Escopo obrigatório do primeiro módulo

- ativação do módulo no Admin do tenant;
- configuração da modalidade padrão `OWN` ou `EXTERNAL`;
- cadastro de clientes identificado por telefone;
- cadastro, edição, confirmação e exclusão lógica de endereços;
- consulta de CEP por adaptador substituível;
- preenchimento manual quando o CEP não for localizado;
- geocodificação do endereço completo;
- cálculo de rota, distância e elegibilidade;
- entrega própria por quantidade declarada de entregadores, sem cadastro individual;
- preço próprio fixo, por faixas, por quilômetro ou híbrido;
- adicionais e regras de arredondamento configuráveis;
- cotação externa antes do pagamento;
- iFood Sob Demanda como primeiro adaptador externo;
- contratação externa ao iniciar o preparo;
- cinco tentativas de alocação para o operador selecionado em uma janela de 15 minutos;
- alerta ao restaurante e ao cliente quando não houver entregador;
- troca manual do operador ou conversão manual para entrega própria;
- tracking e código de confirmação fornecidos pelo operador externo;
- estados simplificados de entrega própria;
- painel administrativo, auditoria, métricas e testes.

## 2.2 Fora do escopo inicial

- escolha automática por menor preço ou menor prazo;
- comparação automática entre entrega própria e externa;
- troca automática para o próximo operador;
- cadastro individual de entregadores próprios;
- aplicativo dedicado ao entregador próprio;
- coleta de localização da frota própria;
- tracking próprio do ClickGarçom para frota própria;
- PIN gerado ou validado pelo ClickGarçom;
- roteirização de múltiplas entregas;
- otimização de rota ou agrupamento de pedidos;
- repasse financeiro ao operador ou ao entregador;
- responsabilidade do ClickGarçom pela execução física da entrega;
- marketplace público de restaurantes;
- endereço temporário não salvo;
- cadastro persistente do nome do cliente;
- multiunidade dentro do mesmo tenant;
- entrega internacional;
- seleção automática de operador por score.

## 2.3 Evoluções previstas, mas não comprometidas no MVP

- Uber Direct e Lalamove como novos adaptadores;
- troca automática de operador, se o produto for revisto;
- tracking unificado dentro do ClickGarçom;
- entregadores próprios individuais;
- disponibilidade por entregador;
- aplicativo do entregador, localização, geofence, foto e PIN próprio;
- múltiplos endereços favoritos acima do limite inicial;
- áreas por polígono, CEP ou bairro;
- relatórios financeiros avançados e conciliação automática.

# 3. Relação com o sistema atual

O ClickGarçom já possui:

- Core Go/Fiber para WhatsApp, workers, outbox e WebSocket;
- API NestJS/TypeORM para domínio administrativo, RBAC e auditoria;
- PostgreSQL como fonte persistente;
- Redis para sessões, cache e projeções efêmeras;
- RabbitMQ para eventos assíncronos;
- pedidos operacionais separados por cozinha/bar;
- `order_batch` como agrupador da compra;
- agregado `Delivery` associado a `tenant_id`, `tab_id` e `batch_id`;
- endereço, distância, taxa, ETA e snapshots no agregado existente;
- timeline, idempotência e eventos de domínio;
- infraestrutura anterior de tracking e PIN.

## 3.1 Decisão de reaproveitamento

O agregado `Delivery` continuará representando a entrega de um lote. Não será criada uma segunda entrega concorrente para o mesmo lote.

Será adicionada uma camada de execução logística, chamada `DeliveryFulfillment`, subordinada ao `Delivery`:

```text
OrderBatch
   |
   +-- Delivery
          |
          +-- DeliveryFulfillment OWN
          |      +-- reserva de capacidade
          |      +-- saída manual
          |      +-- conclusão manual
          |
          +-- DeliveryFulfillment EXTERNAL
                 +-- cotação
                 +-- ciclo de alocação
                 +-- tentativas
                 +-- ID externo
                 +-- tracking do operador
                 +-- webhooks
```

## 3.2 Funcionalidades anteriores que não serão exigidas neste MVP

As estruturas existentes de entregador individual, KDS Mobile, localização, tracking público próprio e PIN não devem bloquear o novo módulo. Elas poderão permanecer no código atrás de feature flags, mas o fluxo novo não dependerá delas.

Para entrega própria, a interface operacional exibirá somente:

- `AGUARDANDO_ENTREGADOR`;
- `SAIU_PARA_ENTREGA`;
- `ENTREGUE`;
- exceções de cancelamento ou falha quando aplicáveis.

# 4. Perfis e permissões

| Perfil | Permissões no novo módulo |
|---|---|
| `ADMIN` | Ativar/desativar módulo, configurar modalidade, tarifas, capacidade, operadores, credenciais, clientes e endereços; executar overrides. |
| `MANAGER` | Operar entregas, alterar modalidade de uma entrega em falha, administrar clientes/endereços e concluir entrega própria. Não altera segredo externo salvo, salvo permissão explícita futura. |
| `DISPATCHER` | Novo papel recomendado: acompanhar, iniciar saída, concluir entrega própria, reiniciar ciclo e selecionar fallback permitido. |
| `WAITER` | Criar/consultar pedido e confirmar endereço; sem acesso a credenciais ou configurações sensíveis. |
| `KITCHEN`/`BAR` | Atualizar produção; entrada em preparo dispara evento logístico, mas esses perfis não operam o fulfillment. |
| `CASHIER` | Consultar valor de frete no pagamento; sem alteração logística por padrão. |
| Cliente | Cadastrar, confirmar, editar e excluir os próprios endereços pelo número autenticado do WhatsApp. |
| Sistema | Cotar, reservar capacidade, executar tentativas, processar webhooks, notificar e auditar. |

Todas as autorizações administrativas devem derivar `tenant_id` do JWT. Chamadas internas entre Go e NestJS devem usar credencial de serviço e transportar `tenant_id` validado pelo backend proprietário.

# 5. Ativação e configuração do módulo

## 5.1 Feature flag

O módulo será ativado por tenant em `settings.delivery.enabled`.

Com `enabled=false`:

- o bot não oferece a opção Delivery;
- endpoints operacionais recusam criação de novo Delivery;
- menus administrativos podem mostrar a configuração, mas não ações operacionais;
- pedidos `DINE_IN` e `TAKEOUT` continuam sem alteração;
- entregas já ativas devem continuar operáveis até um estado terminal.

## 5.2 Pré-requisitos para ativação

### Modalidade própria

- origem do restaurante confirmada;
- raio ou área de atendimento configurada;
- modo de tarifa válido;
- quantidade declarada de entregadores maior que zero;
- horários e fuso válidos;
- teste de endereço e preço concluído.

### Modalidade externa

- operador padrão selecionado;
- credenciais salvas e testadas;
- merchant/store externo associado ao tenant;
- ambiente `SANDBOX` ou `PRODUCTION` explícito;
- origem do restaurante confirmada;
- teste de cotação concluído;
- aceite dos termos informando que o contrato e custos pertencem ao restaurante.

## 5.3 Alteração da configuração

- A modalidade padrão deve ser escolhida antes da entrada de novos pedidos.
- A configuração aplicada será salva como snapshot no checkout e no Delivery.
- Alterar `OWN` para `EXTERNAL`, ou o inverso, afeta somente novos pedidos.
- Uma entrega em falha pode receber override manual sem mudar o padrão do tenant.
- Desativar um operador não cancela entregas já contratadas.
- Desativar o módulo com entregas ativas exige confirmação forte e mantém as entregas visíveis.

## 5.4 Exemplo de configuração

```json
{
  "enabled": true,
  "version": 4,
  "timezone": "America/Sao_Paulo",
  "default_fulfillment_mode": "EXTERNAL",
  "origin": {
    "formatted_address": "Rua Exemplo, 100 - Centro, Osasco - SP",
    "postal_code": "06000-000",
    "lat": -23.5329,
    "lng": -46.7917,
    "confirmed": true
  },
  "customer_addresses": {
    "max_active_addresses": 5,
    "require_save_confirmation": true,
    "require_confirmation_each_order": true,
    "allow_temporary_address": false,
    "last_used_becomes_default": true
  },
  "own_delivery": {
    "declared_courier_capacity": 3,
    "service_area": {
      "mode": "RADIUS",
      "radius_km": 8
    },
    "pricing": {
      "mode": "HYBRID",
      "fixed_fee": 5.00,
      "included_km": 1.0,
      "price_per_km": 2.00,
      "minimum_fee": 8.00,
      "rounding_mode": "CEIL_0_5_KM",
      "bands": [],
      "surcharges": []
    },
    "capacity_hold_minutes": 15
  },
  "external_delivery": {
    "default_provider": "IFOOD",
    "providers_order": ["IFOOD"],
    "assignment_policy": {
      "max_attempts": 5,
      "window_minutes": 15,
      "attempt_interval_seconds": 180,
      "automatic_provider_switch": false
    }
  }
}
```

Credenciais nunca devem existir dentro desse JSON.

# 6. Cadastro de clientes

## 6.1 Identidade

O cliente será identificado exclusivamente por:

```text
(tenant_id, phone_normalized)
```

Regras:

- o telefone deve ser normalizado para formato E.164 somente com dígitos e código do país;
- o telefone recebido do WhatsApp é a identidade do cliente naquele canal;
- o mesmo telefone em tenants diferentes representa cadastros independentes;
- não será mantido nome no cadastro persistente do cliente;
- se um operador exigir nome do destinatário, o nome será solicitado no pedido e guardado apenas no snapshot da entrega;
- telefone completo não deve aparecer em listagens ou logs comuns.

## 6.2 Criação do cadastro

- O cadastro pode ser criado de forma lazy na primeira tentativa de Delivery.
- Criar novamente com a mesma chave deve retornar o cadastro existente.
- O cadastro não pode ser compartilhado entre tenants.
- O cliente não precisa criar senha.
- O acesso pelo WhatsApp deriva da origem autenticada da mensagem.

## 6.3 Limites

- máximo de cinco endereços ativos por cliente;
- endereços excluídos logicamente não contam para o limite;
- ao atingir o limite, o cliente deve editar ou excluir um endereço antes de cadastrar outro;
- o Admin pode visualizar a contagem, mas dados completos exigem permissão autorizada.

# 7. Cadastro e confirmação de endereços

## 7.1 Fluxo para endereço existente

1. localizar cliente por tenant e telefone;
2. listar endereços ativos, com o padrão primeiro e depois por `last_used_at`;
3. mostrar rótulo e resumo seguro, por exemplo `Casa — Rua A, 120`;
4. cliente escolhe um endereço;
5. sistema apresenta o endereço completo;
6. cliente confirma que deseja receber nesse local;
7. sistema revalida elegibilidade e cotação para o pedido atual;
8. após confirmação do pedido, atualizar `last_used_at` e torná-lo padrão;
9. copiar snapshot imutável para lote e Delivery.

## 7.2 Fluxo para novo endereço

1. solicitar CEP com oito dígitos;
2. normalizar e validar o formato;
3. consultar `PostalCodeProvider`;
4. preencher logradouro, bairro, cidade e UF quando disponíveis;
5. solicitar campos ausentes;
6. solicitar número;
7. solicitar complemento opcional;
8. solicitar referência opcional;
9. solicitar rótulo, como `Casa`, `Trabalho` ou texto personalizado;
10. montar endereço normalizado;
11. geocodificar o endereço completo, incluindo número;
12. avaliar a qualidade da geocodificação;
13. apresentar o endereço formatado para confirmação;
14. perguntar explicitamente se o cliente deseja salvá-lo;
15. como endereço temporário não é permitido, recusar o uso se o cliente não autorizar o salvamento;
16. persistir o endereço confirmado;
17. calcular rota, área, preço ou cotação;
18. copiar snapshot para o pedido confirmado.

## 7.3 CEP não encontrado

Quando o provedor não localizar o CEP:

- permitir preenchimento manual;
- exigir CEP, logradouro, número, bairro, cidade e UF;
- marcar `postal_code_lookup_status=NOT_FOUND`;
- executar geocodificação do endereço completo;
- resultado ambíguo exige nova confirmação ou correção;
- não aceitar automaticamente endereço sem coordenadas válidas na modalidade externa;
- falha de um provedor de CEP não deve apagar dados já digitados.

## 7.4 Alteração

- Cliente pode alterar o próprio endereço pelo WhatsApp.
- Admin e Manager podem alterar pelo painel com auditoria.
- Alteração deve criar nova versão lógica ou registrar before/after em auditoria.
- CEP alterado obriga nova consulta e geocodificação.
- Rua, número, bairro, cidade ou UF alterados obrigam nova geocodificação.
- Complemento, referência e rótulo podem dispensar geocodificação se as coordenadas continuarem aplicáveis.
- Alterar cadastro não altera snapshots de pedidos antigos ou ativos.

## 7.5 Exclusão

- A exclusão afeta somente o endereço selecionado.
- Não será oferecida exclusão total do cadastro por esse fluxo.
- A exclusão será lógica por `deleted_at`.
- Endereço excluído não aparece em novos pedidos.
- Snapshots históricos permanecem preservados.
- Se o endereço excluído era padrão, o endereço ativo mais recente vira padrão.
- Excluir endereço usado por um checkout ainda aberto deve invalidar o checkout ou exigir nova confirmação.

## 7.6 Endereço padrão

- O endereço usado mais recentemente torna-se padrão após a confirmação do pedido.
- Apenas um endereço ativo pode ser padrão por cliente.
- A atualização deve ser transacional.
- Cancelar antes da confirmação do pedido não muda o endereço padrão.

# 8. Serviços de CEP, geocodificação e rotas

## 8.1 Contrato neutro de CEP

```typescript
interface PostalCodeProvider {
  code(): string;
  lookup(postalCode: string): Promise<PostalCodeResult>;
}

type PostalCodeResult = {
  postalCode: string;
  street?: string;
  neighborhood?: string;
  city: string;
  state: string;
  provider: string;
  providerReference?: string;
};
```

Regras:

- o provedor será configurado na infraestrutura da plataforma no MVP;
- não expor chave privada no navegador ou no bot;
- aplicar timeout curto, retry limitado e circuit breaker;
- cachear por CEP com TTL, sem relacionar cache a cliente;
- validar cidade e UF mesmo quando o provedor responder `200`;
- permitir adaptador fake para testes;
- retornar erros normalizados: `INVALID_POSTAL_CODE`, `NOT_FOUND`, `TIMEOUT`, `RATE_LIMITED`, `PROVIDER_UNAVAILABLE`.

## 8.2 Geocodificação

Consulta de CEP não substitui geocodificação. A geocodificação deve usar o endereço completo com número e retornar:

- latitude e longitude;
- identificador do provedor;
- qualidade `ROOFTOP`, `RANGE`, `INTERPOLATED`, `APPROXIMATE` ou `AMBIGUOUS`;
- endereço formatado pelo provedor, quando disponível.

`AMBIGUOUS` não pode seguir automaticamente para pagamento ou cotação externa.

## 8.3 Rota

- cobrança por distância usa rota rodoviária;
- Haversine pode ser usado somente como pré-validação ou fallback visual;
- o snapshot deve registrar distância, duração, provedor e horário;
- falha do mapa não pode produzir valor de frete falso;
- para entrega própria, política configurável pode permitir aceite manual sem rota, mas exige confirmação administrativa;
- para externa, a cotação do operador é a fonte de preço e disponibilidade.

# 9. Formação do frete e checkout

## 9.1 Regra geral

O frete deve ser conhecido antes do pagamento e exibido separadamente:

```text
total_do_cliente = subtotal_itens + encargos_existentes + customer_delivery_fee
```

Após o pagamento:

- `customer_delivery_fee` é imutável;
- aumento posterior do custo é assumido pelo restaurante;
- redução posterior do custo não gera abatimento automático ao cliente;
- qualquer restituição será uma decisão manual fora do cálculo automático deste módulo.

## 9.2 Entrega própria

Modos configuráveis:

| Modo | Regra |
|---|---|
| `FIXED` | Um valor único dentro da área atendida. |
| `DISTANCE_BANDS` | Valor definido pela primeira faixa cujo limite inclui a distância. |
| `PER_KM` | Taxa base mais quilômetros excedentes multiplicados pelo preço por km. |
| `HYBRID` | Permite combinar taxa base, km incluído, preço por km, mínimo, faixas e adicionais conforme configuração explícita. |

### Fórmula por quilômetro

```text
distancia_arredondada = aplicar_rounding_mode(distancia_rota_km)
distancia_cobravel = max(0, distancia_arredondada - included_km)
subtotal_frete = fixed_fee + distancia_cobravel * price_per_km
subtotal_com_minimo = max(minimum_fee, subtotal_frete)
customer_delivery_fee = subtotal_com_minimo + soma(adicionais_aplicaveis)
```

Modos de arredondamento:

- `NONE`;
- `CEIL_0_5_KM`;
- `CEIL_1_KM`.

Adicionais podem ser valor fixo ou percentual e devem possuir regra explícita de horário, região ou ativação manual. O snapshot deve guardar cada componente do cálculo.

### Faixas

```json
{
  "mode": "DISTANCE_BANDS",
  "bands": [
    { "from_km": 0, "up_to_km": 3, "fee": 8.00 },
    { "from_km": 3, "up_to_km": 5, "fee": 11.00 },
    { "from_km": 5, "up_to_km": 8, "fee": 16.00 }
  ]
}
```

Faixas não podem se sobrepor nem conter buracos involuntários. Distância acima da última faixa é indisponível, salvo regra explícita de fallback.

## 9.3 Entrega externa

Antes do pagamento:

1. validar endereço e coordenadas;
2. consultar disponibilidade do operador configurado;
3. persistir `external_quote_id`, preço, prazo e expiração;
4. usar o preço retornado como `customer_delivery_fee`;
5. exibir valor e estimativa ao cliente;
6. exigir confirmação;
7. adicionar o frete ao total;
8. após pagamento, vincular cotação ao lote e Delivery.

Se não houver cotação válida, o pedido externo não pode ser confirmado/pago como Delivery.

## 9.4 Expiração e recotação

- A validade real vem de `expires_at` retornado pelo operador.
- Nunca assumir validade fixa no domínio.
- Ao iniciar o preparo, verificar novamente a validade.
- Cotação expirada exige recotação automática no mesmo operador.
- O novo custo não altera `customer_delivery_fee`.
- A diferença é registrada em `restaurant_adjustment`.
- Se a recotação falhar, iniciar o ciclo de alocação/falha definido para a entrega e alertar a operação.

# 10. Capacidade da entrega própria

## 10.1 Modelo simplificado

Não haverá cadastro individual de motoboys. O Admin informa a quantidade de entregadores disponíveis.

```text
effective_available = max(0, declared_capacity - active_reservations)
```

## 10.2 Reserva

- Antes do pagamento, o checkout deve obter uma reserva temporária de capacidade.
- A reserva temporária evita que pedidos simultâneos vendam a mesma vaga.
- O hold possui TTL configurável, inicialmente 15 minutos.
- Pagamento confirmado converte o hold em reserva ativa.
- Hold expirado libera capacidade automaticamente.
- Reserva ativa é liberada ao entregar, cancelar ou converter para externa.
- Operações usam lock transacional ou compare-and-set.
- O mesmo checkout não cria duas reservas.

## 10.3 Alteração da capacidade

- Admin pode alterar a quantidade declarada.
- Diminuir abaixo das reservas existentes não cancela pedidos; disponibilidade efetiva passa a zero.
- Toda alteração registra valor anterior, novo, ator e motivo opcional.
- Capacidade zero impede novo checkout próprio.

## 10.4 Operação

- `ADMIN`, `MANAGER` e `DISPATCHER` podem marcar saída e conclusão.
- Não existe atribuição a uma pessoa específica.
- Não existe localização, tracking próprio ou PIN.
- O painel mostra capacidade declarada, reservada e disponível.

# 11. Execução externa e ciclo de tentativas

## 11.1 Momento da contratação

A contratação do operador externo começa quando o lote entra em `PREPARING`.

Isso é diferente da cotação:

- cotação ocorre antes do pagamento;
- contratação/alocação ocorre ao iniciar o preparo.

O evento de entrada em preparo deve iniciar o ciclo uma única vez, mesmo que o evento de produção seja repetido.

## 11.2 Ciclo de alocação

Para o operador selecionado:

- máximo de cinco tentativas;
- janela total de 15 minutos;
- tentativa inicial em `T+0`;
- novas tentativas em aproximadamente `T+3`, `T+6`, `T+9` e `T+12`;
- o ciclo encerra, no máximo, em `T+15`;
- cada tentativa possui idempotency key própria e determinística;
- repetir worker/job não cria nova tentativa lógica;
- não trocar automaticamente de operador.

## 11.3 Classificação de falhas

| Classe | Exemplos | Tratamento |
|---|---|---|
| Transitória | timeout, `5xx`, alta demanda, frota momentaneamente indisponível | Registrar e aguardar próxima tentativa do ciclo. |
| Negocial | fora de cobertura, método de pagamento incompatível, limite da loja | Registrar falha; o operador permanece selecionado até completar/encerrar o ciclo definido. |
| Configuração | credencial inválida, merchant ausente, conta desabilitada | Registrar incidente de configuração e alerta crítico; não expor detalhe ao cliente. |
| Ambígua | request enviado sem resposta | Consultar/reconciliar antes de repetir para evitar duas entregas. |

Mesmo quando a falha for previsivelmente definitiva, a UI não deve selecionar outro operador automaticamente. O administrador controla o fallback.

## 11.4 Esgotamento

Após cinco falhas ou ao atingir 15 minutos:

- fulfillment recebe `CYCLE_EXHAUSTED`;
- Delivery recebe sinalização operacional `NO_COURIER`;
- painel destaca a entrega como exceção;
- Admin/Manager/Dispatcher autorizados recebem ação de fallback;
- cliente recebe mensagem não técnica informando atraso na localização de entregador;
- pedido permanece válido e continua em preparo;
- nenhum novo ciclo inicia sem comando autorizado.

## 11.5 Fallback manual

O usuário autorizado pode:

1. reiniciar o mesmo operador, gerando novo ciclo auditado;
2. selecionar outro operador habilitado;
3. converter a entrega para `OWN`, se existir capacidade disponível;
4. cancelar conforme regras comerciais.

Ao selecionar outro operador:

- criar novo `DeliveryFulfillment` ou nova versão de fulfillment;
- preservar todas as tentativas anteriores;
- obter nova cotação se necessário;
- iniciar nova regra de cinco tentativas em 15 minutos;
- não alterar a configuração padrão do tenant;
- não alterar o valor cobrado do cliente;
- registrar diferença financeira para o restaurante.

Ao converter para própria:

- exigir capacidade efetivamente disponível;
- reservar uma vaga atomicamente;
- manter `customer_delivery_fee` original;
- registrar a taxa própria calculada apenas como custo/regra comparativa;
- preservar o histórico externo.

## 11.6 Imutabilidade após execução física

Após coleta confirmada pelo operador, não é permitido trocar modalidade ou operador. Exceções seguem cancelamento/devolução suportados pelo operador e exigem ação administrativa auditada.

# 12. Tracking e código de confirmação

## 12.1 Entrega externa

- Usar o link de tracking retornado pelo operador.
- Não reescrever nem acrescentar segredo ao link.
- Enviar o link ao cliente somente quando disponibilizado pelo operador.
- Usar o código/PIN gerado pelo operador quando o fluxo exigir.
- O ClickGarçom não gera, armazena nem valida PIN próprio.
- Código sensível não aparece no painel ou em logs.
- Webhook/polling atualiza o painel mesmo que o cliente use o link externo.

## 12.2 Entrega própria

- Não haverá link de tracking.
- Não haverá localização do motoboy.
- Não haverá PIN.
- O restaurante atualiza manualmente `SAIU_PARA_ENTREGA` e `ENTREGUE`.

## 12.3 Compatibilidade

Infraestrutura anterior de tracking próprio pode permanecer desativada. Nenhuma task do novo MVP deve depender de Expo Location, WebSocket público de localização ou desafio PIN do ClickGarçom.

# 13. Estados de domínio

## 13.1 Estado do Delivery

O estado do Delivery continua separado da produção. Estados persistidos existentes devem ser reaproveitados quando possível.

| Estado | Significado no novo módulo |
|---|---|
| `PENDING_RESTAURANT_ACCEPTANCE` | Pedido ainda não aceito. |
| `ACCEPTED` | Pedido aceito e frete congelado. |
| `PREPARING` | Produção iniciada; contratação externa pode estar ocorrendo. |
| `READY_FOR_DISPATCH` | Produção pronta aguardando saída/coleta. |
| `ASSIGNED` | Operador externo confirmou entregador. Não exige `assigned_driver_id` interno. |
| `IN_TRANSIT` | Pedido saiu para entrega, própria ou externa. |
| `DELIVERED` | Entrega concluída. |
| `DELIVERY_FAILED` | Exceção logística que exige intervenção. |
| `CANCELED` | Pedido/entrega cancelado conforme regra. |
| `RETURNING`/`RETURNED` | Devolução quando suportada. |

Estados legados `PICKED_UP` e `ARRIVED` podem continuar aceitos para compatibilidade, mas não são obrigatórios no fluxo próprio simplificado.

### Transições próprias mínimas

```text
ACCEPTED -> PREPARING -> READY_FOR_DISPATCH -> IN_TRANSIT -> DELIVERED
```

### Transições externas mínimas

```text
ACCEPTED -> PREPARING
PREPARING + fulfillment.COURIER_ASSIGNED
PREPARING -> READY_FOR_DISPATCH
READY_FOR_DISPATCH -> ASSIGNED, quando aplicável
ASSIGNED/READY_FOR_DISPATCH -> IN_TRANSIT
IN_TRANSIT -> DELIVERED
qualquer estado permitido -> DELIVERY_FAILED/CANCELED conforme regra
```

## 13.2 Estado do fulfillment

| Estado | Modalidade | Significado |
|---|---|---|
| `CAPACITY_HELD` | OWN | Vaga temporária durante checkout. |
| `CAPACITY_RESERVED` | OWN | Vaga confirmada após pagamento. |
| `WAITING_DISPATCH` | OWN | Aguardando saída manual. |
| `IN_TRANSIT` | OWN/EXTERNAL | Pedido saiu. |
| `QUOTED` | EXTERNAL | Cotação válida persistida. |
| `WAITING_PREPARATION` | EXTERNAL | Pago e aguardando início do preparo. |
| `ALLOCATION_PENDING` | EXTERNAL | Ciclo iniciado. |
| `REQUESTING` | EXTERNAL | Tentativa em andamento. |
| `COURIER_ASSIGNED` | EXTERNAL | Operador confirmou entregador. |
| `AT_PICKUP` | EXTERNAL | Entregador no restaurante, quando informado. |
| `CYCLE_EXHAUSTED` | EXTERNAL | Cinco tentativas/15 minutos encerrados sem sucesso. |
| `FAILED` | OWN/EXTERNAL | Falha terminal ou intervenção necessária. |
| `CANCELED` | OWN/EXTERNAL | Fulfillment cancelado. |
| `DELIVERED` | OWN/EXTERNAL | Execução concluída. |

O estado do fulfillment nunca pode regredir um Delivery terminal.

# 14. Contrato neutro dos operadores

```typescript
interface DeliveryProvider {
  code(): DeliveryProviderCode;
  checkConnection(context: ProviderTenantContext): Promise<ConnectionResult>;
  quote(request: ProviderQuoteRequest): Promise<ProviderQuoteResult>;
  requestCourier(request: ProviderCreateRequest): Promise<ProviderCreateResult>;
  reconcile(request: ProviderReconcileRequest): Promise<ProviderDeliveryDetails>;
  cancel(request: ProviderCancelRequest): Promise<ProviderCancelResult>;
  parseAndVerifyWebhook(headers: Record<string, string>, rawBody: Buffer): Promise<NormalizedProviderEvent>;
}
```

## 14.1 DTO normalizado de cotação

```json
{
  "provider": "IFOOD",
  "external_quote_id": "uuid-do-operador",
  "currency": "BRL",
  "quoted_cost": 11.90,
  "estimated_minutes": 38,
  "distance_meters": 4700,
  "expires_at": "2026-08-10T18:00:00Z",
  "availability": "AVAILABLE",
  "provider_metadata": {}
}
```

## 14.2 Erros normalizados

- `INVALID_CREDENTIALS`;
- `ACCOUNT_DISABLED`;
- `STORE_NOT_MAPPED`;
- `OUT_OF_COVERAGE`;
- `OUTSIDE_OPENING_HOURS`;
- `NO_COURIER`;
- `HIGH_DEMAND`;
- `QUOTE_EXPIRED`;
- `PAYMENT_METHOD_UNSUPPORTED`;
- `RATE_LIMITED`;
- `TIMEOUT`;
- `PROVIDER_5XX`;
- `AMBIGUOUS_CREATION`;
- `CANCELLATION_REJECTED`;
- `UNKNOWN_PROVIDER_ERROR`.

Payload bruto não deve atravessar o domínio. Somente snapshot sanitizado e referência segura podem ser persistidos.

# 15. Integração inicial com iFood Sob Demanda

## 15.1 Modalidade correta

Os pedidos nascem no WhatsApp/ClickGarçom, portanto a integração deve usar o fluxo oficial de pedidos criados fora da plataforma iFood.

## 15.2 Fluxo esperado

1. tenant conecta credenciais e merchant;
2. ClickGarçom testa autenticação e elegibilidade;
3. checkout consulta disponibilidade/cotação pelo endereço;
4. guarda `quoteId`, preço, prazo e expiração;
5. cliente confirma e paga no ClickGarçom;
6. ao iniciar preparo, ClickGarçom registra/solicita a entrega usando a cotação válida;
7. alocação ocorre de forma assíncrona;
8. eventos ou reconciliação atualizam fulfillment;
9. tracking e código do iFood são enviados ao cliente quando disponíveis;
10. conclusão/cancelamento são refletidos no Delivery.

## 15.3 Regras específicas

- merchant pertence ao tenant;
- conta e faturamento pertencem ao restaurante;
- token deve ser cacheado somente até perto da expiração;
- `quoteId` não pode ser usado após `expires_at`;
- criação sem resposta exige reconciliação antes de retry;
- o identificador interno do Delivery deve ser enviado como referência quando permitido;
- eventos duplicados retornam sucesso sem duplicar transição;
- código de confirmação é o fornecido pelo iFood;
- `trackingUrl` deve ser persistido como dado sensível operacional e enviado ao cliente correto;
- homologação oficial é obrigatória antes de produção.

## 15.4 Observação de contrato

Campos, URLs, eventos e validade devem ser confirmados novamente na documentação oficial durante a implementação. O adaptador deve usar a versão da API homologada para a conta do tenant, sem espalhar nomes de campos do iFood pelo restante do domínio.

# 16. Credenciais dos operadores

## 16.1 Entrada pelo painel

O Admin informará as credenciais no painel do tenant.

Fluxo:

1. selecionar operador e ambiente;
2. informar identificadores e segredos exigidos;
3. enviar por HTTPS diretamente ao backend;
4. validar formato;
5. criptografar antes de persistir;
6. testar conexão;
7. mostrar somente valores mascarados depois de salvar;
8. registrar auditoria sem incluir segredo.

## 16.2 Regras de segurança

- somente `ADMIN` altera credenciais;
- segredo nunca volta ao frontend;
- não guardar segredo em `tenant.settings`;
- preferir secret manager com `credential_ref`;
- se houver tabela local, usar criptografia autenticada e chave mestra fora do banco;
- separar sandbox e produção;
- suportar rotação sem interromper entrega já criada;
- ação de remover exige confirmação e é bloqueada quando inviabilizar entrega ativa;
- logs não contêm token, secret, autorização ou payload completo;
- “Testar conexão” possui rate limit e resposta sanitizada.

# 17. Modelo de dados alvo

## 17.1 `customers`

| Campo | Tipo | Regra |
|---|---|---|
| `id` | UUID PK | Gerado no servidor. |
| `tenant_id` | UUID FK | Obrigatório. |
| `phone_normalized` | VARCHAR(20) | E.164 somente dígitos. |
| `active` | BOOLEAN | Default `true`. |
| `created_at/updated_at` | TIMESTAMPTZ | UTC. |

Restrição `UNIQUE (tenant_id, phone_normalized)`.

## 17.2 `customer_addresses`

Campos obrigatórios:

- `id`, `tenant_id`, `customer_id`;
- `label`;
- `postal_code`, `street`, `address_number`;
- `address_complement`, `neighborhood`, `city`, `state`, `address_reference`;
- `formatted_address`;
- `lat`, `lng`;
- `postal_code_provider`, `postal_code_provider_ref`, `postal_code_lookup_status`;
- `geocode_provider`, `geocode_provider_id`, `geocode_quality`;
- `confirmed_at`, `last_used_at`, `is_default`;
- `created_at`, `updated_at`, `deleted_at`.

Restrições:

- FK composta deve impedir vínculo cross-tenant;
- um único default ativo por cliente;
- coordenadas dentro dos limites globais;
- UF com dois caracteres;
- limite de cinco ativos aplicado na transação;
- índice por `(tenant_id, customer_id, deleted_at)`;
- endereço excluído não pode ser escolhido em novo checkout.

## 17.3 Evolução de `deliveries`

Preservar colunas existentes e adicionar, quando necessário:

- `customer_id` nullable com tenant scope;
- `customer_address_id` nullable para rastreabilidade, nunca como fonte do snapshot;
- `default_fulfillment_mode_snapshot`;
- `current_fulfillment_id`;
- `customer_delivery_fee`;
- `provider_quoted_cost`;
- `provider_actual_cost`;
- `restaurant_adjustment`;
- `currency` default `BRL`;
- `no_courier_at`;
- `fulfillment_override_at/by/reason`.

`address_snapshot`, `delivery_fee` e demais colunas existentes devem ser migrados de forma compatível. `delivery_fee` pode permanecer como alias temporário de `customer_delivery_fee` até a migração de todos os consumidores.

## 17.4 `delivery_provider_configs`

- `id`, `tenant_id`, `provider`;
- `enabled`, `environment`, `priority`;
- `external_merchant_id` e outros IDs não secretos;
- `credential_ref`;
- `connection_status`, `last_tested_at`, `last_error_code`;
- `created_at`, `updated_at`.

Unique `(tenant_id, provider, environment)`.

## 17.5 `delivery_provider_credentials`

Usada somente se não houver secret manager:

- `id`, `tenant_id`, `provider_config_id`;
- `encrypted_payload`, `key_version`, `nonce/auth_tag` conforme algoritmo;
- `created_at`, `rotated_at`, `revoked_at`.

Nenhum campo secreto em texto aberto.

## 17.6 `delivery_quotes`

- `id`, `tenant_id`;
- `checkout_key` e `customer_id`;
- `customer_address_id`;
- `delivery_id` nullable até criação;
- `provider`, `external_quote_id`;
- `quoted_cost`, `customer_delivery_fee`, `currency`;
- `distance_meters`, `estimated_minutes`;
- `status`: `VALID`, `USED`, `EXPIRED`, `REPLACED`, `FAILED`;
- `expires_at`, `created_at`, `used_at`;
- `request_hash` e snapshot sanitizado.

## 17.7 `delivery_fulfillments`

- `id`, `tenant_id`, `delivery_id`;
- `mode`: `OWN` ou `EXTERNAL`;
- `provider` nullable para própria;
- `status`;
- `external_delivery_id`, `tracking_url`;
- `quote_id`;
- `quoted_cost`, `actual_cost`, `currency`;
- `cycle_number`;
- `is_current`;
- `started_at`, `assigned_at`, `picked_up_at`, `delivered_at`, `failed_at`, `canceled_at`;
- `created_by`, `override_reason`;
- `created_at`, `updated_at`.

Somente um fulfillment atual por Delivery.

## 17.8 `delivery_provider_attempts`

- `id`, `tenant_id`, `delivery_id`, `fulfillment_id`;
- `cycle_number`, `attempt_number` de 1 a 5;
- `idempotency_key`;
- `status`: `SCHEDULED`, `REQUESTING`, `SUCCEEDED`, `FAILED`, `AMBIGUOUS`, `SKIPPED`;
- `provider_error_code`, `retryable`;
- `scheduled_at`, `started_at`, `finished_at`;
- `request_reference`, `response_reference` sanitizados;
- `created_at`.

Unique `(tenant_id, fulfillment_id, cycle_number, attempt_number)` e unique por idempotency key no escopo.

## 17.9 `delivery_own_capacity_reservations`

- `id`, `tenant_id`;
- `checkout_key`;
- `delivery_id` nullable até confirmação;
- `status`: `HELD`, `CONFIRMED`, `RELEASED`, `EXPIRED`;
- `expires_at`, `confirmed_at`, `released_at`;
- `release_reason`;
- `created_at`, `updated_at`.

## 17.10 `delivery_provider_webhook_inbox`

- `id`, `tenant_id` resolvido de forma segura;
- `provider`, `external_event_id`, `payload_hash`;
- `signature_valid`;
- `headers_snapshot` sanitizado;
- payload criptografado ou referência com retenção curta, quando necessário;
- `received_at`, `processed_at`, `attempts`, `next_retry_at`, `last_error_code`.

Deduplicar por evento externo; quando não houver ID, usar hash estável com provedor e identificadores.

# 18. APIs propostas

Os endpoints devem seguir o envelope e autenticação já usados pelo Tenant Admin. Nomes finais devem ser congelados no OpenAPI antes da implementação das telas.

## 18.1 Configuração administrativa

| Método | Endpoint | Papel |
|---|---|---|
| `GET` | `/admin/api/delivery/settings` | Admin/Manager |
| `PUT` | `/admin/api/delivery/settings` | Admin |
| `POST` | `/admin/api/delivery/settings/validate` | Admin |
| `POST` | `/admin/api/delivery/settings/own/quote-test` | Admin/Manager |
| `PUT` | `/admin/api/delivery/settings/own/capacity` | Admin/Manager |
| `GET` | `/admin/api/delivery/providers` | Admin/Manager |
| `PUT` | `/admin/api/delivery/providers/:provider` | Admin |
| `PUT` | `/admin/api/delivery/providers/:provider/credentials` | Admin |
| `DELETE` | `/admin/api/delivery/providers/:provider/credentials` | Admin |
| `POST` | `/admin/api/delivery/providers/:provider/test-connection` | Admin |
| `POST` | `/admin/api/delivery/providers/:provider/quote-test` | Admin |

## 18.2 Clientes e endereços no Admin

| Método | Endpoint | Uso |
|---|---|---|
| `GET` | `/admin/api/delivery/customers?phone=` | Buscar dentro do tenant. |
| `GET` | `/admin/api/delivery/customers/:id/addresses` | Listar endereços ativos/autorizados. |
| `POST` | `/admin/api/delivery/customers/:id/addresses` | Cadastrar e confirmar. |
| `PUT` | `/admin/api/delivery/customers/:id/addresses/:addressId` | Alterar. |
| `DELETE` | `/admin/api/delivery/customers/:id/addresses/:addressId` | Exclusão lógica. |
| `POST` | `/admin/api/delivery/addresses/postal-code-lookup` | Consultar CEP. |
| `POST` | `/admin/api/delivery/addresses/geocode` | Geocodificar/confirmar. |
| `POST` | `/admin/api/delivery/addresses/reverse-geocode` | Buscar endereço da origem por latitude/longitude. |

## 18.3 Chamadas internas do fluxo WhatsApp

Protegidas por `X-Internal-Token`, rede interna e correlation ID:

| Método | Endpoint | Uso |
|---|---|---|
| `POST` | `/admin/api/internal/delivery/customers/resolve` | Obter/criar cliente por tenant+telefone. |
| `GET` | `/admin/api/internal/delivery/customers/:customerId/addresses` | Listar para o bot com tenant no header; o telefone não vai na URL. |
| `POST` | `/admin/api/internal/delivery/addresses/postal-code-lookup` | Consultar CEP. |
| `POST` | `/admin/api/internal/delivery/addresses/validate` | Geocodificar e validar. |
| `POST` | `/admin/api/internal/delivery/customers/:customerId/addresses` | Salvar após consentimento. |
| `PUT` | `/admin/api/internal/delivery/customers/:customerId/addresses/:id` | Editar pelo cliente. |
| `DELETE` | `/admin/api/internal/delivery/customers/:customerId/addresses/:id` | Excluir pelo cliente. |
| `POST` | `/admin/api/internal/delivery/quotes` | Obter cotação do operador externo antes do pagamento. |
| `POST` | `/admin/api/internal/delivery/checkout` | Criar checkout e obter taxa própria ou externa. |
| `POST` | `/admin/api/internal/delivery/checkout/confirm` | Vincular pagamento, quote/hold e lote. |
| `POST` | `/admin/api/internal/delivery/checkout/confirm-paid` | Confirmar pagamento aprovado pelo provider, com valor autoritativo e sem reutilizar token do cliente. |
| `GET` | `/admin/api/internal/delivery/checkout/:checkoutKey` | Reconciliar checkout após timeout, usando `X-Tenant-ID`. |
| `POST` | `/admin/api/internal/deliveries/order-event` | Projetar/reconciliar o `order_batch` DELIVERY no agregado Delivery após pagamento ou retry. |

Ao criar o pagamento pelo endpoint existente `/api/payments/pix` ou `/api/payments/card`, o checkout Delivery informa `delivery_checkout_key` junto do `order_id`. O Core resolve o `order_batch` pelo pedido e persiste somente essa referência técnica no pagamento; o checkout também mantém `order_batch_id` com escopo do tenant, e o valor enviado continua sendo validado contra o checkout no endpoint interno `confirm-paid`.

Telefone, CEP e endereço não devem ser transportados em query string quando houver alternativa por corpo.

## 18.4 Operação das entregas

| Método | Endpoint | Uso |
|---|---|---|
| `GET` | `/admin/api/deliveries` | Lista operacional. |
| `GET` | `/admin/api/deliveries/:id` | Detalhe completo autorizado. |
| `GET` | `/admin/api/deliveries/:id/timeline` | Eventos e tentativas. |
| `POST` | `/admin/api/deliveries/:id/own/start` | Marcar saída própria. |
| `POST` | `/admin/api/deliveries/:id/own/complete` | Concluir própria. |
| `POST` | `/admin/api/deliveries/:id/provider-cycle/restart` | Novo ciclo no mesmo operador. |
| `POST` | `/admin/api/deliveries/:id/change-provider` | Fallback manual externo. |
| `POST` | `/admin/api/deliveries/:id/change-to-own` | Converter para própria. |
| `POST` | `/admin/api/deliveries/:id/cancel` | Cancelar conforme elegibilidade. |
| `GET` | `/admin/api/deliveries/:id/provider-attempts` | Exibir tentativas sanitizadas. |

Toda mutação recebe `Idempotency-Key` e `expected_version`.

## 18.5 Webhooks

```text
POST /admin/api/webhooks/delivery/:provider
```

O endpoint não usa JWT de tenant. Ele deve validar a assinatura do operador sobre o corpo bruto, resolver o tenant pelo mapeamento externo e persistir na inbox antes de processar.

## 18.6 Exemplo de cotação interna

```json
{
  "tenant_id": "uuid",
  "checkout_key": "uuid",
  "customer_phone": "5511999999999",
  "customer_address_id": "uuid",
  "recipient_name": "Nome informado apenas para este pedido",
  "payment_method": "PIX",
  "cart_total": 65.00
}
```

Resposta:

```json
{
  "checkout_key": "uuid",
  "mode": "EXTERNAL",
  "provider": "IFOOD",
  "availability": "AVAILABLE",
  "customer_delivery_fee": 11.90,
  "currency": "BRL",
  "estimated_minutes": 38,
  "expires_at": "2026-08-10T18:00:00Z",
  "confirmation_token": "opaco-e-curto"
}
```

O token de confirmação referencia o snapshot no servidor; o cliente não pode alterar preço, provider ou endereço reenviando o payload.

# 19. Idempotência, concorrência e consistência

## 19.1 Chaves

- resolução de cliente: tenant + telefone;
- criação de endereço: chave por confirmação lógica;
- cotação: checkout key + versão do endereço + provider;
- confirmação: checkout key + payment reference;
- ciclo: delivery + fulfillment + cycle number;
- tentativa: fulfillment + cycle + attempt number;
- webhook: provider + external event ID/hash;
- comandos administrativos: header `Idempotency-Key`.

## 19.2 Concorrência

- reserva própria usa lock ou compare-and-set;
- apenas um fulfillment atual por Delivery;
- troca de operador usa `expected_version`;
- confirmação duplicada retorna o resultado anterior;
- webhook fora de ordem não regride terminal;
- criação ambígua consulta o operador antes de repetir;
- jobs podem ser reexecutados sem produzir nova ação lógica.

## 19.3 Outbox

- transição de negócio e evento de domínio são gravados na mesma transação;
- mensagem WhatsApp usa outbox confiável existente;
- falha de mensagem não desfaz pedido ou fulfillment;
- cada marco de notificação possui chave idempotente.

# 20. Webhooks e reconciliação

1. receber corpo bruto;
2. validar assinatura antes do parse de negócio;
3. resolver tenant sem confiar em campo arbitrário;
4. persistir inbox e deduplicar;
5. responder rapidamente ao operador;
6. processar assincronamente;
7. mapear evento para contrato neutro;
8. aplicar máquina de estados e auditoria;
9. publicar evento/outbox;
10. marcar inbox como processada.

Uma reconciliação periódica consulta fulfillments externos não terminais quando:

- webhook estiver atrasado;
- criação tiver resposta ambígua;
- entrega permanecer tempo excessivo no mesmo estado;
- operação solicitar atualização manual com rate limit.

# 21. Experiência do WhatsApp

## 21.1 Mensagens mínimas

- módulo indisponível/desativado;
- escolha entre endereço salvo ou novo;
- CEP inválido ou não encontrado;
- confirmação do endereço completo;
- consentimento para salvar;
- endereço fora da área;
- frete e estimativa antes da confirmação;
- pedido aceito e pagamento confirmado;
- entrega externa sendo solicitada;
- dificuldade para localizar entregador após o ciclo;
- tracking/código do operador disponíveis;
- pedido saiu para entrega própria;
- entrega concluída;
- cancelamento ou ocorrência.

## 21.2 Regras de conteúdo

- não expor códigos técnicos do operador;
- não prometer horário exato;
- mostrar valor de frete separado;
- pedir nova confirmação quando endereço mudar;
- não enviar tracking de outro pedido;
- não duplicar mensagem após webhook repetido;
- templates devem ser configuráveis por tenant e respeitar regras vigentes da Meta.

## 21.3 Mensagem de falha de alocação

Exemplo funcional, sujeito à revisão de texto:

```text
Estamos com dificuldade para localizar um entregador para o seu pedido.
O restaurante já foi avisado e está verificando outra opção de entrega.
Avisaremos você assim que houver uma atualização.
```

# 22. Experiência do Admin do tenant

## 22.1 Configuração

Seções:

1. ativação e modalidade padrão;
2. origem e área atendida;
3. cadastro e política de endereços;
4. capacidade própria;
5. tarifa própria e simulador;
6. operadores externos e ordem;
7. credenciais e teste de conexão;
8. tentativas e alertas;
9. mensagens;
10. auditoria das últimas alterações.

## 22.2 Painel operacional

Cada card deve mostrar:

- código do pedido;
- modalidade atual;
- operador atual;
- bairro, sem endereço completo;
- estado de produção e de fulfillment;
- tentativa atual `n/5`;
- tempo restante da janela;
- valor cobrado e custo do operador para perfis autorizados;
- alerta `SEM_ENTREGADOR`;
- ações válidas por estado.

## 22.3 Detalhe

- snapshot do endereço;
- timeline de produção, logística, tentativas e mensagens;
- cotação original e recotações;
- custo e diferença do restaurante;
- link de tracking mascarado/copiar com permissão;
- erros normalizados;
- comandos de reiniciar, trocar operador, converter para própria ou cancelar;
- confirmação forte e motivo em overrides.

## 22.4 Clientes e endereços

- busca por telefone normalizado/mascarado;
- lista de até cinco endereços;
- indicação de padrão e último uso;
- criação, edição, geocodificação e exclusão;
- auditoria do ator;
- nenhum efeito retroativo em pedidos.

# 23. Segurança, privacidade e LGPD

- tenant scope em toda consulta e FK relevante;
- telefone, endereço e coordenadas são dados pessoais;
- mascarar em listagens e logs;
- endereço completo somente para perfis e fluxos que precisam dele;
- consentimento explícito antes de salvar endereço;
- exclusão lógica no fluxo comum e política separada de retenção/purge;
- snapshot de pedido preservado pelo prazo operacional/legal definido;
- credenciais externas criptografadas;
- tokens e links de tracking tratados como segredos;
- rate limit em CEP, geocode, cotação, teste de conexão e webhooks;
- proteção contra enumeração de clientes;
- Admin não pode buscar cliente fora do próprio tenant;
- auditoria não copia payload sensível completo;
- backups seguem a mesma política de proteção;
- documentar fornecedores de CEP, mapas e logística no aviso de privacidade.

# 24. Observabilidade

## 24.1 Métricas

- `delivery_checkout_quote_total{mode,provider,result}`;
- `delivery_quote_latency_seconds{provider}`;
- `delivery_quote_expired_total{provider}`;
- `delivery_provider_attempt_total{provider,result,error_code}`;
- `delivery_provider_cycle_exhausted_total{provider}`;
- `delivery_provider_assignment_seconds{provider}`;
- `delivery_manual_fallback_total{from,to}`;
- `delivery_own_capacity{tenant,state}` com controle de cardinalidade;
- `delivery_own_reservation_conflict_total`;
- `delivery_postal_code_lookup_total{provider,result}`;
- `delivery_geocode_total{provider,quality,result}`;
- `delivery_customer_address_change_total{action}`;
- `delivery_customer_fee_provider_cost_difference` agregado;
- webhooks recebidos, inválidos, duplicados e atrasados;
- outbox pendente e mensagens falhas.

Tenant ID não deve ser label Prometheus de alta cardinalidade em métricas globais; quando necessário, usar logs estruturados ou métricas agregadas controladas.

## 24.2 Logs

Incluir quando aplicável:

- `correlation_id`;
- `tenant_id`;
- `delivery_id`;
- `fulfillment_id`;
- `provider`;
- `cycle_number`;
- `attempt_number`;
- código de erro normalizado.

Não incluir telefone completo, endereço, coordenada precisa, credencial, token, PIN, link completo de tracking ou payload bruto comum.

## 24.3 Alertas operacionais

- cinco tentativas esgotadas;
- credencial inválida/expirada;
- taxa de cotação falha acima do limite;
- webhook sem processamento;
- criação externa ambígua;
- divergência de reserva própria;
- outbox de cliente atrasada;
- diferença financeira fora do limite configurado;
- integração desabilitada com tenant ainda configurado como externa.

# 25. Requisitos não funcionais

## 25.1 Desempenho

- busca de endereços salvos: p95 inferior a 300 ms sem chamada externa;
- consulta de CEP: timeout configurado, máximo recomendado de 3 segundos;
- cotação: timeout por operador e resposta total compatível com conversa do WhatsApp;
- comando administrativo sem chamada externa: p95 inferior a 500 ms;
- painel suporta ao menos 100 entregas ativas por tenant;
- jobs de tentativa não mantêm conexão HTTP aberta durante os 15 minutos.

## 25.2 Disponibilidade e degradação

- CEP fora do ar permite entrada manual;
- geocode fora do ar preserva dados e solicita tentativa posterior;
- operador fora do ar não confirma frete inexistente;
- RabbitMQ fora do ar não perde evento transacional;
- WebSocket não é fonte única de verdade;
- retry de worker não duplica contratação;
- falha no tracking externo não altera status de negócio sem evidência.

## 25.3 Compatibilidade

- tenants sem módulo não mudam comportamento;
- `DINE_IN` e `TAKEOUT` não recebem campos obrigatórios novos;
- migrações preservam entregas existentes;
- APIs antigas continuam durante janela de transição;
- frontend deve tolerar campos novos ausentes em versões anteriores;
- mudanças de enum exigem atualização de check constraints e contratos.

# 26. Eventos de domínio

Eventos novos ou revisados:

- `delivery.customer_address_created.v1`;
- `delivery.customer_address_updated.v1`;
- `delivery.customer_address_deleted.v1`;
- `delivery.quote_created.v1`;
- `delivery.quote_replaced.v1`;
- `delivery.own_capacity_held.v1`;
- `delivery.own_capacity_reserved.v1`;
- `delivery.own_capacity_released.v1`;
- `delivery.fulfillment_created.v1`;
- `delivery.provider_cycle_started.v1`;
- `delivery.provider_attempt_failed.v1`;
- `delivery.provider_assigned.v1`;
- `delivery.provider_cycle_exhausted.v1`;
- `delivery.fulfillment_changed.v1`;
- `delivery.tracking_available.v1`;
- `delivery.status_changed.v1`;
- `delivery.completed.v1`;
- `delivery.canceled.v1`.

Envelope:

```json
{
  "event_id": "uuid",
  "type": "delivery.provider_attempt_failed.v1",
  "occurred_at": "2026-08-09T21:00:00Z",
  "tenant_id": "uuid",
  "aggregate_id": "delivery-uuid",
  "correlation_id": "uuid",
  "data": {
    "fulfillment_id": "uuid",
    "provider": "IFOOD",
    "cycle_number": 1,
    "attempt_number": 2,
    "error_code": "NO_COURIER",
    "retryable": true
  }
}
```

Eventos públicos/WhatsApp usam projeções sanitizadas, nunca o payload interno inteiro.

# 27. Critérios de aceite funcionais

## 27.1 Ativação e isolamento

- [ ] Tenant sem módulo não consegue criar Delivery.
- [ ] Ativar exige configuração válida para a modalidade escolhida.
- [ ] Tenant A não consulta cliente, endereço, credencial, quote ou entrega do tenant B.
- [ ] Alterar configuração não modifica snapshots existentes.
- [ ] Cada filial funciona como tenant independente.

## 27.2 Clientes e endereços

- [ ] Telefone é normalizado e único dentro do tenant.
- [ ] O mesmo telefone pode existir em outro tenant sem compartilhar endereços.
- [ ] Cliente possui no máximo cinco endereços ativos.
- [ ] Endereço novo exige confirmação e consentimento para salvar.
- [ ] Não é possível usar endereço temporário sem salvar.
- [ ] CEP válido preenche os campos disponíveis.
- [ ] CEP não encontrado permite digitação manual.
- [ ] Endereço completo é geocodificado antes de cotação externa.
- [ ] Cliente confirma endereço em todo pedido.
- [ ] Último endereço usado vira padrão.
- [ ] Cliente e Admin podem editar/excluir.
- [ ] Exclusão não altera pedido antigo.
- [ ] Cadastro persistente não guarda nome do cliente.

## 27.3 Entrega própria

- [ ] Todos os modos de tarifa produzem snapshot detalhado.
- [ ] Capacidade zero impede novo checkout próprio.
- [ ] Dois checkouts simultâneos não reservam a mesma vaga.
- [ ] Hold expira e libera capacidade.
- [ ] Pagamento confirma a reserva.
- [ ] Cancelamento/conclusão libera reserva uma única vez.
- [ ] Operação usa somente aguardando, saiu e entregue.
- [ ] Não existe dependência de localização ou PIN.

## 27.4 Entrega externa

- [ ] Cotação válida é obtida antes do pagamento.
- [ ] Frete é acrescentado ao total do cliente.
- [ ] Valor do cliente fica congelado após pagamento.
- [ ] Contratação começa somente ao iniciar preparo.
- [ ] Cotação expirada é substituída sem recobrar o cliente.
- [ ] Custo maior ou menor gera diferença do restaurante.
- [ ] Cada ciclo executa no máximo cinco tentativas em 15 minutos.
- [ ] O sistema não troca operador automaticamente.
- [ ] Após esgotar, painel e cliente são alertados.
- [ ] Trocar operador inicia novo ciclo completo.
- [ ] Troca afeta somente aquela entrega.
- [ ] Conversão para própria exige capacidade.
- [ ] Após coleta, troca de operador/modalidade é bloqueada.
- [ ] Tracking e código vêm do operador.
- [ ] Conta e cobrança do operador pertencem ao tenant.

## 27.5 Segurança e operação

- [ ] Segredos não aparecem no frontend depois de salvos.
- [ ] Teste de conexão retorna somente diagnóstico sanitizado.
- [ ] Webhook inválido não altera estado.
- [ ] Webhook duplicado não duplica evento/mensagem.
- [ ] Criação ambígua é reconciliada antes de retry.
- [ ] Comando duplicado retorna resultado anterior.
- [ ] Timeline registra tentativas, fallback e diferenças financeiras.
- [ ] Logs não contêm dados sensíveis proibidos.

# 28. Casos de teste mínimos

| Caso | Resultado esperado |
|---|---|
| Módulo desativado | Bot não oferece Delivery e fluxos existentes continuam. |
| Mesmo telefone em dois tenants | Dois clientes isolados, sem compartilhamento de endereço. |
| Sexto endereço | Bloqueado com orientação para editar/excluir. |
| CEP encontrado | Campos preenchidos, número solicitado e geocode executado. |
| CEP inexistente | Entrada manual permitida e endereço confirmado. |
| Endereço alterado | Nova geocodificação e snapshots antigos preservados. |
| Excluir endereço padrão | Exclusão lógica e promoção do endereço mais recente. |
| Endereço salvo escolhido | Confirmação obrigatória no novo pedido. |
| Capacidade própria 1 e dois checkouts | Apenas um hold é criado. |
| Hold sem pagamento | Expira e devolve disponibilidade. |
| Tarifa fixa | Valor exato e snapshot `FIXED`. |
| Tarifa por faixa no limite | Faixa correta aplicada. |
| Tarifa por km com arredondamento | Distância e componentes conferem. |
| Endereço fora do raio próprio | Checkout indisponível. |
| Cotação iFood disponível | Frete adicionado ao total antes do pagamento. |
| Cotação expira durante espera | Recotação e diferença atribuída ao restaurante. |
| Custo posterior maior | Cliente não é recobrado. |
| Custo posterior menor | Cliente não recebe redução automática. |
| Evento PREPARING duplicado | Um único ciclo de alocação. |
| Cinco falhas | `CYCLE_EXHAUSTED`, alerta no painel e mensagem ao cliente. |
| Worker reiniciado | Tentativas lógicas não duplicam. |
| Troca para outro operador | Novo ciclo 1/5, histórico anterior preservado. |
| Troca para própria sem capacidade | Bloqueada sem alterar fulfillment atual. |
| Troca para própria com capacidade | Reserva criada e valor do cliente mantido. |
| Request externo sem resposta | Reconciliação antes da próxima criação. |
| Webhook repetido | Uma transição e uma notificação. |
| Webhook fora de ordem após entregue | Estado não regride. |
| Credencial inválida | Alerta técnico sanitizado, nenhum segredo em log. |
| Cancelamento cobrado | Custo registrado para o restaurante. |
| Entrega própria concluída | Capacidade liberada uma única vez. |

# 29. Estratégia de implementação

## Fase 0 — Congelamento de contratos

- revisar `requirements.md`, `design.md` e tasks anteriores;
- declarar este novo escopo como referência;
- congelar enums, OpenAPI, eventos e estratégia de migração;
- decidir provedor inicial de CEP e mapas;
- confirmar versão oficial da API iFood homologada.

## Fase 1 — Clientes e endereços

- migrations e entidades;
- resolução por telefone/tenant;
- CRUD, limite, default e exclusão lógica;
- adapter de CEP;
- geocodificação e confirmação;
- fluxo WhatsApp e Admin;
- snapshots no lote/Delivery.

## Fase 2 — Entrega própria simplificada

- configuração e simulador de todos os modos de tarifa;
- capacidade declarada;
- holds e reservas concorrentes;
- estados simplificados e operação no painel;
- remover dependência de driver individual/PIN/tracking do caminho novo.

## Fase 3 — Fundação externa

- provider config e credenciais;
- contrato `DeliveryProvider`;
- mock provider;
- quotes e fulfillments;
- custo do cliente versus custo do operador;
- webhooks inbox e reconciliação.

## Fase 4 — iFood

- autenticação e mapeamento do merchant;
- disponibilidade/cotação;
- criação ao iniciar preparo;
- tracking/código do operador;
- cancelamento, eventos e homologação sandbox.

## Fase 5 — Tentativas e fallback manual

- scheduler de cinco tentativas/15 minutos;
- erros normalizados;
- `CYCLE_EXHAUSTED`;
- alertas e mensagens;
- troca manual de operador;
- conversão para própria;
- auditoria e concorrência.

## Fase 6 — Hardening e piloto

- segurança de credenciais;
- carga, falhas e idempotência;
- observabilidade e dashboards;
- testes E2E do WhatsApp ao fulfillment;
- piloto com um tenant de Osasco;
- calibração de mensagens e tempos;
- runbook de suporte e rollback.

# 30. Definition of Done para futuras tasks

Cada task derivada desta especificação deve:

- referenciar a seção e os critérios de aceite correspondentes;
- declarar dependências de schema/contrato;
- aplicar tenant scope;
- incluir idempotência quando houver mutação;
- incluir auditoria quando houver ação humana ou configuração;
- não expor segredos ou PII em logs;
- atualizar OpenAPI e eventos;
- incluir migration reversível dentro dos limites de preservação;
- incluir testes unitários e de integração proporcionais ao risco;
- validar compatibilidade com tenants sem módulo;
- documentar variável de ambiente ou credencial nova;
- apresentar evidência manual para UI/WhatsApp;
- passar lint, typecheck e testes do componente.

# 31. Decisões de produto encerradas

- O produto suporta entrega própria e externa.
- Cada tenant escolhe uma modalidade padrão.
- Cada filial é um tenant.
- O operador externo inicial é iFood.
- Não haverá sugestão automática da melhor opção no MVP.
- Cotação externa ocorre antes do pagamento.
- Contratação ocorre ao iniciar o preparo.
- Frete integra o total pago pelo cliente.
- O preço do cliente congela após pagamento.
- Diferenças posteriores pertencem ao restaurante.
- ClickGarçom é integrador técnico, não intermediário financeiro.
- Conta e contrato do operador pertencem ao restaurante.
- Operador é configurado pelo tenant.
- São cinco tentativas no mesmo operador em 15 minutos.
- Outro operador inicia novo ciclo completo.
- Troca de operador/modalidade é manual e por entrega.
- Não há troca após coleta.
- Entrega própria usa somente quantidade disponível.
- Não há cadastro individual, localização, tracking ou PIN próprio.
- Tracking e código externos pertencem ao operador.
- Cliente recebe alerta quando não houver entregador.
- Cliente pode ter até cinco endereços.
- Todo endereço usado deve ser salvo e confirmado.
- Cliente e Admin podem editar/excluir endereços.
- Exclusão remove somente o endereço.
- Último endereço usado vira padrão.
- Não será salvo nome no perfil persistente.

# 32. Decisões técnicas ainda necessárias durante a implementação

Estas decisões não alteram o produto e devem ser resolvidas nas tasks de fundação:

- provedor inicial de CEP e política de fallback;
- provedor de geocodificação/rotas e limites comerciais;
- secret manager ou formato de criptografia local;
- versão e credenciais de homologação da API iFood;
- scheduler concreto para tentativas;
- política final de retenção/purge de endereços excluídos e payloads de webhook;
- catálogo final de templates WhatsApp;
- migração exata dos estados/colunas legados de tracking e PIN;
- criação e rollout do papel `DISPATCHER`.

# 33. Referências

## Documentos internos

- `specs/delivery/requirements.md`
- `specs/delivery/design.md`
- `specs/delivery/tasks.md`
- `docs/delivery-pilot-runbook.md`
- `docs/delivery-maintenance-runbook.md`

## Documentação oficial externa

- iFood Developer — pedidos fora da plataforma: https://developer.ifood.com.br/pt-BR/docs/guides/modules/shipping/outside/
- iFood Developer — visão geral de Shipping: https://developer.ifood.com.br/pt-BR/docs/guides/modules/shipping/intro/
- iFood Developer — funcionamento da logística: https://developer.ifood.com.br/pt-BR/docs/guides/modules/shipping/how-it-works/
- iFood Developer — boas práticas e troubleshooting: https://developer.ifood.com.br/pt-BR/docs/guides/modules/shipping/best-practices-troubleshooting/boas-praticas-e-troubleshooting

> Antes de implementar qualquer adapter externo, a task deve consultar novamente a documentação oficial e registrar a versão efetivamente homologada. Disponibilidade comercial, campos e regras do operador podem mudar sem alteração deste documento.
