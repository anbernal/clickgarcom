package application

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"math"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/google/uuid"
	"go.uber.org/zap"

	"github.com/anbernal/clickgarcom/internal/domain/inbox/session"
	"github.com/anbernal/clickgarcom/internal/domain/orderbatch"
	"github.com/anbernal/clickgarcom/internal/infrastructure/nodeadmin"
)

const (
	deliveryCustomerIDKey       = "delivery_customer_id"
	deliveryAddressIDsKey       = "delivery_address_ids"
	deliverySelectedAddressKey  = "delivery_selected_address_id"
	deliveryAddressDraftKey     = "delivery_address_draft"
	deliveryAddressReadyKey     = "delivery_address_ready"
	deliveryAddressNewKey       = "delivery_address_new"
	deliveryAddressPostalKey    = "delivery_address_postal_code"
	deliveryAddressConsentKey   = "delivery_address_consent"
	deliveryAddressDeleteKey    = "delivery_address_delete_id"
	deliveryAddressEditKey      = "delivery_address_edit"
	deliveryCheckoutKeyKey      = "delivery_checkout_key"
	deliveryCheckoutTokenKey    = "delivery_checkout_confirmation_token"
	deliveryCheckoutFeeKey      = "delivery_checkout_customer_fee"
	deliveryCheckoutTotalKey    = "delivery_checkout_total"
	deliveryCheckoutExpiresKey  = "delivery_checkout_expires_at"
	deliveryCheckoutModeKey     = "delivery_checkout_mode"
	deliveryCheckoutPaidKey     = "delivery_checkout_paid"
	deliveryOrderBatchKey       = "delivery_order_batch_id"
	deliveryPaymentEventKey     = "delivery_payment_event_id"
	deliveryAddressPromptNotice = "Digite *0* para cancelar o cadastro de endereço."
)

var deliveryPostalCodePattern = regexp.MustCompile(`^\d{8}$`)

// DeliveryCustomerGateway keeps the WhatsApp application independent from
// HTTP. NestJS remains the owner of customer/address persistence and fake
// implementations can be used by conversation tests.
type DeliveryCustomerGateway interface {
	Resolve(context.Context, nodeadmin.ResolveDeliveryCustomerInput) (nodeadmin.DeliveryCustomer, error)
	ListAddresses(context.Context, uuid.UUID, uuid.UUID) ([]nodeadmin.DeliveryAddress, error)
	CreateAddress(context.Context, uuid.UUID, uuid.UUID, nodeadmin.CreateDeliveryAddressInput) (nodeadmin.DeliveryAddress, error)
	UpdateAddress(context.Context, uuid.UUID, uuid.UUID, uuid.UUID, nodeadmin.UpdateDeliveryAddressInput) (nodeadmin.DeliveryAddress, error)
	DeleteAddress(context.Context, uuid.UUID, uuid.UUID, uuid.UUID) error
	LookupPostalCode(context.Context, uuid.UUID, string) (nodeadmin.PostalCodeLookupResult, error)
	Geocode(context.Context, uuid.UUID, nodeadmin.GeocodeDeliveryAddressInput) (nodeadmin.GeocodeDeliveryAddressResult, error)
}

type DeliveryQuoteGateway interface {
	Create(context.Context, nodeadmin.DeliveryQuoteInput) (nodeadmin.DeliveryQuoteResponse, error)
}

type DeliveryOrderBatchGateway interface {
	Reconcile(context.Context, nodeadmin.DeliveryOrderBatchReconcileInput) (nodeadmin.DeliveryOrderBatchReconcileResponse, error)
}

func (uc *HandleWhatsAppMessageUseCase) SetDeliveryCustomerGateway(gateway DeliveryCustomerGateway) {
	uc.deliveryCustomer = gateway
}

func (uc *HandleWhatsAppMessageUseCase) SetDeliveryQuoteGateway(gateway DeliveryQuoteGateway) {
	uc.deliveryQuote = gateway
}

// StartDeliveryAddressFlow resolves the WhatsApp number inside the current
// tenant and starts the saved/new address branch. It is intentionally exposed
// as a small boundary so the cart/checkout flow can invoke it later without
// duplicating tenant or address validation.
func (uc *HandleWhatsAppMessageUseCase) StartDeliveryAddressFlow(ctx context.Context, sess *session.Session) (string, session.ConversationState, error) {
	if sess == nil || sess.TenantID == uuid.Nil || strings.TrimSpace(sess.UserPhone) == "" {
		return "❌ Não consegui identificar o cliente para a entrega.", session.StateMainMenu, nil
	}
	if uc.deliveryCustomer == nil {
		return "❌ O cadastro de endereços está temporariamente indisponível. Tente novamente em instantes.", session.StateMainMenu, nil
	}
	uc.clearDeliveryCheckoutContext(sess)

	customer, err := uc.deliveryCustomer.Resolve(ctx, nodeadmin.ResolveDeliveryCustomerInput{
		TenantID: sess.TenantID,
		Phone:    sess.UserPhone,
	})
	if err != nil {
		uc.logger.Warn("delivery customer resolution failed in WhatsApp flow", zap.Error(err), zap.String("tenant_id", sess.TenantID.String()))
		return "❌ Não consegui identificar seu cadastro agora. Tente novamente em instantes.", session.StateMainMenu, nil
	}
	sess.SetContext(deliveryCustomerIDKey, customer.ID.String())
	sess.SetContext(deliveryAddressReadyKey, false)
	delete(sess.Context, deliveryAddressDraftKey)
	delete(sess.Context, deliverySelectedAddressKey)
	delete(sess.Context, deliveryAddressEditKey)
	delete(sess.Context, deliveryAddressDeleteKey)

	addresses, err := uc.deliveryCustomer.ListAddresses(ctx, sess.TenantID, customer.ID)
	if err != nil {
		uc.logger.Warn("delivery addresses listing failed in WhatsApp flow", zap.Error(err), zap.String("tenant_id", sess.TenantID.String()))
		return "❌ Não consegui carregar seus endereços agora. Tente novamente em instantes.", session.StateMainMenu, nil
	}
	validAddresses := make([]nodeadmin.DeliveryAddress, 0, len(addresses))
	ids := make([]string, 0, len(addresses))
	for _, address := range addresses {
		if address.ID == uuid.Nil {
			continue
		}
		validAddresses = append(validAddresses, address)
		ids = append(ids, address.ID.String())
	}
	sess.SetContext(deliveryAddressIDsKey, ids)
	if len(validAddresses) == 0 {
		sess.SetContext(deliveryAddressNewKey, true)
		sess.TransitionTo(session.StateDeliveryPostalCode)
		return "📍 Vamos cadastrar seu endereço de entrega.\n\nInforme seu CEP com 8 dígitos.\n\n" + deliveryPostalCodePrompt(), session.StateDeliveryPostalCode, nil
	}

	sess.SetContext(deliveryAddressNewKey, false)
	sess.TransitionTo(session.StateDeliveryAddressSelection)
	return formatDeliveryAddressSelection(validAddresses), session.StateDeliveryAddressSelection, nil
}

