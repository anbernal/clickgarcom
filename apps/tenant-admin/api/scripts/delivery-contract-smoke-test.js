const assert = require('node:assert/strict');
const { test } = require('node:test');

const { buildTenantAdminOpenApiDocument } = require('../dist/shared/openapi');
const { buildTenantRoleMetadata } = require('../dist/modules/auth/roles');
const { DELIVERY_EVENT_ENVELOPE_JSON_SCHEMA } = require('../dist/modules/delivery/contracts/delivery-events');
const { DELIVERY_STATUS_TRANSITIONS, DeliveryStatus } = require('../dist/modules/delivery/contracts/delivery-enums');

test('OpenAPI publica contratos administrativos críticos de Delivery', () => {
  const document = buildTenantAdminOpenApiDocument();
  const paths = document.paths;
  assert.ok(paths['/admin/api/v1/delivery/capacity/reservations']);
  assert.ok(paths['/admin/api/v1/deliveries/reports/summary']);
  assert.ok(paths['/admin/api/v1/deliveries/reports/summary.csv']);
  assert.ok(paths['/admin/api/v1/deliveries/{id}/own/start']);
  assert.ok(paths['/admin/api/v1/deliveries/{id}/own/complete']);
  assert.ok(paths['/admin/api/v1/delivery/fulfillments/{deliveryId}/restart-cycle']);
  assert.ok(paths['/admin/api/v1/delivery/fulfillments/{deliveryId}/convert-to-own']);
  assert.ok(paths['/admin/api/v1/delivery/providers/{provider}/test-connection']);
  const reportQueryNames = paths['/admin/api/v1/deliveries/reports/summary'].get.parameters.map((parameter) => parameter.name);
  for (const name of ['mode', 'provider', 'status']) assert.ok(reportQueryNames.includes(name));
});

test('RBAC mantém Dispatcher no despacho e fora de credenciais/relatórios restritos', () => {
  const metadata = buildTenantRoleMetadata();
  assert.ok(metadata.route_groups.delivery_read.includes('DISPATCHER'));
  assert.ok(metadata.route_groups.delivery_dispatch.includes('DISPATCHER'));
  assert.ok(!metadata.route_groups.delivery_settings.includes('DISPATCHER'));
  assert.ok(!metadata.route_groups.delivery_driver.includes('DISPATCHER'));
});

test('envelope de eventos exige correlação, tenant e agregado', () => {
  const required = DELIVERY_EVENT_ENVELOPE_JSON_SCHEMA.required;
  for (const field of ['event_id', 'type', 'occurred_at', 'tenant_id', 'aggregate_id', 'correlation_id', 'data']) assert.ok(required.includes(field));
  assert.equal(DELIVERY_EVENT_ENVELOPE_JSON_SCHEMA.additionalProperties, false);
});

test('máquina de estados não permite regressão de entrega concluída', () => {
  assert.deepEqual(DELIVERY_STATUS_TRANSITIONS[DeliveryStatus.Delivered], []);
  assert.equal(DELIVERY_STATUS_TRANSITIONS[DeliveryStatus.Preparing].includes(DeliveryStatus.Delivered), false);
});
