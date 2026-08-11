const assert = require('node:assert/strict');
const { test } = require('node:test');

const { DeliveryFeeService } = require('../dist/modules/delivery/delivery-fee.service');
const { DeliveryPolicyService } = require('../dist/modules/delivery/delivery-policy.service');
const { FakeDeliveryProvider } = require('../dist/modules/delivery/providers/fake-delivery.provider');

test('calcula tarifa por quilômetro e híbrida sem arredondamento financeiro local', () => {
  const service = new DeliveryFeeService();
  const perKm = service.quote(5500, { mode: 'PER_KM', fixed_fee: 3, included_km: 2, price_per_km: 2, minimum_fee: 0, rounding_mode: 'NONE' });
  assert.equal(perKm.amount, 10);
  assert.equal(perKm.rule.chargeable_km, 3.5);

  const hybrid = service.quote(4500, { mode: 'HYBRID', fixed_fee: 2, price_per_km: 1, bands: [{ up_to_km: 5, fee: 8 }], minimum_fee: 0, rounding_mode: 'NONE' });
  assert.equal(hybrid.amount, 8);
  assert.equal(hybrid.rule.mode, 'HYBRID');
});

test('aceite automático respeita janela que atravessa meia-noite', () => {
  const service = new DeliveryPolicyService();
  const settings = { enabled: true, timezone: 'America/Sao_Paulo', auto_accept: { enabled: true, require_confirmed_payment: false, max_active_deliveries: 5, windows: [{ days: ['MON'], start: '22:00', end: '02:00' }] } };
  assert.equal(service.isWithinWindow(settings.auto_accept.windows, { weekday: 'MON', minutes: 23 * 60 }), true);
  assert.equal(service.isWithinWindow(settings.auto_accept.windows, { weekday: 'MON', minutes: 1 * 60 }), true);
  assert.equal(service.isWithinWindow(settings.auto_accept.windows, { weekday: 'MON', minutes: 12 * 60 }), false);
});

test('provider fake executa falhas determinísticas e preserva idempotência', async () => {
  const previousMode = process.env.DELIVERY_FAKE_PROVIDER_MODE;
  const previousFailures = process.env.DELIVERY_FAKE_PROVIDER_FAILURES;
  try {
    process.env.DELIVERY_FAKE_PROVIDER_MODE = 'FAIL_FIRST_N';
    process.env.DELIVERY_FAKE_PROVIDER_FAILURES = '2';
    const provider = new FakeDeliveryProvider();
    const request = { tenantId: 'tenant-smoke', externalQuoteId: 'quote-1', idempotencyKey: 'attempt-1', orderReference: 'delivery-1', address: { formattedAddress: 'Rua A, 10', latitude: -23.55, longitude: -46.63 } };
    await assert.rejects(() => provider.createDelivery(request));
    await assert.rejects(() => provider.createDelivery({ ...request, idempotencyKey: 'attempt-2' }));
    const created = await provider.createDelivery({ ...request, idempotencyKey: 'attempt-3' });
    const repeated = await provider.createDelivery({ ...request, idempotencyKey: 'attempt-3' });
    assert.equal(created.externalDeliveryId, repeated.externalDeliveryId);
    assert.match(created.confirmationCode, /^\d{6}$/);
  } finally {
    if (previousMode === undefined) delete process.env.DELIVERY_FAKE_PROVIDER_MODE;
    else process.env.DELIVERY_FAKE_PROVIDER_MODE = previousMode;
    if (previousFailures === undefined) delete process.env.DELIVERY_FAKE_PROVIDER_FAILURES;
    else process.env.DELIVERY_FAKE_PROVIDER_FAILURES = previousFailures;
  }
});

test('provider fake permite entrega imediata e custo efetivo configurável', async () => {
  const previousMode = process.env.DELIVERY_FAKE_PROVIDER_MODE;
  const previousCost = process.env.DELIVERY_FAKE_PROVIDER_ACTUAL_COST;
  try {
    process.env.DELIVERY_FAKE_PROVIDER_MODE = 'DELIVERED';
    process.env.DELIVERY_FAKE_PROVIDER_ACTUAL_COST = '12.50';
    const provider = new FakeDeliveryProvider();
    const result = await provider.createDelivery({ tenantId: 'tenant-smoke', externalQuoteId: 'quote-1', idempotencyKey: 'attempt-delivered', orderReference: 'delivery-2', address: { formattedAddress: 'Rua B, 20', latitude: -23.55, longitude: -46.63 } });
    assert.equal(result.status, 'DELIVERED');
    assert.equal(result.actualCost, 12.5);
  } finally {
    if (previousMode === undefined) delete process.env.DELIVERY_FAKE_PROVIDER_MODE;
    else process.env.DELIVERY_FAKE_PROVIDER_MODE = previousMode;
    if (previousCost === undefined) delete process.env.DELIVERY_FAKE_PROVIDER_ACTUAL_COST;
    else process.env.DELIVERY_FAKE_PROVIDER_ACTUAL_COST = previousCost;
  }
});