func (uc *HandleWhatsAppMessageUseCase) handleDeliveryAddressSelection(ctx context.Context, sess *session.Session, text string) (string, session.ConversationState, error) {
	text = strings.TrimSpace(strings.ToLower(text))
	if text == "0" || text == "cancelar" {
		uc.clearDeliveryAddressContext(sess)
		return "Operação de entrega cancelada.\n\n" + "Digite *0* para voltar ao menu principal.", session.StateMainMenu, nil
	}
	if text == "novo" || text == "nova" || text == "cadastrar" || text == "n" {
		delete(sess.Context, deliveryAddressDraftKey)
		sess.SetContext(deliveryAddressNewKey, true)
		sess.TransitionTo(session.StateDeliveryPostalCode)
		return "📍 Informe o CEP do novo endereço com 8 dígitos.\n\n" + deliveryPostalCodePrompt(), session.StateDeliveryPostalCode, nil
	}
	deleteRequested := false
	editRequested := false
	if strings.HasPrefix(text, "excluir ") || strings.HasPrefix(text, "deletar ") || strings.HasPrefix(text, "delete ") {
		deleteRequested = true
		text = strings.TrimSpace(strings.TrimPrefix(strings.TrimPrefix(strings.TrimPrefix(text, "excluir "), "deletar "), "delete "))
	}
	if strings.HasPrefix(text, "editar ") || strings.HasPrefix(text, "edit ") {
		editRequested = true
		text = strings.TrimSpace(strings.TrimPrefix(strings.TrimPrefix(text, "editar "), "edit "))
	}
	index, err := strconv.Atoi(text)
	ids := uc.getContextStringSlice(sess, deliveryAddressIDsKey)
	if err != nil || index < 1 || index > len(ids) {
		return formatDeliveryAddressSelectionPrompt(), session.StateDeliveryAddressSelection, nil
	}
	addressID, err := uuid.Parse(ids[index-1])
	if err != nil || addressID == uuid.Nil {
		return "❌ Não consegui validar esse endereço. Escolha outro da lista.", session.StateDeliveryAddressSelection, nil
	}
	// The selected ID must come from the tenant-scoped list stored for this
	// session. Never accept an arbitrary address ID from WhatsApp text.
	sess.SetContext(deliverySelectedAddressKey, addressID.String())
	if deleteRequested {
		sess.SetContext(deliveryAddressDeleteKey, addressID.String())
		sess.TransitionTo(session.StateDeliveryAddressDelete)
		return "⚠️ Tem certeza que deseja excluir este endereço? Responda *sim* ou *não*.", session.StateDeliveryAddressDelete, nil
	}
	sess.SetContext(deliveryAddressReadyKey, false)
	customerID, err := uuid.Parse(uc.getContextString(sess, deliveryCustomerIDKey))
	if err != nil || customerID == uuid.Nil {
		return "❌ Perdi a referência do cliente. Vamos reiniciar o cadastro.", session.StateMainMenu, nil
	}
	addresses, err := uc.deliveryCustomer.ListAddresses(ctx, sess.TenantID, customerID)
	if err != nil {
		return "❌ Não consegui validar esse endereço agora. Tente novamente.", session.StateDeliveryAddressSelection, nil
	}
	for _, address := range addresses {
		if address.ID == addressID {
			draft := deliveryAddressToDraft(address)
			sess.SetContext(deliveryAddressDraftKey, draft)
			if editRequested {
				sess.SetContext(deliveryAddressEditKey, true)
				sess.SetContext(deliveryAddressNewKey, true)
				sess.TransitionTo(session.StateDeliveryPostalCode)
				return "✏️ Vamos editar este endereço. Informe o novo CEP com 8 dígitos.\n\n" + deliveryPostalCodePrompt(), session.StateDeliveryPostalCode, nil
			}
			sess.TransitionTo(session.StateDeliveryAddressConfirmation)
			return "Confira o endereço escolhido:\n\n" + formatDeliveryDraft(draft) + "\n\nEstá correto? Responda *sim* ou *não*.", session.StateDeliveryAddressConfirmation, nil
		}
	}
	return "❌ Esse endereço não está mais disponível. Atualizei sua lista; escolha novamente.", session.StateDeliveryAddressSelection, nil
}

func (uc *HandleWhatsAppMessageUseCase) handleDeliveryAddressDelete(ctx context.Context, sess *session.Session, text string) (string, session.ConversationState, error) {
	answer := strings.ToLower(strings.TrimSpace(text))
	if answer == "não" || answer == "nao" || answer == "n" {
		delete(sess.Context, deliveryAddressDeleteKey)
		sess.TransitionTo(session.StateDeliveryAddressSelection)
		return "Exclusão cancelada. Escolha um endereço ou digite *novo*.", session.StateDeliveryAddressSelection, nil
	}
	if answer == "0" || answer == "cancelar" {
		uc.clearDeliveryAddressContext(sess)
		return "Operação cancelada.\n\nDigite *0* para voltar ao menu principal.", session.StateMainMenu, nil
	}
	if answer != "sim" && answer != "s" && answer != "ok" {
		return "Responda *sim* para excluir ou *não* para manter o endereço.", session.StateDeliveryAddressDelete, nil
	}
	customerID, err := uuid.Parse(uc.getContextString(sess, deliveryCustomerIDKey))
	addressID, addressErr := uuid.Parse(uc.getContextString(sess, deliveryAddressDeleteKey))
	if err != nil || addressErr != nil || customerID == uuid.Nil || addressID == uuid.Nil {
		return "❌ Perdi a referência do endereço. Vamos atualizar sua lista.", session.StateMainMenu, nil
	}
	if err := uc.deliveryCustomer.DeleteAddress(ctx, sess.TenantID, customerID, addressID); err != nil {
		return "❌ Não consegui excluir o endereço agora. Tente novamente.", session.StateDeliveryAddressDelete, nil
	}
	delete(sess.Context, deliveryAddressDeleteKey)
	delete(sess.Context, deliverySelectedAddressKey)
	return uc.StartDeliveryAddressFlow(ctx, sess)
}

