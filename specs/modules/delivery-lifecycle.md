# Ciclo de vida do módulo Delivery

O Delivery é ativado exclusivamente pelo Super Admin. O botão da listagem é
`Ativar` quando o módulo está indisponível e `Desativar` quando está ativo;
não há propaganda ou chamada comercial nessa tela operacional.

## Validade

Ao ativar, o operador escolhe uma data/hora limite futura ou marca
`Ativação permanente`. O tenant registra no `settings.delivery`:

```json
{
  "enabled": true,
  "enabled_at": "2026-08-19T18:00:00.000Z",
  "expires_at": "2026-09-19T02:59:59.000Z",
  "permanent": false,
  "disabled_at": null
}
```

`permanent: true` remove a data limite. A validade é avaliada em tempo de uso;
quando expira, o módulo passa a ser considerado desativado sem apagar a
configuração ou o histórico. O Super Admin pode reativá-lo definindo uma nova
data ou tornando-o permanente.

## Compatibilidade

Tenants antigos com `enabled: true` e sem data continuam ativos. A data de
início passa a ser registrada na próxima ativação ou alteração feita pelo
Super Admin. Atualizações de configuração feitas pelo Admin preservam os
metadados de ciclo de vida.
