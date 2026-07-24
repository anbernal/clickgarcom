package conversation

import (
	"testing"

	"github.com/google/uuid"
)

func TestInputValidateRequiresPortalTabAndIntent(t *testing.T) {
	tenantID := uuid.New()
	tabID := uuid.New()

	validPortal := Input{
		TenantID: tenantID, TabID: &tabID, ParticipantID: "portal:" + tabID.String(),
		Channel: ChannelPortal, ActionID: "1",
	}
	if err := validPortal.Validate(); err != nil {
		t.Fatalf("expected valid portal input, got %v", err)
	}

	missingTab := validPortal
	missingTab.TabID = nil
	if err := missingTab.Validate(); err == nil {
		t.Fatal("expected portal input without tab to fail")
	}

	missingIntent := validPortal
	missingIntent.ActionID = ""
	if err := missingIntent.Validate(); err == nil {
		t.Fatal("expected input without text or action to fail")
	}
}

func TestInputValidateAllowsWhatsAppBeforeTabAssignment(t *testing.T) {
	input := Input{
		TenantID: uuid.New(), ParticipantID: "5511999999999", Channel: ChannelWhatsApp, Text: "olá",
	}
	if err := input.Validate(); err != nil {
		t.Fatalf("expected WhatsApp input without tab to be valid, got %v", err)
	}
}