func (uc *HandleWhatsAppMessageUseCase) handleDeliveryPostalCode(ctx context.Context, sess *session.Session, text string) (string, session.ConversationState, error) {
	text = strings.TrimSpace(text)
	if text == "0" {
		uc.clearDeliveryAddressContext(sess)
		return "Cadastro cancelado.\n\n" + "Digite *0* para voltar ao menu principal.", session.StateMainMenu, nil
	}
	postalCode := strings.Map(func(r rune) rune {
		if r >= '0' && r <= '9' {
			return r
		}
		return -1
	}, text)
	if !deliveryPostalCodePattern.MatchString(postalCode) {
		return "❌ CEP inválido. Informe exatamente 8 dígitos, por exemplo *01311000*.\n\n" + deliveryPostalCodePrompt(), session.StateDeliveryPostalCode, nil
	}
	draft := uc.getDeliveryDraft(sess)
	draft["postal_code"] = postalCode
	sess.SetContext(deliveryAddressDraftKey, draft)
	lookup, err := uc.deliveryCustomer.LookupPostalCode(ctx, sess.TenantID, postalCode)
	if err != nil {
		draft["postal_code_lookup_status"] = "ERROR"
		sess.SetContext(deliveryAddressDraftKey, draft)
		return "⚠️ Não consegui consultar o CEP agora. Você pode continuar preenchendo o endereço manualmente.\n\nInforme o logradouro (rua/avenida).", session.StateDeliveryStreet, nil
	}
	draft["postal_code_provider"] = lookup.Provider
	draft["postal_code_lookup_status"] = lookup.Status
	if lookup.Street != "" {
		draft["street"] = lookup.Street
	}
	if lookup.Neighborhood != "" {
		draft["neighborhood"] = lookup.Neighborhood
	}
	if lookup.City != "" {
		draft["city"] = lookup.City
	}
	if lookup.State != "" {
		draft["state"] = strings.ToUpper(lookup.State)
	}
	sess.SetContext(deliveryAddressDraftKey, draft)
	if strings.EqualFold(lookup.Status, "FOUND") && strings.TrimSpace(lookup.Street) != "" {
		sess.TransitionTo(session.StateDeliveryAddressNumber)
		return fmt.Sprintf("✅ Encontrei o CEP em %s/%s.\n\nInforme o número do endereço.\n\n%s", lookup.City, lookup.State, deliveryPostalCodePrompt()), session.StateDeliveryAddressNumber, nil
	}
	sess.TransitionTo(session.StateDeliveryStreet)
	return "Não encontrei todos os dados desse CEP. Informe o logradouro (rua/avenida).\n\n" + deliveryPostalCodePrompt(), session.StateDeliveryStreet, nil
}

