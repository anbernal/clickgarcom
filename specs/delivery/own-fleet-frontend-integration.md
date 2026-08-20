# Mapa de integração — Frontend da frota própria

## Estado entregue

O frontend administrativo, o encaixe do KDS e o portal responsivo do motoboy
estão funcionais com um adapter local explicitamente identificado como prévia.
Nenhuma tela precisa ser redesenhada quando o backend estiver pronto.

Para ativar os contratos reais, publicar no runtime config:

```js
window.CLICKGARCOM_RUNTIME_CONFIG = {
  // demais valores atuais
  fleetApiEnabled: true,
};
```

Com a flag ausente ou `false`, a prévia usa `localStorage` por tenant no Admin e
`sessionStorage` no portal. Esse estado não é uma fonte de verdade e não deve ser
usado para operação real.

## Adapter do Admin/KDS

| Ação | Contrato esperado |
|---|---|
| Consultar modo | `GET /admin/api/delivery/fleet/config` |
| Alterar modo | `PUT /admin/api/delivery/fleet/config` |
| Listar motoboys | `GET /admin/api/delivery/drivers?include_inactive=true` |
| Cadastrar | `POST /admin/api/delivery/drivers` |
| Editar | `PATCH /admin/api/delivery/drivers/:id` |
| Ativar/inativar | `POST /admin/api/delivery/drivers/:id/activate\|deactivate` |
| Gerar acesso | `POST /admin/api/delivery/drivers/:id/access-links` |
| Revogar sessões | `DELETE /admin/api/delivery/drivers/:id/sessions` |
| Consultar filas | `GET /admin/api/delivery/fleet/assignments?status=ACTIVE` |
| Reordenar fila | `PUT /admin/api/delivery/drivers/:id/queue` |
| Atribuir/reatribuir | `POST /admin/api/deliveries/:id/assign` |
| Relatório | `GET /admin/api/deliveries/reports/drivers` |

Respostas de mutação devem carregar `version`; conflitos devem retornar `409` e
o snapshot atual. CPF volta sempre mascarado. Link/token de ativação é retornado
uma única vez e não deve ser incluído em logs, eventos ou consultas posteriores.

## Adapter do portal

| Ação | Contrato esperado |
|---|---|
| Trocar token de ativação | `POST /admin/api/public/delivery/drivers/access/exchange` |
| Criar PIN e ativar | `POST /admin/api/public/delivery/drivers/access/activate` |
| Login com CPF + PIN | `POST /admin/api/public/delivery/drivers/login` |
| Consultar/encerrar sessão | `GET/DELETE /admin/api/driver/session` |
| Abrir/fechar turno | `PUT /admin/api/driver/shift` |
| Consultar fila própria | `GET /admin/api/driver/deliveries` |
| Histórico mínimo | `GET /admin/api/driver/deliveries/history?period=today` |
| Confirmar retirada | `POST /admin/api/driver/deliveries/:id/pickup` |
| Iniciar rota | `POST /admin/api/driver/deliveries/:id/start` |
| Informar chegada | `POST /admin/api/driver/deliveries/:id/arrive` |
| Concluir com código | `POST /admin/api/driver/deliveries/:id/complete` |
| Abrir ocorrência | `POST /admin/api/driver/deliveries/:id/incident` |

O backend deve entregar a sessão em cookie `HttpOnly`, `Secure` e `SameSite`,
escopada por tenant e motoboy. O fragmento `#activate=` é removido do navegador
imediatamente depois da troca. Todas as mutações usam idempotência e versão.

## Realtime

O frontend reconcilia a cada 15 segundos sem reiniciar alerta ou áudio. Quando
o websocket for conectado, os eventos abaixo devem somente invalidar o snapshot
correspondente:

- `delivery.driver.assigned`;
- `delivery.driver.reassigned`;
- `delivery.driver.shift_changed`;
- `delivery.driver.queue_reordered`;
- `delivery.status_changed`;
- `delivery.incident.opened`;
- `delivery.completed`.

## Gate para remover a prévia

- migrations aplicadas e rollback validado;
- RBAC e isolamento multi-tenant aprovados;
- CPF criptografado/HMAC e mascaramento verificados;
- sessão e revogação validadas em navegador real;
- concorrência de atribuição/reordenação coberta;
- eventos realtime homologados;
- `fleetApiEnabled: true` habilitado primeiro em um tenant piloto;
- dados locais de prévia ignorados e posteriormente removidos.
