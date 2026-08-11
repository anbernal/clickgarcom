const assert = require('node:assert/strict');
const { createHmac } = require('node:crypto');
const { test } = require('node:test');

const { DeliveryWebhookService } = require('../dist/modules/delivery/delivery-webhook.service');
const { DeliveryNotificationService } = require('../dist/modules/delivery/delivery-notification.service');

test('assinatura HMAC do webhook aceita somente o corpo exato', () => {
  const service = Object.create(DeliveryWebhookService.prototype);
  const body = Buffer.from(JSON.stringify({ event_id: 'evt-1', status: 'ASSIGNED' }));
  const secret = 'delivery-test-secret';
  const signature = createHmac('sha256', secret).update(body).digest('hex');
  assert.equal(service.verifySignature(body, `sha256=${signature}`, secret), true);
  assert.equal(service.verifySignature(Buffer.from(`${body.toString()} `), signature, secret), false);
  assert.equal(service.verifySignature(body, 'invalid', secret), false);
});

test('notificação externa não grava telefone no corpo e não executa sem dado do operador', async () => {
  const query = async (_sql, params) => {
    assert.equal(params[2], '5511999999999');
    assert.match(params[3], /987654/);
    assert.doesNotMatch(params[3], /5511999999999/);
    return { rowCount: 1 };
  };
  const manager = { query, getRepository: () => ({ findOne: async () => ({ settings: { messages: {} } }) }) };
  const service = new DeliveryNotificationService();
  const delivery = { id: 'delivery-1', tenantId: 'tenant-1', customerPhone: '5511999999999', displayCode: '123456' };
  await service.enqueueExternalAssignment(manager, delivery, 'https://tracking.invalid/demo', '987654');
  let called = false;
  await new DeliveryNotificationService().enqueueExternalAssignment({ query: async () => { called = true; }, getRepository: () => ({ findOne: async () => null }) }, { ...delivery, customerPhone: null }, null, null);
  assert.equal(called, false);
});
