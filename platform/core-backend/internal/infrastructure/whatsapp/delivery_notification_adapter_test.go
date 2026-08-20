package whatsapp

import (
	"context"
	"encoding/json"
	"testing"

	"github.com/anbernal/clickgarcom/internal/domain/deliverynotification"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
	"go.uber.org/zap"
)

type deliveryNotificationSenderSpy struct {
	recipient string
	body      string
}

type deliverySessionFinalizerSpy struct {
	phone  string
	tenant uuid.UUID
	called int
}

func (s *deliverySessionFinalizerSpy) EndDeliveredDeliverySession(_ context.Context, phone string, tenantID uuid.UUID) error {
	s.phone = phone
	s.tenant = tenantID
	s.called++
	return nil
}

func (s *deliveryNotificationSenderSpy) SendText(_ context.Context, recipient, body string) error {
	s.recipient = recipient
	s.body = body
	return nil
}

func TestDeliveryNotificationAdapterDelegatesWithoutLoggingBody(t *testing.T) {
	spy := &deliveryNotificationSenderSpy{}
	adapter := NewDeliveryNotificationAdapter(spy, zap.NewNop())
	payload, err := json.Marshal(deliverynotification.Request{
		Version:    deliverynotification.CurrentVersion,
		EventID:    uuid.NewString(),
		TenantID:   uuid.New(),
		DeliveryID: uuid.New(),
		Recipient:  "5511999999999",
		Milestone:  deliverynotification.MilestonePickedUp,
		TemplateID: "delivery_picked_up_v1",
		Body:       "Código de recebimento: 042391",
	})
	require.NoError(t, err)

	require.NoError(t, adapter.Handle(context.Background(), payload))
	require.Equal(t, "5511999999999", spy.recipient)
	require.Contains(t, spy.body, "042391")
}

func TestDeliveryNotificationAdapterRejectsMalformedRequest(t *testing.T) {
	adapter := NewDeliveryNotificationAdapter(&deliveryNotificationSenderSpy{}, zap.NewNop())
	require.Error(t, adapter.Handle(context.Background(), []byte(`{"tenant_id":"missing"}`)))
}

func TestDeliveryNotificationAdapterDoesNotSendDuplicateEvent(t *testing.T) {
	spy := &deliveryNotificationSenderSpy{}
	adapter := NewDeliveryNotificationAdapter(spy, zap.NewNop())
	payload, err := json.Marshal(deliverynotification.Request{
		Version:  deliverynotification.CurrentVersion,
		EventID:  "same-event",
		TenantID: uuid.New(), DeliveryID: uuid.New(), Recipient: "5511999999999",
		Milestone: deliverynotification.MilestoneDelivered, Body: "entregue",
	})
	require.NoError(t, err)
	require.NoError(t, adapter.Handle(context.Background(), payload))
	require.NoError(t, adapter.Handle(context.Background(), payload))
	require.Equal(t, "entregue", spy.body)
}

func TestDeliveryNotificationAdapterClosesSessionAfterDelivered(t *testing.T) {
	spy := &deliveryNotificationSenderSpy{}
	finalizer := &deliverySessionFinalizerSpy{}
	adapter := NewDeliveryNotificationAdapter(spy, zap.NewNop())
	adapter.SetDeliverySessionFinalizer(finalizer)
	tenantID := uuid.New()
	payload, err := json.Marshal(deliverynotification.Request{
		Version: deliverynotification.CurrentVersion,
		EventID: uuid.NewString(), TenantID: tenantID, DeliveryID: uuid.New(), Recipient: "5511999999999",
		Milestone: deliverynotification.MilestoneDelivered, Body: "entregue",
	})
	require.NoError(t, err)
	require.NoError(t, adapter.Handle(context.Background(), payload))
	require.Equal(t, 1, finalizer.called)
	require.Equal(t, "5511999999999", finalizer.phone)
	require.Equal(t, tenantID, finalizer.tenant)
}
