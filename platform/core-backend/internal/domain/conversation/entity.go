package conversation

import (
	"fmt"
	"strings"

	"github.com/google/uuid"
)

// Channel identifies the transport only. Business rules must not depend on it.
type Channel string

const (
	ChannelWhatsApp Channel = "WHATSAPP"
	ChannelPortal   Channel = "PORTAL"
)

// Input is the normalized customer intent consumed by the conversation engine.
// A portal action uses the same action IDs that WhatsApp interactive buttons use.
type Input struct {
	TenantID      uuid.UUID
	TabID         *uuid.UUID
	ParticipantID string
	Channel       Channel
	Text          string
	ActionID      string
}

func (input Input) Validate() error {
	if input.TenantID == uuid.Nil {
		return fmt.Errorf("conversation tenant is required")
	}
	if strings.TrimSpace(input.ParticipantID) == "" {
		return fmt.Errorf("conversation participant is required")
	}
	if input.Channel != ChannelWhatsApp && input.Channel != ChannelPortal {
		return fmt.Errorf("unsupported conversation channel")
	}
	if input.Channel == ChannelPortal && (input.TabID == nil || *input.TabID == uuid.Nil) {
		return fmt.Errorf("portal conversation requires a tab")
	}
	if strings.TrimSpace(input.Text) == "" && strings.TrimSpace(input.ActionID) == "" {
		return fmt.Errorf("conversation text or action is required")
	}
	return nil
}

// Action is channel-neutral. WhatsApp renders it as an interactive reply and
// the portal renders it as a web button carrying the exact same ID.
type Action struct {
	ID          string `json:"id"`
	Label       string `json:"label"`
	Description string `json:"description,omitempty"`
}

// Output is the response produced by the shared conversation engine.
type Output struct {
	Text    string   `json:"text"`
	Actions []Action `json:"actions,omitempty"`
}
