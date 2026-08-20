# Modularização do módulo Atendimento

## Contrato

As capacidades comerciais ficam no `settings` do tenant:

```json
{
  "attendance": { "enabled": true },
  "delivery": { "enabled": false }
}
```

`attendance.enabled` ausente significa `true`, preservando tenants existentes. O
campo `service_mode` continua representando apenas `COM_MESA`/`SEM_MESA`.

## Escopo de Atendimento

- mesas e comandas;
- solicitações de mesa e chamar garçom;
- conversas presenciais;
- KDS Salão;
- operações presenciais de fechamento.

Catálogo, produção de cozinha/bar, pagamentos e pedidos Delivery permanecem
compartilhados.

## Regras

- O Super Admin é o único responsável por ativar/desativar o módulo.
- O painel Admin e o KDS mantêm a entrada visível e mostram uma tela de
  ativação quando o módulo está indisponível.
- O WhatsApp monta o menu de acordo com as capacidades do tenant. Delivery-only
  nunca expõe mesa, comanda ou chamar garçom.
- APIs de criação de mesa, abertura de comanda e criação/aprovação de
  solicitações retornam `MODULE_DISABLED` quando o módulo está desligado.
- Dados históricos não são removidos.

## Compatibilidade

Tenants sem `attendance` continuam ativos. A desativação é reversível e fica
registrada na auditoria do Super Admin.
