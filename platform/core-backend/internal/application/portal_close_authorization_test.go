package application

import (
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
