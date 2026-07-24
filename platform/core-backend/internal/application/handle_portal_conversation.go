package application

import (
	"context"
	"fmt"
	"strings"

	"github.com/google/uuid"

	domainconversation "github.com/anbernal/clickgarcom/internal/domain/conversation"
	"github.com/anbernal/clickgarcom/internal/domain/inbox/session"
	"github.com/anbernal/clickgarcom/internal/domain/tab"
)

const portalAuthorizedTabContextKey = "portal_authorized_tab_id"
const portalBootstrapActionID = "__PORTAL_BOOTSTRAP__"

func (uc *HandleWhatsAppMessageUseCase) ExecutePortal(
	ctx context.Context,
	input domainconversation.Input,
	inputStore domainconversation.InputStore,
) error {
	if err := input.Validate(); err != nil {
		return fmt.Errorf("invalid portal conversation input: %w", err)
	}
	if input.TabID == nil {
		return fmt.Errorf("portal conversation requires a tab")
	}

	userTab, err := uc.tabRepo.FindByID(ctx, *input.TabID, input.TenantID)
	if err != nil {
		return fmt.Errorf("failed to load portal tab: %w", err)
	}
	if userTab == nil || userTab.Status != tab.StatusOpen {
		return fmt.Errorf("portal tab is not open")
	}

	participantID := uc.resolvePortalParticipantID(input, userTab)
	if strings.TrimSpace(participantID) == "" {
		return fmt.Errorf("portal participant could not be resolved")
	}

	if inputStore != nil && strings.TrimSpace(input.ActionID) != portalBootstrapActionID {
		storedInput := input
		storedInput.ParticipantID = participantID
		if err := inputStore.AppendInput(ctx, input.TenantID, *input.TabID, storedInput); err != nil {
			return fmt.Errorf("failed to append inbound portal conversation: %w", err)
		}
	}

	sess, err := uc.sessionRepo.Find(ctx, participantID, input.TenantID.String())
	if err != nil {
		return fmt.Errorf("failed to find portal session: %w", err)
	}
	if sess == nil {
		sess = session.NewSession(participantID, input.TenantID)
		sess.TransitionTo(session.StateMainMenu)
	}

	tabID := userTab.ID
	sess.TabID = &tabID
	if userTab.TableID != nil {
		tableID := *userTab.TableID
		sess.TableID = &tableID
	}
	sess.SetContext(portalAuthorizedTabContextKey, userTab.ID.String())
	if sess.State == session.StateWelcome {
		sess.TransitionTo(session.StateMainMenu)
	}

	var response string
	var newState session.ConversationState
	if strings.TrimSpace(input.ActionID) == portalBootstrapActionID {
		response, newState, err = uc.repeatCurrentPrompt(ctx, sess)
		if err != nil {
			return fmt.Errorf("failed to bootstrap portal conversation: %w", err)
		}
	} else {
		messageText := strings.TrimSpace(input.ActionID)
		if messageText == "" {
			messageText = strings.TrimSpace(input.Text)
		}

		response, newState, err = uc.processMessage(ctx, sess, messageText)
		if err != nil {
			return fmt.Errorf("failed to process portal message: %w", err)
		}
	}

	if response == "" && sess.State == session.StateWelcome && (newState == "" || newState == session.StateWelcome) {
		response = ""
		newState = session.StateMainMenu
	}

	if response != "" {
		if sess.State == session.StateClosingTab || newState == session.StateClosingTab {
			response = uc.decorateClosedTenantClosingTabMessage(ctx, input.TenantID, response)
		}

		if err := uc.sendPortalResponse(ctx, participantID, input.TenantID, sess, response, newState); err != nil {
			return fmt.Errorf("failed to send portal response: %w", err)
		}
	}

	if newState != "" {
		sess.TransitionTo(newState)
	}

	if err := uc.sessionRepo.Save(ctx, sess); err != nil {
		return fmt.Errorf("failed to save portal session: %w", err)
	}

	return nil
}

func (uc *HandleWhatsAppMessageUseCase) resolvePortalParticipantID(
	input domainconversation.Input,
	userTab *tab.Tab,
) string {
	if userTab != nil && strings.TrimSpace(userTab.UserPhone) != "" {
		return strings.TrimSpace(userTab.UserPhone)
	}

	participantID := strings.TrimSpace(input.ParticipantID)
	if participantID != "" {
		return participantID
	}

	if input.TabID == nil {
		return ""
	}

	return "portal:" + input.TabID.String()
}

func (uc *HandleWhatsAppMessageUseCase) sendPortalResponse(
	ctx context.Context,
	participantID string,
	tenantID uuid.UUID,
	sess *session.Session,
	response string,
	newState session.ConversationState,
) error {
	sendMessage := uc.sendTenantMessage
	if newState == session.StateViewingTab {
		return uc.sendTabSummaryMenu(ctx, participantID, sess)
	}
	if newState == session.StateMainMenu && uc.isClosingTabPaymentUnavailableMessage(response) {
		return uc.sendClosingTabPaymentUnavailableMenu(ctx, participantID, tenantID, response)
	}
	if newState == session.StateWaitingAdminApproval {
		return uc.sendWaitingAdminApprovalMenu(ctx, participantID, tenantID, response)
	}
	if newState == session.StateWaitingJoinApproval {
		return uc.sendWaitingJoinApprovalMenu(ctx, participantID, tenantID, response)
	}
	if newState == session.StateWaitingTabCode {
		sendMessage = uc.sendTenantMessageNoBack
	}

	return sendMessage(ctx, participantID, tenantID, response)
}