func (uc *HandleWhatsAppMessageUseCase) handleDeliveryDraftField(ctx context.Context, sess *session.Session, text string) (string, session.ConversationState, error) {
	text = strings.TrimSpace(text)
	if text == "0" || strings.EqualFold(text, "cancelar") {
		uc.clearDeliveryAddressContext(sess)
		return "Cadastro cancelado.\n\n" + "Digite *0* para voltar ao menu principal.", session.StateMainMenu, nil
	}
	draft := uc.getDeliveryDraft(sess)
	switch sess.State {
	case session.StateDeliveryStreet:
		if len([]rune(text)) < 3 {
			return "Informe um logradouro válido (rua, avenida etc.).", session.StateDeliveryStreet, nil
		}
		draft["street"] = text
		sess.SetContext(deliveryAddressDraftKey, draft)
		if deliveryDraftString(draft, "neighborhood") == "" {
			sess.TransitionTo(session.StateDeliveryNeighborhood)
			return "Informe o bairro.", session.StateDeliveryNeighborhood, nil
		}
		sess.TransitionTo(session.StateDeliveryAddressNumber)
		return "Informe o número do endereço.", session.StateDeliveryAddressNumber, nil
	case session.StateDeliveryNeighborhood:
		if len([]rune(text)) < 2 {
			return "Informe um bairro válido.", session.StateDeliveryNeighborhood, nil
		}
		draft["neighborhood"] = text
		sess.SetContext(deliveryAddressDraftKey, draft)
		if deliveryDraftString(draft, "city") == "" {
			sess.TransitionTo(session.StateDeliveryCity)
			return "Informe a cidade.", session.StateDeliveryCity, nil
		}
		if deliveryDraftString(draft, "state") == "" {
			sess.TransitionTo(session.StateDeliveryState)
			return "Informe a UF com 2 letras, por exemplo *SP*.", session.StateDeliveryState, nil
		}
		sess.TransitionTo(session.StateDeliveryAddressNumber)
		return "Informe o número do endereço.", session.StateDeliveryAddressNumber, nil
	case session.StateDeliveryCity:
		if len([]rune(text)) < 2 {
			return "Informe uma cidade válida.", session.StateDeliveryCity, nil
		}
		draft["city"] = text
		sess.SetContext(deliveryAddressDraftKey, draft)
		if deliveryDraftString(draft, "state") == "" {
			sess.TransitionTo(session.StateDeliveryState)
			return "Informe a UF com 2 letras, por exemplo *SP*.", session.StateDeliveryState, nil
		}
		sess.TransitionTo(session.StateDeliveryAddressNumber)
		return "Informe o número do endereço.", session.StateDeliveryAddressNumber, nil
	case session.StateDeliveryState:
		state := strings.ToUpper(text)
		if len([]rune(state)) != 2 || state[0] < 'A' || state[0] > 'Z' || state[1] < 'A' || state[1] > 'Z' {
			return "Informe uma UF válida com 2 letras, por exemplo *SP*.", session.StateDeliveryState, nil
		}
		draft["state"] = state
		sess.SetContext(deliveryAddressDraftKey, draft)
		sess.TransitionTo(session.StateDeliveryAddressNumber)
		return "Informe o número do endereço.", session.StateDeliveryAddressNumber, nil
	case session.StateDeliveryAddressNumber:
		if len([]rune(text)) == 0 || len([]rune(text)) > 20 {
			return "Informe um número de endereço válido.", session.StateDeliveryAddressNumber, nil
		}
		draft["address_number"] = text
		sess.SetContext(deliveryAddressDraftKey, draft)
		if deliveryDraftString(draft, "neighborhood") == "" {
			sess.TransitionTo(session.StateDeliveryNeighborhood)
			return "Informe o bairro.", session.StateDeliveryNeighborhood, nil
		}
		if deliveryDraftString(draft, "city") == "" {
			sess.TransitionTo(session.StateDeliveryCity)
			return "Informe a cidade.", session.StateDeliveryCity, nil
		}
		if deliveryDraftString(draft, "state") == "" {
			sess.TransitionTo(session.StateDeliveryState)
			return "Informe a UF com 2 letras, por exemplo *SP*.", session.StateDeliveryState, nil
		}
		sess.TransitionTo(session.StateDeliveryAddressComplement)
		return "Informe o complemento ou responda *pular* se não houver.", session.StateDeliveryAddressComplement, nil
	case session.StateDeliveryAddressComplement:
		draft["address_complement"] = optionalDeliveryValue(text)
		sess.SetContext(deliveryAddressDraftKey, draft)
		sess.TransitionTo(session.StateDeliveryAddressReference)
		return "Informe uma referência ou responda *pular* se não houver.", session.StateDeliveryAddressReference, nil
	case session.StateDeliveryAddressReference:
		draft["address_reference"] = optionalDeliveryValue(text)
		sess.SetContext(deliveryAddressDraftKey, draft)
		sess.TransitionTo(session.StateDeliveryAddressLabel)
		return "Como deseja chamar esse endereço? Ex.: *Casa*, *Trabalho* ou *Cliente*.", session.StateDeliveryAddressLabel, nil
	case session.StateDeliveryAddressLabel:
		label := text
		if strings.EqualFold(label, "pular") || label == "-" {
			label = "Principal"
		}
		if len([]rune(label)) > 80 {
			return "O nome do endereço deve ter no máximo 80 caracteres.", session.StateDeliveryAddressLabel, nil
		}
		draft["label"] = label
		geocoded, err := uc.deliveryCustomer.Geocode(ctx, sess.TenantID, deliveryGeocodeInput(draft))
		if err != nil {
			uc.logger.Warn("delivery address geocode failed in WhatsApp flow", zap.Error(err), zap.String("tenant_id", sess.TenantID.String()))
			return "⚠️ Não consegui validar o endereço no mapa. Revise os dados ou digite *0* para cancelar.", session.StateDeliveryAddressLabel, nil
		}
		draft["latitude"] = geocoded.Latitude
		draft["longitude"] = geocoded.Longitude
		draft["geocode_provider"] = geocoded.GeocodeProvider
		draft["geocode_quality"] = geocoded.GeocodeQuality
		draft["geocode_provider_id"] = optionalStringPointer(geocoded.GeocodeProviderID)
		sess.SetContext(deliveryAddressDraftKey, draft)
		sess.TransitionTo(session.StateDeliveryAddressConfirmation)
		return "Confira o endereço completo:\n\n" + formatDeliveryDraft(draft) + "\n\nEstá correto? Responda *sim* ou *não*.", session.StateDeliveryAddressConfirmation, nil
	default:
		return "Não entendi. " + deliveryPostalCodePrompt(), sess.State, nil
	}
}

func (uc *HandleWhatsAppMessageUseCase) handleDeliveryAddressConfirmation(ctx context.Context, sess *session.Session, text string) (string, session.ConversationState, error) {
	answer := strings.ToLower(strings.TrimSpace(text))
	if answer == "0" || answer == "cancelar" {
		uc.clearDeliveryAddressContext(sess)
		return "Cadastro cancelado.\n\n" + "Digite *0* para voltar ao menu principal.", session.StateMainMenu, nil
	}
	if answer == "não" || answer == "nao" || answer == "n" {
		if uc.getContextString(sess, deliverySelectedAddressKey) != "" {
			sess.TransitionTo(session.StateDeliveryAddressSelection)
			return "Tudo bem. Escolha outro endereço ou digite *novo* para cadastrar um novo.", session.StateDeliveryAddressSelection, nil
		}
		sess.TransitionTo(session.StateDeliveryStreet)
		return "Vamos corrigir. Informe o logradouro.", session.StateDeliveryStreet, nil
	}
	if answer != "sim" && answer != "s" && answer != "ok" {
		return "Responda *sim* se estiver correto ou *não* para alterar.", session.StateDeliveryAddressConfirmation, nil
	}
	if uc.getContextString(sess, deliverySelectedAddressKey) != "" && uc.getContextString(sess, deliveryAddressEditKey) != "true" {
		sess.SetContext(deliveryAddressReadyKey, true)
		return "✅ Endereço confirmado para esta entrega.\n\nO próximo passo é revisar o frete e o total do pedido.", session.StateDeliveryReady, nil
	}
	sess.TransitionTo(session.StateDeliveryAddressConsent)
	return "Deseja salvar este endereço para próximos pedidos? Responda *sim* ou *não*.\n\n" + deliveryPostalCodePrompt(), session.StateDeliveryAddressConsent, nil
}

