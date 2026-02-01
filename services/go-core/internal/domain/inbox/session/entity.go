package session

import (
	"time"

	"github.com/google/uuid"
)

type ConversationState string

const (
	StateWelcome         ConversationState = "WELCOME"
	StateMainMenu        ConversationState = "MAIN_MENU"
	StateOrdering        ConversationState = "ORDERING"
	StateSelectingQty    ConversationState = "SELECTING_QTY"
	StateAddingNotes     ConversationState = "ADDING_NOTES"
	StateConfirmingOrder ConversationState = "CONFIRMING_ORDER"
	StateViewingTab      ConversationState = "VIEWING_TAB"
	StateServiceRequest  ConversationState = "SERVICE_REQUEST"
)

type Session struct {
	UserPhone string                 `json:"user_phone"`
	TenantID  uuid.UUID              `json:"tenant_id"`
	TableID   *uuid.UUID             `json:"table_id,omitempty"`
	TabID     *uuid.UUID             `json:"tab_id,omitempty"`
	State     ConversationState      `json:"state"`
	Context   map[string]interface{} `json:"context"`
	CreatedAt time.Time              `json:"created_at"`
	UpdatedAt time.Time              `json:"updated_at"`
	ExpiresAt time.Time              `json:"expires_at"`
}

// NewSession cria uma nova sessão
func NewSession(userPhone string, tenantID uuid.UUID) *Session {
	now := time.Now()
	return &Session{
		UserPhone: userPhone,
		TenantID:  tenantID,
		State:     StateWelcome,
		Context:   make(map[string]interface{}),
		CreatedAt: now,
		UpdatedAt: now,
		ExpiresAt: now.Add(24 * time.Hour), // Sessão expira em 24h
	}
}

// SetContext define um valor no contexto
func (s *Session) SetContext(key string, value interface{}) {
	s.Context[key] = value
	s.UpdatedAt = time.Now()
}

// GetContext recupera um valor do contexto
func (s *Session) GetContext(key string) (interface{}, bool) {
	value, exists := s.Context[key]
	return value, exists
}

// TransitionTo muda o estado da conversa
func (s *Session) TransitionTo(newState ConversationState) {
	s.State = newState
	s.UpdatedAt = time.Now()
}

// IsExpired verifica se a sessão expirou
func (s *Session) IsExpired() bool {
	return time.Now().After(s.ExpiresAt)
}

// Reset reinicia a sessão para o menu principal
func (s *Session) Reset() {
	s.State = StateMainMenu
	s.Context = make(map[string]interface{})
	s.UpdatedAt = time.Now()
}
