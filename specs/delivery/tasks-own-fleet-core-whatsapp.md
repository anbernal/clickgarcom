# Tasks de Core e WhatsApp — Frota própria identificada

Fonte: [plano de frota própria](./own-fleet-drivers-plan.md). O Core continua
consumindo eventos e chamando contratos internos; não grava diretamente no
domínio Delivery.

## DEL-FLEET-CORE-001 — Versionar eventos de frota

- Status: [ ] Pendente
- Prioridade: P0
- Dependências: DEL-FLEET-BE-001, DEL-FLEET-BE-007

Implementação:

- consumir eventos de atribuição, retirada, rota, ocorrência, reatribuição e
  conclusão;
- versionar payloads sem CPF, placa completa, token ou código;
- preservar ordenação por entrega e idempotência por `event_id`;
- atualizar fakes e contrato interno Nest/Core.

Critérios de aceite:

- evento duplicado não repete mensagem;
- evento fora de ordem não regressa o status do cliente;
- Core não precisa consultar dados sensíveis para compor texto.

## DEL-FLEET-CORE-002 — Comunicar marcos ao cliente

- Status: [ ] Pendente
- Prioridade: P0
- Dependências: DEL-FLEET-CORE-001

Implementação:

- ao iniciar rota, usar nome do cliente, nome operacional do motoboy quando
  permitido e o link de tracking já autenticado;
- preservar código hexadecimal e botão de finalizar entrega existentes;
- notificar reatribuição apenas quando ela mudar prazo/atendimento;
- comunicar ocorrência de forma amigável, sem culpar motoboy ou expor dados;
- manter mensagens de pagamento, aceite, preparo e conclusão já existentes.

Critérios de aceite:

- a mensagem de saída acontece uma vez e após pagamento/validações;
- cliente nunca recebe CPF, placa ou telefone pessoal do motoboy;
- nome ausente usa texto neutro, sem `nil` ou `Cliente` indevido.

## DEL-FLEET-CORE-003 — Acesso/convite do motoboy por WhatsApp

- Status: [ ] Pendente
- Prioridade: P1
- Dependências: DEL-FLEET-BE-004

Implementação:

- se telefone do motoboy estiver cadastrado e consentido, enviar link de
  ativação/reemissão pelo canal existente;
- não enviar CPF, PIN ou URL reutilizável em texto;
- limitar reenvio e registrar auditoria;
- manter alternativa QR para operação sem telefone.

Critérios de aceite:

- mensagem usa template/canal permitido;
- reenvio não cria sessão paralela sem revogar a anterior conforme regra;
- falha de WhatsApp não bloqueia acesso por QR.

