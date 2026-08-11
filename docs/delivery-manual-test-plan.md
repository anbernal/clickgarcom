# Roteiro de teste manual — Delivery V2

Este roteiro valida o caminho feliz e as falhas principais usando o provider
fake. O sandbox real do iFood fica para a homologação.

## Pré-requisitos

1. Aplicar migrations `000040` até `000045`.
2. Subir PostgreSQL, RabbitMQ, Core Go e Tenant Admin.
3. Definir `INTERNAL_SERVICE_TOKEN` e, para credenciais reais,
   `DELIVERY_CREDENTIAL_ENCRYPTION_KEY`.
4. Criar um usuário Admin/Manager e um usuário Dispatcher no mesmo tenant.
5. Abrir o Admin em `/admin.html` e acessar **Entregas**.

Na tela **Configurar operação**, os modelos de taxa disponíveis são `NONE`,
`FIXED`, `DISTANCE_BANDS`, `PER_KM` e `HYBRID`. Use o simulador antes de salvar
e confirme que o valor exibido vem do endpoint autoritativo da API.

Modos do fake externo:

- padrão: `DELIVERY_FAKE_PROVIDER_MODE=SUCCESS`;
- `FAIL_FIRST_N` com `DELIVERY_FAKE_PROVIDER_FAILURES=5` para esgotar um ciclo;
- `TIMEOUT` para falha retryable contínua;
- `DELIVERED` para simular conclusão imediata;
- `DELIVERY_FAKE_PROVIDER_ACTUAL_COST=12.50` para validar ajuste financeiro.

## 1. Configuração própria

1. Abrir **Configurar operação**.
2. Ativar o módulo, selecionar **Entrega própria**, informar origem, raio e
   quantidade de entregadores próprios.
3. Salvar e recarregar a página; o snapshot deve permanecer igual.
4. Confirmar que a disponibilidade mostra declarada, reservada e disponível.
5. Simular uma taxa e verificar que o valor vem do endpoint da API.

## 2. Fluxo próprio

1. Criar um pedido Delivery pelo fluxo WhatsApp/Core ou pelo endpoint interno.
2. Confirmar endereço e pagamento.
3. Confirmar que o pedido aparece no board sem entregador individual.
4. Iniciar o preparo e confirmar a transição para `READY_FOR_DISPATCH`.
5. Usar **Marcar como saiu** e depois **Marcar entregue**.
6. Repetir o clique rapidamente; não pode criar transição duplicada.
7. Confirmar que a reserva de capacidade foi liberada.

## 3. Fluxo externo fake

1. Selecionar **Operador externo** e manter `IFOOD` como ordem.
2. Configurar o operador pelo botão **Gerenciar credenciais**; os segredos
   devem desaparecer dos campos após o envio e nunca voltar no GET.
3. Criar quote antes do pagamento e confirmar o checkout.
4. Iniciar o preparo; confirmar que o scheduler executa as tentativas fake.
5. Validar estados de busca, atribuição, rota e conclusão.
6. Forçar falhas até o limite do ciclo e confirmar o alerta de ciclo esgotado.

## 4. Fallback e concorrência

1. Com ciclo externo esgotado, reiniciar o ciclo pelo perfil autorizado.
2. Converter para própria e confirmar a exigência de capacidade.
3. Tentar a mesma ação com usuário sem papel de override; deve retornar 403.
4. Enviar duas ações com a mesma versão; uma deve vencer e a outra retornar
   conflito sem corromper o estado.

## 5. Endereço e privacidade

1. Resolver cliente por telefone e cadastrar endereço via CEP.
2. Editar, selecionar default e excluir endereço.
3. Tentar cadastrar um sexto endereço; a API deve rejeitar.
4. Confirmar que o board mascara o nome e reduz o endereço à área segura.
5. Confirmar que logs, notificações e métricas não exibem telefone, endereço,
   token ou PIN.

## 6. Evidências mínimas

- screenshots do painel próprio e externo;
- IDs de Delivery/checkout sem dados pessoais;
- resposta do endpoint interno de métricas;
- resultado do `go test ./...`, build NestJS e Playwright;
- qualquer divergência registrada antes de habilitar outro tenant.