func (uc *HandleWhatsAppMessageUseCase) handleDeliveryAddressConsent(ctx context.Context, sess *session.Session, text string) (string, session.ConversationState, error) {
	answer := strings.ToLower(strings.TrimSpace(text))
	if answer == "0" || answer == "cancelar" {
		uc.clearDeliveryAddressContext(sess)
		return "Cadastro cancelado.\n\n" + "Digite *0* para voltar ao menu principal.", session.StateMainMenu, nil
	}
	if answer == "não" || answer == "nao" || answer == "n" {
		// V2 does not allow an unsaved temporary address to proceed to checkout.
		return "Para usar a entrega, é necessário salvar e confirmar o endereço. Responda *sim* para salvar ou *0* para cancelar.", session.StateDeliveryAddressConsent, nil
	}
	if answer != "sim" && answer != "s" && answer != "ok" {
		return "Responda *sim* para salvar o endereço ou *0* para cancelar.", session.StateDeliveryAddressConsent, nil
	}
	customerID, err := uuid.Parse(uc.getContextString(sess, deliveryCustomerIDKey))
	if err != nil || customerID == uuid.Nil {
		return "❌ Perdi a referência do cliente. Vamos reiniciar o cadastro.", session.StateMainMenu, nil
	}
	draft := uc.getDeliveryDraft(sess)
	if uc.getContextString(sess, deliveryAddressEditKey) == "true" {
		addressID, addressErr := uuid.Parse(uc.getContextString(sess, deliverySelectedAddressKey))
		if addressErr != nil || addressID == uuid.Nil {
			return "❌ Perdi a referência do endereço que seria editado. Vamos reiniciar a lista.", session.StateMainMenu, nil
		}
		updated, err := uc.deliveryCustomer.UpdateAddress(ctx, sess.TenantID, customerID, addressID, deliveryUpdateAddressInput(draft))
		if err != nil {
			return "❌ Não consegui atualizar o endereço agora. Tente novamente.", session.StateDeliveryAddressConsent, nil
		}
		sess.SetContext(deliverySelectedAddressKey, updated.ID.String())
		sess.SetContext(deliveryAddressReadyKey, true)
		return "✅ Endereço atualizado e confirmado para esta entrega.\n\nO próximo passo é revisar o frete e o total do pedido.", session.StateDeliveryReady, nil
	}
	created, err := uc.deliveryCustomer.CreateAddress(ctx, sess.TenantID, customerID, deliveryCreateAddressInput(draft))
	if err != nil {
		uc.logger.Warn("delivery address creation failed in WhatsApp flow", zap.Error(err), zap.String("tenant_id", sess.TenantID.String()))
		return "❌ Não consegui salvar o endereço agora. Tente novamente em instantes.", session.StateDeliveryAddressConsent, nil
	}
	sess.SetContext(deliverySelectedAddressKey, created.ID.String())
	sess.SetContext(deliveryAddressReadyKey, true)
	sess.SetContext(deliveryAddressNewKey, false)
	return "✅ Endereço salvo e confirmado para esta entrega.\n\nO próximo passo é revisar o frete e o total do pedido.", session.StateDeliveryReady, nil
}

func (uc *HandleWhatsAppMessageUseCase) handleDeliveryReady(ctx context.Context, sess *session.Session, text string) (string, session.ConversationState, error) {
	text = strings.TrimSpace(strings.ToLower(text))
	if text == "0" || text == "cancelar" {
		uc.clearDeliveryAddressContext(sess)
		return "Entrega cancelada.\n\n" + "Digite *0* para voltar ao menu principal.", session.StateMainMenu, nil
	}
	if text == "1" || text == "continuar" || text == "sim" || text == "ok" {
		return uc.StartDeliveryCheckout(ctx, sess)
	}
	return "✅ O endereço está confirmado. Responda *continuar* para consultar o frete e o total final, ou *0* para cancelar.", session.StateDeliveryReady, nil
}

