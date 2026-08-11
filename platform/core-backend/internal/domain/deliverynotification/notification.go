// Package deliverynotification defines the notification request consumed by
// Core Go before it delegates delivery to the existing WhatsApp outbox.
package deliverynotification

import (
	"fmt"
	"strings"

	"github.com/google/uuid"
)

const CurrentVersion = 1

type Milestone string

const (
	MilestoneAccepted                 Milestone = "ACCEPTED"
	MilestonePreparing                Milestone = "PREPARING"
	MilestoneManualAcceptanceRequired Milestone = "MANUAL_ACCEPTANCE_REQUIRED"
	MilestoneSearchingCourier         Milestone = "SEARCHING_COURIER"
	MilestoneAllocationFailed         Milestone = "ALLOCATION_FAILED"
	MilestoneTrackingAvailable        Milestone = "TRACKING_AVAILABLE"
	MilestoneOwnDispatched            Milestone = "OWN_DISPATCHED"
	MilestonePickedUp                 Milestone = "PICKED_UP"
	MilestoneArrived                  Milestone = "ARRIVED"
	MilestoneDelivered                Milestone = "DELIVERED"
	MilestoneRejected                 Milestone = "REJECTED"
)

type Request struct {
	Version    int       `json:"version"`
	EventID    string    `json:"event_id"`
	TenantID   uuid.UUID `json:"tenant_id"`
	DeliveryID uuid.UUID `json:"delivery_id"`
	Recipient  string    `json:"recipient"`
	Milestone  Milestone `json:"milestone"`
	TemplateID string    `json:"template_id"`
	Body       string    `json:"body"`
}

func (r Request) Validate() error {
	if r.Version == 0 {
		r.Version = CurrentVersion
	}
	if r.Version != CurrentVersion {
		return fmt.Errorf("unsupported delivery notification version %d", r.Version)
	}
	if strings.TrimSpace(r.EventID) == "" {
		return fmt.Errorf("event_id is required")
	}
	if r.TenantID == uuid.Nil || r.DeliveryID == uuid.Nil {
		return fmt.Errorf("tenant_id and delivery_id are required")
	}
	if strings.TrimSpace(r.Recipient) == "" || strings.TrimSpace(r.Body) == "" {
		return fmt.Errorf("recipient and body are required")
	}
	switch r.Milestone {
	case MilestoneAccepted, MilestonePreparing, MilestoneManualAcceptanceRequired,
		MilestoneSearchingCourier, MilestoneAllocationFailed, MilestoneTrackingAvailable,
		MilestoneOwnDispatched, MilestonePickedUp, MilestoneArrived, MilestoneDelivered,
		MilestoneRejected:
		return nil
	default:
		return fmt.Errorf("unsupported delivery notification milestone %q", r.Milestone)
	}
}
