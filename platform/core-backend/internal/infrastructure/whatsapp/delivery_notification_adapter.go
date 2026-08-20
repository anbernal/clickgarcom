package whatsapp

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"sync"

	"github.com/anbernal/clickgarcom/internal/domain/deliverynotification"
	whatsappDomain "github.com/anbernal/clickgarcom/internal/domain/whatsapp"
	"github.com/google/uuid"
	"go.uber.org/zap"
)

// DeliveryNotificationSender is deliberately narrower than the full sender,
// making the event adapter easy to test and preventing accidental use of
// immediate Meta API methods.
type DeliveryNotificationSender interface {
	SendText(ctx context.Context, to string, message string) error
}

type DeliverySessionFinalizer interface {
	EndDeliveredDeliverySession(ctx context.Context, phone string, tenantID uuid.UUID) error
}

type DeliveryNotificationAdapter struct {
	sender    DeliveryNotificationSender
	finalizer DeliverySessionFinalizer
	logger    *zap.Logger
	mu        sync.Mutex
	seen      map[string]struct{}
	order     []string
	maxSeen   int
}

func NewDeliveryNotificationAdapter(sender DeliveryNotificationSender, logger *zap.Logger) *DeliveryNotificationAdapter {
	return &DeliveryNotificationAdapter{sender: sender, logger: logger, seen: make(map[string]struct{}), maxSeen: 4096}
}

func (a *DeliveryNotificationAdapter) SetDeliverySessionFinalizer(finalizer DeliverySessionFinalizer) {
	if a != nil {
		a.finalizer = finalizer
	}
}

func (a *DeliveryNotificationAdapter) Handle(ctx context.Context, body []byte) error {
	var request deliverynotification.Request
	if err := json.Unmarshal(body, &request); err != nil {
		return fmt.Errorf("invalid delivery notification payload: %w", err)
	}
	if err := request.Validate(); err != nil {
		return err
	}
	if a.sender == nil {
		return fmt.Errorf("delivery notification sender is not configured")
	}
	a.mu.Lock()
	if _, duplicate := a.seen[request.EventID]; duplicate {
		a.mu.Unlock()
		return nil
	}
	a.mu.Unlock()

	// Never log request.Body: pickup notifications contain the customer PIN.
	if a.logger != nil {
		a.logger.Debug("processing delivery notification",
			zap.String("event_id", request.EventID),
			zap.String("tenant_id", request.TenantID.String()),
			zap.String("delivery_id", request.DeliveryID.String()),
			zap.String("milestone", string(request.Milestone)),
		)
	}
	if err := a.sender.SendText(whatsappDomain.WithTenantID(ctx, request.TenantID), strings.TrimSpace(request.Recipient), request.Body); err != nil {
		return err
	}
	if request.Milestone == deliverynotification.MilestoneDelivered && a.finalizer != nil {
		if err := a.finalizer.EndDeliveredDeliverySession(ctx, strings.TrimSpace(request.Recipient), request.TenantID); err != nil && a.logger != nil {
			a.logger.Warn("failed to close delivered WhatsApp delivery session", zap.Error(err), zap.String("tenant_id", request.TenantID.String()), zap.String("delivery_id", request.DeliveryID.String()))
		}
	}
	a.mu.Lock()
	a.seen[request.EventID] = struct{}{}
	a.order = append(a.order, request.EventID)
	if len(a.order) > a.maxSeen {
		delete(a.seen, a.order[0])
		a.order = a.order[1:]
	}
	a.mu.Unlock()
	return nil
}

func ParseDeliveryNotificationEventID(raw string) (uuid.UUID, error) {
	return uuid.Parse(strings.TrimSpace(raw))
}