// StartDeliveryCheckout creates the authoritative NestJS checkout from the
// current cart and confirmed address. Local cart values are used only as the
// subtotal input; freight and total always come from NestJS.
func (uc *HandleWhatsAppMessageUseCase) StartDeliveryCheckout(ctx context.Context, sess *session.Session) (string, session.ConversationState, error) {
	if sess == nil || uc.deliveryCheckout == nil {
		return "❌ O checkout de entrega está temporariamente indisponível.", session.StateDeliveryReady, nil
	}
	if uc.getContextString(sess, deliveryAddressReadyKey) != "true" {
		return "❌ Primeiro confirme um endereço de entrega.", session.StateDeliveryAddressSelection, nil
	}
	customerID, err := uuid.Parse(uc.getContextString(sess, deliveryCustomerIDKey))
	addressID, addressErr := uuid.Parse(uc.getContextString(sess, deliverySelectedAddressKey))
	if err != nil || addressErr != nil || customerID == uuid.Nil || addressID == uuid.Nil {
		return "❌ Perdi a referência do endereço. Vamos selecionar novamente.", session.StateDeliveryAddressSelection, nil
	}
	draft := uc.getDeliveryDraft(sess)
	latitude, latitudeOK := deliveryDraftFloat(draft, "latitude")
	longitude, longitudeOK := deliveryDraftFloat(draft, "longitude")
	if !latitudeOK || !longitudeOK {
		return "❌ O endereço ainda não possui uma localização válida. Edite e confirme o endereço novamente.", session.StateDeliveryAddressConfirmation, nil
	}
	cart := uc.getOrderingCart(sess)
	if len(cart) == 0 {
		return "❌ Seu carrinho está vazio. Escolha os itens antes de calcular a entrega.", session.StateOrdering, nil
	}
	orderTotal, err := deliveryCartSubtotal(cart)
	if err != nil {
		return "❌ Não consegui calcular o subtotal do carrinho agora.", session.StateConfirmingOrder, nil
	}
	cartJSON, _ := json.Marshal(cart)
	digest := sha256.Sum256(cartJSON)
	mode := strings.ToUpper(uc.getContextString(sess, deliveryCheckoutModeKey))
	checkoutInput := DeliveryCheckoutCreateInput{
		TenantID:          sess.TenantID,
		CustomerID:        customerID,
		CustomerAddressID: addressID,
		FulfillmentMode:   mode,
		OrderTotal:        orderTotal,
		DestinationLat:    latitude,
		DestinationLng:    longitude,
		AddressSnapshot:   draft,
		CartFingerprint:   hex.EncodeToString(digest[:]),
		CheckoutKey:       uc.getContextString(sess, deliveryCheckoutKeyKey),
	}
	if checkoutInput.CheckoutKey == "" {
		checkoutInput.CheckoutKey = BuildDeliveryCheckoutKey(checkoutInput)
	}
	if mode == "EXTERNAL" {
		if uc.deliveryQuote == nil {
			return "❌ A cotação do operador externo está temporariamente indisponível.", session.StateDeliveryReady, nil
		}
		quote, quoteErr := uc.deliveryQuote.Create(ctx, nodeadmin.DeliveryQuoteInput{
			TenantID:          sess.TenantID,
			CheckoutKey:       checkoutInput.CheckoutKey,
			CustomerID:        customerID,
			CustomerAddressID: addressID,
			FormattedAddress:  formatDeliveryDraft(draft),
			Latitude:          latitude,
			Longitude:         longitude,
			OrderTotal:        orderTotal,
		})
		if quoteErr != nil || quote.ID == uuid.Nil || quote.Status != "VALID" || !quote.ExpiresAt.After(time.Now()) {
			return "❌ Não consegui obter uma cotação válida para a entrega externa. Tente novamente ou escolha entrega própria.", session.StateDeliveryReady, nil
		}
		checkoutInput.QuoteID = &quote.ID
	}
	if uc.getContextString(sess, deliveryOrderBatchKey) == "" {
		if uc.createOrderUC == nil {
			return "❌ Não consegui preparar o lote do pedido para a entrega.", session.StateDeliveryReady, nil
		}
		userTab := uc.findSessionOpenTab(ctx, sess)
		if userTab == nil {
			return "❌ Não encontrei uma comanda aberta para vincular o pedido de entrega.", session.StateDeliveryReady, nil
		}
		orderItems, buildErr := uc.buildOrderingCartOrderInput(ctx, sess, cart)
		if buildErr != nil {
			return "❌ Não consegui validar os itens do carrinho para a entrega.", session.StateDeliveryReady, nil
		}
		createdOrder, createErr := uc.createOrderUC.Execute(ctx, CreateOrderInput{
			TenantID:                sess.TenantID,
			TabID:                   userTab.ID,
			Items:                   orderItems,
			Notes:                   fmt.Sprintf("Pedido Delivery via WhatsApp - %s", sess.UserPhone),
			ServiceType:             orderbatch.ServiceTypeDelivery,
			DeliveryAddressSnapshot: deliveryBatchSnapshot(draft, latitude, longitude),
		})
		if createErr != nil || createdOrder == nil || createdOrder.BatchID == nil {
			return "❌ Não consegui criar o lote do pedido para a entrega.", session.StateDeliveryReady, nil
		}
		sess.SetContext(deliveryOrderBatchKey, createdOrder.BatchID.String())
	}
	batchID, batchErr := uuid.Parse(uc.getContextString(sess, deliveryOrderBatchKey))
	if batchErr != nil || batchID == uuid.Nil {
		return "❌ Não consegui vincular o checkout ao lote do pedido.", session.StateDeliveryReady, nil
	}
	checkoutInput.OrderBatchID = &batchID
	result, err := uc.deliveryCheckout.Create(ctx, checkoutInput)
	if err != nil {
		uc.logger.Warn("delivery checkout creation failed in WhatsApp flow", zap.Error(err), zap.String("tenant_id", sess.TenantID.String()))
		return "❌ Não consegui consultar o frete para este endereço. Tente novamente ou escolha outra modalidade.", session.StateDeliveryReady, nil
	}
	sess.SetContext(deliveryCheckoutKeyKey, result.CheckoutKey)
	sess.SetContext(deliveryCheckoutTokenKey, result.ConfirmationToken)
	sess.SetContext(deliveryCheckoutFeeKey, result.CustomerDeliveryFee)
	sess.SetContext(deliveryCheckoutTotalKey, result.TotalAmount)
	sess.SetContext(deliveryCheckoutExpiresKey, result.ExpiresAt.UTC().Format(time.RFC3339))
	sess.SetContext(deliveryCheckoutModeKey, result.FulfillmentMode)
	sess.SetContext(deliveryCheckoutPaidKey, false)
	sess.TransitionTo(session.StateDeliveryCheckoutReview)
	return fmt.Sprintf("🧾 *Revisão da entrega*\n\nSubtotal dos itens: R$ %.2f\nFrete: R$ %.2f\n*Total: R$ %.2f*\n\nValidade da cotação/hold: %s\n\nResponda *1* para seguir para o pagamento ou *0* para cancelar.", result.OrderTotal, result.CustomerDeliveryFee, result.TotalAmount, result.ExpiresAt.Local().Format("02/01 às 15:04")), session.StateDeliveryCheckoutReview, nil
}

func (uc *HandleWhatsAppMessageUseCase) handleDeliveryCheckoutReview(_ context.Context, sess *session.Session, text string) (string, session.ConversationState, error) {
	if deliveryCheckoutExpired(sess) {
		uc.clearDeliveryCheckoutContext(sess)
		return "⏱️ A cotação da entrega expirou. Vamos recalcular o frete antes de continuar.", session.StateDeliveryReady, nil
	}
	answer := strings.ToLower(strings.TrimSpace(text))
	if answer == "0" || answer == "cancelar" {
		uc.clearDeliveryCheckoutContext(sess)
		return "Checkout de entrega cancelado.\n\n" + "Digite *0* para voltar ao menu principal.", session.StateMainMenu, nil
	}
	if answer == "1" || answer == "pagar" || answer == "continuar" {
		return "💳 O frete e o total foram congelados pelo checkout de entrega. Conclua o pagamento no checkout do restaurante; após a confirmação financeira, o checkout será confirmado com a mesma chave de segurança.", session.StateDeliveryCheckoutReview, nil
	}
	return uc.repeatDeliveryCheckoutReview(sess), session.StateDeliveryCheckoutReview, nil
}

func (uc *HandleWhatsAppMessageUseCase) repeatDeliveryCheckoutReview(sess *session.Session) string {
	fee := deliverySessionFloat(sess, deliveryCheckoutFeeKey)
	total := deliverySessionFloat(sess, deliveryCheckoutTotalKey)
	return fmt.Sprintf("🧾 Frete: R$ %.2f\n*Total: R$ %.2f*\n\nResponda *1* para seguir para o pagamento ou *0* para cancelar.", fee, total)
}

