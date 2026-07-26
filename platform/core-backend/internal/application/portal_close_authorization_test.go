package application

import (
	"strings"
	"testing"

	"github.com/google/uuid"

	"github.com/anbernal/clickgarcom/internal/domain/inbox/session"
	"github.com/anbernal/clickgarcom/internal/domain/tab"
)

func TestCanSessionCloseTabAllowsAuthorizedPortalSession(t *testing.T) {
	tabID := uuid.New()
	sess := session.NewSession("portal:"+tabID.String(), uuid.New())
	sess.SetContext(portalAuthorizedTabContextKey, tabID.String())
	userTab := &tab.Tab{ID: tabID, UserPhone: "5511999999999"}

	uc := &HandleWhatsAppMessageUseCase{}
	if !uc.canSessionCloseTab(sess, userTab) {
		t.Fatal("expected the authorized portal session to close its tab")
	}
}

func TestCanSessionCloseTabKeepsWhatsAppOwnerRestriction(t *testing.T) {
	sess := session.NewSession("5511888888888", uuid.New())
	userTab := &tab.Tab{ID: uuid.New(), UserPhone: "5511999999999"}

	uc := &HandleWhatsAppMessageUseCase{}
	if uc.canSessionCloseTab(sess, userTab) {
		t.Fatal("expected a different WhatsApp phone to be rejected")
	}
}

func TestClosingTabWithoutTableUsesComandaCode(t *testing.T) {
	userTab := &tab.Tab{PublicCode: "BB436"}

	staffMessage := buildClosingTabNoTableStaffMessage(userTab)
	fallbackMessage := buildClosingTabNoTableFallback(userTab)
	for name, message := range map[string]string{
		"staff":    staffMessage,
		"fallback": fallbackMessage,
	} {
		t.Run(name, func(t *testing.T) {
			if !strings.Contains(message, "BB436") {
				t.Fatalf("expected public comanda code in message: %q", message)
			}
			if strings.Contains(message, "identificar sua mesa") {
				t.Fatalf("message must not require a table: %q", message)
			}
		})
	}
}