// ConfirmDeliveryPayment is called by the payment reconciliation boundary,
// never by a free-form customer message.
func (uc *HandleWhatsAppMessageUseCase) ConfirmDeliveryPayment(ctx context.Context, sess *session.Session, paymentReference string, deliveryID *uuid.UUID) error {
	if sess == nil || uc.deliveryCheckout == nil {
		return fmt.Errorf("delivery checkout is not configured")
	}
	if strings.TrimSpace(paymentReference) == "" {
		return fmt.Errorf("payment reference is required")
	}
	if deliveryCheckoutExpired(sess) {
		uc.clearDeliveryCheckoutContext(sess)
		return fmt.Errorf("delivery checkout is expired")
	}
	key := uc.getContextString(sess, deliveryCheckoutKeyKey)
	token := uc.getContextString(sess, deliveryCheckoutTokenKey)
	if key == "" || token == "" {
		return fmt.Errorf("delivery checkout confirmation data is missing")
	}
	batchID, batchErr := uuid.Parse(uc.getContextString(sess, deliveryOrderBatchKey))
	if batchErr != nil || batchID == uuid.Nil {
		return fmt.Errorf("delivery order batch is missing")
	}
	if uc.deliveryOrderBatch == nil {
		return fmt.Errorf("delivery order batch reconciliation is not configured")
	}
	eventID, eventErr := uuid.Parse(uc.getContextString(sess, deliveryPaymentEventKey))
	if eventErr != nil || eventID == uuid.Nil {
		eventID = uuid.New()
		sess.SetContext(deliveryPaymentEventKey, eventID.String())
	}
	// Reconcile first so the Delivery aggregate exists and the checkout can
	// retain its foreign key. Replaying the same event is safe on NestJS.
	reconciled, err := uc.deliveryOrderBatch.Reconcile(ctx, nodeadmin.DeliveryOrderBatchReconcileInput{
		TenantID: sess.TenantID,
		BatchID:  batchID,
		EventID:  eventID,
	})
	if err != nil {
		return err
	}
	if reconciled.DeliveryID == nil || *reconciled.DeliveryID == uuid.Nil {
		return fmt.Errorf("delivery is not available for payment confirmation: %s", strings.TrimSpace(reconciled.Reason))
	}
	if deliveryID == nil {
		deliveryID = reconciled.DeliveryID
	} else if *deliveryID != *reconciled.DeliveryID {
		return fmt.Errorf("delivery scope mismatch")
	}
	if _, err := uc.deliveryCheckout.Confirm(ctx, sess.TenantID, key, token, paymentReference, deliveryID); err != nil {
		return err
	}
	sess.SetContext(deliveryCheckoutPaidKey, true)
	return nil
}

// deliveryCheckoutExpired is intentionally fail-open when no expiry is in the
// session: payment reconciliation may run from a persisted webhook context
// that only has the opaque checkout key, and NestJS remains authoritative.
func deliveryCheckoutExpired(sess *session.Session) bool {
	if sess == nil {
		return true
	}
	value, ok := sess.GetContext(deliveryCheckoutExpiresKey)
	if !ok || value == nil {
		return false
	}
	raw := strings.TrimSpace(fmt.Sprint(value))
	if raw == "" {
		return false
	}
	expiresAt, err := time.Parse(time.RFC3339, raw)
	return err != nil || !expiresAt.After(time.Now())
}

func (uc *HandleWhatsAppMessageUseCase) clearDeliveryCheckoutContext(sess *session.Session) {
	if sess == nil || sess.Context == nil {
		return
	}
	for _, key := range []string{deliveryCheckoutKeyKey, deliveryCheckoutTokenKey, deliveryCheckoutFeeKey, deliveryCheckoutTotalKey, deliveryCheckoutExpiresKey, deliveryCheckoutModeKey, deliveryCheckoutPaidKey, deliveryOrderBatchKey, deliveryPaymentEventKey} {
		delete(sess.Context, key)
	}
}

func deliveryCartSubtotal(cart []orderingCartItem) (float64, error) {
	total := 0.0
	for _, item := range cart {
		price, err := strconv.ParseFloat(strings.TrimSpace(item.UnitPrice), 64)
		if err != nil || price < 0 || item.Quantity < 1 {
			return 0, fmt.Errorf("invalid cart item price")
		}
		total += price * float64(item.Quantity)
	}
	return math.Round(total*100) / 100, nil
}

func deliverySessionFloat(sess *session.Session, key string) float64 {
	if sess == nil {
		return 0
	}
	value, ok := sess.GetContext(key)
	if !ok || value == nil {
		return 0
	}
	parsed, _ := strconv.ParseFloat(strings.TrimSpace(fmt.Sprint(value)), 64)
	return parsed
}

func deliveryBatchSnapshot(draft map[string]interface{}, latitude, longitude float64) map[string]interface{} {
	snapshot := make(map[string]interface{}, len(draft)+5)
	for key, value := range draft {
		snapshot[key] = value
	}
	snapshot["destination_lat"] = latitude
	snapshot["destination_lng"] = longitude
	snapshot["address_confirmed"] = true
	return snapshot
}

func (uc *HandleWhatsAppMessageUseCase) getDeliveryDraft(sess *session.Session) map[string]interface{} {
	draft := make(map[string]interface{})
	if sess == nil {
		return draft
	}
	value, ok := sess.GetContext(deliveryAddressDraftKey)
	if !ok || value == nil {
		return draft
	}
	if typed, ok := value.(map[string]interface{}); ok {
		for key, value := range typed {
			draft[key] = value
		}
	}
	return draft
}

func (uc *HandleWhatsAppMessageUseCase) clearDeliveryAddressContext(sess *session.Session) {
	if sess == nil || sess.Context == nil {
		return
	}
	uc.clearDeliveryCheckoutContext(sess)
	for _, key := range []string{deliveryCustomerIDKey, deliveryAddressIDsKey, deliverySelectedAddressKey, deliveryAddressDraftKey, deliveryAddressReadyKey, deliveryAddressNewKey, deliveryAddressPostalKey, deliveryAddressConsentKey, deliveryAddressDeleteKey, deliveryAddressEditKey} {
		delete(sess.Context, key)
	}
}

func deliveryAddressToDraft(address nodeadmin.DeliveryAddress) map[string]interface{} {
	draft := map[string]interface{}{
		"label": address.Label, "postal_code": address.PostalCode, "street": address.Street,
		"address_number": address.AddressNumber, "neighborhood": address.Neighborhood,
		"city": address.City, "state": address.State, "formatted_address": address.FormattedAddress,
		"latitude": address.Latitude, "longitude": address.Longitude,
	}
	if address.AddressComplement != nil {
		draft["address_complement"] = *address.AddressComplement
	}
	if address.AddressReference != nil {
		draft["address_reference"] = *address.AddressReference
	}
	return draft
}

func deliveryGeocodeInput(draft map[string]interface{}) nodeadmin.GeocodeDeliveryAddressInput {
	return nodeadmin.GeocodeDeliveryAddressInput{
		Street:            deliveryDraftString(draft, "street"),
		AddressNumber:     deliveryDraftString(draft, "address_number"),
		AddressComplement: deliveryDraftString(draft, "address_complement"),
		Neighborhood:      deliveryDraftString(draft, "neighborhood"),
		City:              deliveryDraftString(draft, "city"),
		State:             deliveryDraftString(draft, "state"),
		PostalCode:        deliveryDraftString(draft, "postal_code"),
	}
}

func deliveryCreateAddressInput(draft map[string]interface{}) nodeadmin.CreateDeliveryAddressInput {
	latitude, _ := deliveryDraftFloat(draft, "latitude")
	longitude, _ := deliveryDraftFloat(draft, "longitude")
	return nodeadmin.CreateDeliveryAddressInput{
		Label: deliveryDraftString(draft, "label"), PostalCode: deliveryDraftString(draft, "postal_code"),
		Street: deliveryDraftString(draft, "street"), AddressNumber: deliveryDraftString(draft, "address_number"),
		AddressComplement: deliveryDraftString(draft, "address_complement"), Neighborhood: deliveryDraftString(draft, "neighborhood"),
		City: deliveryDraftString(draft, "city"), State: deliveryDraftString(draft, "state"),
		AddressReference: deliveryDraftString(draft, "address_reference"), Latitude: &latitude, Longitude: &longitude,
		PostalCodeProvider: deliveryDraftString(draft, "postal_code_provider"), PostalCodeLookupStatus: deliveryDraftString(draft, "postal_code_lookup_status"),
		GeocodeProvider: deliveryDraftString(draft, "geocode_provider"), GeocodeProviderID: deliveryDraftString(draft, "geocode_provider_id"),
		GeocodeQuality: deliveryDraftString(draft, "geocode_quality"), Confirmed: true,
	}
}

func deliveryUpdateAddressInput(draft map[string]interface{}) nodeadmin.UpdateDeliveryAddressInput {
	latitude, latitudeOK := deliveryDraftFloat(draft, "latitude")
	longitude, longitudeOK := deliveryDraftFloat(draft, "longitude")
	confirmed := true
	input := nodeadmin.UpdateDeliveryAddressInput{
		Label: ptrString(deliveryDraftString(draft, "label")), PostalCode: ptrString(deliveryDraftString(draft, "postal_code")),
		Street: ptrString(deliveryDraftString(draft, "street")), AddressNumber: ptrString(deliveryDraftString(draft, "address_number")),
		AddressComplement: ptrString(deliveryDraftString(draft, "address_complement")), Neighborhood: ptrString(deliveryDraftString(draft, "neighborhood")),
		City: ptrString(deliveryDraftString(draft, "city")), State: ptrString(deliveryDraftString(draft, "state")),
		AddressReference: ptrString(deliveryDraftString(draft, "address_reference")), Confirmed: &confirmed,
	}
	if latitudeOK {
		input.Latitude = &latitude
	}
	if longitudeOK {
		input.Longitude = &longitude
	}
	return input
}

func ptrString(value string) *string {
	return &value
}

func deliveryDraftString(draft map[string]interface{}, key string) string {
	if value, ok := draft[key]; ok && value != nil {
		return strings.TrimSpace(fmt.Sprint(value))
	}
	return ""
}

func deliveryDraftFloat(draft map[string]interface{}, key string) (float64, bool) {
	value, ok := draft[key]
	if !ok || value == nil {
		return 0, false
	}
	switch typed := value.(type) {
	case *float64:
		if typed == nil {
			return 0, false
		}
		return *typed, true
	case *float32:
		if typed == nil {
			return 0, false
		}
		return float64(*typed), true
	case float64:
		return typed, true
	case float32:
		return float64(typed), true
	case int:
		return float64(typed), true
	default:
		parsed, err := strconv.ParseFloat(strings.TrimSpace(fmt.Sprint(value)), 64)
		return parsed, err == nil
	}
}

func optionalDeliveryValue(value string) string {
	value = strings.TrimSpace(value)
	if value == "-" || strings.EqualFold(value, "pular") || strings.EqualFold(value, "não") || strings.EqualFold(value, "nao") {
		return ""
	}
	return value
}

func optionalStringPointer(value *string) string {
	if value == nil {
		return ""
	}
	return strings.TrimSpace(*value)
}

func deliveryPostalCodePrompt() string { return deliveryPostalCodePromptText }

const deliveryPostalCodePromptText = "Você pode digitar o CEP com ou sem máscara."

func formatDeliveryAddressSelection(addresses []nodeadmin.DeliveryAddress) string {
	lines := []string{"📍 Escolha o endereço de entrega:"}
	for index, address := range addresses {
		label := strings.TrimSpace(address.Label)
		if label == "" {
			label = "Endereço"
		}
		summary := strings.TrimSpace(address.FormattedAddress)
		if summary == "" {
			summary = strings.TrimSpace(fmt.Sprintf("%s, %s - %s/%s", address.Street, address.AddressNumber, address.City, address.State))
		}
		lines = append(lines, fmt.Sprintf("*%d* - %s\n%s", index+1, label, summary))
	}
	lines = append(lines, "*novo* - Cadastrar outro endereço", "Para editar, digite *editar N*. Para excluir, digite *excluir N*.", "\n"+deliveryPostalCodePrompt())
	return strings.Join(lines, "\n\n")
}

func formatDeliveryAddressSelectionPrompt() string {
	return "Escolha o número de um endereço da lista ou digite *novo* para cadastrar outro.\n\n" + deliveryPostalCodePrompt()
}

func formatDeliveryDraft(draft map[string]interface{}) string {
	formatted := deliveryDraftString(draft, "formatted_address")
	if formatted != "" {
		return formatted
	}
	parts := []string{deliveryDraftString(draft, "street") + ", " + deliveryDraftString(draft, "address_number")}
	if complement := deliveryDraftString(draft, "address_complement"); complement != "" {
		parts = append(parts, complement)
	}
	parts = append(parts, deliveryDraftString(draft, "neighborhood"), deliveryDraftString(draft, "city")+"/"+deliveryDraftString(draft, "state"), "CEP "+deliveryDraftString(draft, "postal_code"))
	return strings.Join(parts, " - ")
}
