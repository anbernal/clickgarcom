package application

import (
	"context"
	"fmt"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"
	"go.uber.org/zap"

	"github.com/anbernal/clickgarcom/internal/domain/inbox/session"
	"github.com/anbernal/clickgarcom/internal/domain/tab"
	"github.com/anbernal/clickgarcom/internal/infrastructure/nodeadmin"
)

type fakeDeliveryOrderBatchGateway struct {
	input nodeadmin.DeliveryOrderBatchReconcileInput
	resp  nodeadmin.DeliveryOrderBatchReconcileResponse
}

func (f *fakeDeliveryOrderBatchGateway) Reconcile(_ context.Context, input nodeadmin.DeliveryOrderBatchReconcileInput) (nodeadmin.DeliveryOrderBatchReconcileResponse, error) {
	f.input = input
	return f.resp, nil
}

type fakeDeliveryCustomerGateway struct {
	customer  nodeadmin.DeliveryCustomer
	addresses []nodeadmin.DeliveryAddress
	lookup    nodeadmin.PostalCodeLookupResult
	created   nodeadmin.CreateDeliveryAddressInput
	deleted   uuid.UUID
	updated   uuid.UUID
}

func (f *fakeDeliveryCustomerGateway) Resolve(_ context.Context, _ nodeadmin.ResolveDeliveryCustomerInput) (nodeadmin.DeliveryCustomer, error) {
	return f.customer, nil
}
func (f *fakeDeliveryCustomerGateway) ListAddresses(_ context.Context, _, _ uuid.UUID) ([]nodeadmin.DeliveryAddress, error) {
	return append([]nodeadmin.DeliveryAddress(nil), f.addresses...), nil
}
func (f *fakeDeliveryCustomerGateway) CreateAddress(_ context.Context, _ uuid.UUID, _ uuid.UUID, input nodeadmin.CreateDeliveryAddressInput) (nodeadmin.DeliveryAddress, error) {
	f.created = input
	return nodeadmin.DeliveryAddress{ID: uuid.New(), FormattedAddress: "Rua A, 10 - Centro, São Paulo/SP"}, nil
}
func (f *fakeDeliveryCustomerGateway) UpdateAddress(_ context.Context, _ uuid.UUID, _, _ uuid.UUID, _ nodeadmin.UpdateDeliveryAddressInput) (nodeadmin.DeliveryAddress, error) {
	f.updated = uuid.New()
	return nodeadmin.DeliveryAddress{ID: f.updated, FormattedAddress: "Rua A, 11 - Centro, São Paulo/SP"}, nil
}

func (f *fakeDeliveryCustomerGateway) DeleteAddress(_ context.Context, _ uuid.UUID, _, addressID uuid.UUID) error {
	f.deleted = addressID
	return nil
}
func (f *fakeDeliveryCustomerGateway) LookupPostalCode(_ context.Context, _ uuid.UUID, _ string) (nodeadmin.PostalCodeLookupResult, error) {
	return f.lookup, nil
}
func (f *fakeDeliveryCustomerGateway) Geocode(_ context.Context, _ uuid.UUID, _ nodeadmin.GeocodeDeliveryAddressInput) (nodeadmin.GeocodeDeliveryAddressResult, error) {
	providerID := "fake-place"
	return nodeadmin.GeocodeDeliveryAddressResult{Latitude: -23.55, Longitude: -46.63, GeocodeProvider: "fake", GeocodeProviderID: &providerID, GeocodeQuality: "ROOFTOP"}, nil
}

func TestStartDeliveryAddressFlowListsSavedAddressesAndRejectsUnknownSelection(t *testing.T) {
	tenantID, customerID, addressID := uuid.New(), uuid.New(), uuid.New()
	fake := &fakeDeliveryCustomerGateway{
		customer:  nodeadmin.DeliveryCustomer{ID: customerID},
		addresses: []nodeadmin.DeliveryAddress{{ID: addressID, Label: "Casa", Street: "Rua A", AddressNumber: "10", City: "São Paulo", State: "SP", FormattedAddress: "Rua A, 10 - São Paulo/SP"}},
	}
	uc := &HandleWhatsAppMessageUseCase{deliveryCustomer: fake, logger: zap.NewNop()}
	sess := session.NewSession("5511999999999", tenantID)
	_, state, err := uc.StartDeliveryAddressFlow(context.Background(), sess)
	if err != nil || state != session.StateDeliveryAddressSelection {
		t.Fatalf("expected address selection, state=%s err=%v", state, err)
	}
	_, state, err = uc.handleDeliveryAddressSelection(context.Background(), sess, "99")
	if err != nil || state != session.StateDeliveryAddressSelection {
		t.Fatalf("unknown address must remain in selection, state=%s err=%v", state, err)
	}
	_, state, err = uc.handleDeliveryAddressSelection(context.Background(), sess, "1")
	if err != nil || state != session.StateDeliveryAddressConfirmation {
		t.Fatalf("expected selected address confirmation, state=%s err=%v", state, err)
	}
	if got := uc.getContextString(sess, deliverySelectedAddressKey); got != addressID.String() {
		t.Fatalf("unexpected selected address %q", got)
	}
	if _, _, err = uc.StartDeliveryAddressFlow(context.Background(), sess); err != nil {
		t.Fatalf("failed to refresh address list: %v", err)
	}
	if _, state, err = uc.handleDeliveryAddressSelection(context.Background(), sess, "excluir 1"); err != nil || state != session.StateDeliveryAddressDelete {
		t.Fatalf("expected delete confirmation, state=%s err=%v", state, err)
	}
	if _, state, err = uc.handleDeliveryAddressDelete(context.Background(), sess, "sim"); err != nil || state != session.StateDeliveryAddressSelection {
		t.Fatalf("expected refreshed list after delete, state=%s err=%v", state, err)
	}
	if fake.deleted != addressID {
		t.Fatalf("expected selected address to be deleted, got %s", fake.deleted)
	}
}

func TestDeliveryAddressFlowRequiresConsentBeforeSaving(t *testing.T) {
	tenantID, customerID := uuid.New(), uuid.New()
	fake := &fakeDeliveryCustomerGateway{
		customer: nodeadmin.DeliveryCustomer{ID: customerID},
		lookup:   nodeadmin.PostalCodeLookupResult{PostalCode: "01311000", Street: "Rua A", Neighborhood: "Centro", City: "São Paulo", State: "SP", Provider: "fake", Status: "FOUND"},
	}
	uc := &HandleWhatsAppMessageUseCase{deliveryCustomer: fake, logger: zap.NewNop()}
	sess := session.NewSession("5511999999999", tenantID)
	_, state, err := uc.StartDeliveryAddressFlow(context.Background(), sess)
	if err != nil || state != session.StateDeliveryPostalCode {
		t.Fatalf("new customer should start at CEP, state=%s err=%v", state, err)
	}
	if _, state, err = uc.handleDeliveryPostalCode(context.Background(), sess, "01311-000"); err != nil || state != session.StateDeliveryAddressNumber {
		t.Fatalf("CEP should advance to number, state=%s err=%v", state, err)
	}
	inputs := []struct {
		state session.ConversationState
		text  string
	}{
		{session.StateDeliveryAddressNumber, "10"},
		{session.StateDeliveryAddressComplement, "pular"},
		{session.StateDeliveryAddressReference, "pular"},
		{session.StateDeliveryAddressLabel, "Casa"},
	}
	for _, item := range inputs {
		input, expected := item.state, item.text
		if sess.State != input {
			t.Fatalf("expected state %s before input, got %s", input, sess.State)
		}
		_, _, err = uc.handleDeliveryDraftField(context.Background(), sess, expected)
		if err != nil {
			t.Fatalf("draft input %q failed: %v", expected, err)
		}
	}
	if sess.State != session.StateDeliveryAddressConfirmation {
		t.Fatalf("expected confirmation state, got %s", sess.State)
	}
	if _, state, err = uc.handleDeliveryAddressConfirmation(context.Background(), sess, "sim"); err != nil || state != session.StateDeliveryAddressConsent {
		t.Fatalf("expected consent state, state=%s err=%v", state, err)
	}
	if _, state, err = uc.handleDeliveryAddressConsent(context.Background(), sess, "não"); err != nil || state != session.StateDeliveryAddressConsent {
		t.Fatalf("unsaved address must not proceed, state=%s err=%v", state, err)
	}
	if _, state, err = uc.handleDeliveryAddressConsent(context.Background(), sess, "sim"); err != nil || state != session.StateDeliveryReady {
		t.Fatalf("expected ready state after consent, state=%s err=%v", state, err)
	}
	if fake.created.Confirmed != true || fake.created.PostalCode != "01311000" {
		t.Fatalf("expected confirmed normalized address, got %+v", fake.created)
	}
}

func TestDeliveryAddressNumberRejectsSecondPostalCode(t *testing.T) {
	tenantID, customerID := uuid.New(), uuid.New()
	fake := &fakeDeliveryCustomerGateway{
		customer: nodeadmin.DeliveryCustomer{ID: customerID},
		lookup: nodeadmin.PostalCodeLookupResult{
			PostalCode: "06162280", Street: "Rua Achiles Beline", Neighborhood: "Padroeira",
			City: "Osasco", State: "SP", Provider: "VIACEP", Status: "FOUND",
		},
	}
	uc := &HandleWhatsAppMessageUseCase{deliveryCustomer: fake, logger: zap.NewNop()}
	sess := session.NewSession("5511999999999", tenantID)
	if _, state, err := uc.StartDeliveryAddressFlow(context.Background(), sess); err != nil || state != session.StateDeliveryPostalCode {
		t.Fatalf("expected postal code state, got state=%s err=%v", state, err)
	}
	message, state, err := uc.handleDeliveryPostalCode(context.Background(), sess, "06162280")
	if err != nil || state != session.StateDeliveryAddressNumber {
		t.Fatalf("expected address number state, got state=%s err=%v", state, err)
	}
	if !strings.Contains(message, "Rua Achiles Beline") || !strings.Contains(message, "Não digite o CEP novamente") {
		t.Fatalf("expected clear street and number prompt, got %q", message)
	}
	message, state, err = uc.handleDeliveryDraftField(context.Background(), sess, "06124060")
	if err != nil || state != session.StateDeliveryAddressNumber {
		t.Fatalf("second postal code must keep number state, got state=%s err=%v", state, err)
	}
	if !strings.Contains(message, "parece ser outro CEP") || uc.getDeliveryDraft(sess)["address_number"] != nil {
		t.Fatalf("expected second postal code rejection without saving number, got message=%q draft=%v", message, uc.getDeliveryDraft(sess))
	}
}

func TestNormalizeCustomerAddressGeocodeQuality(t *testing.T) {
	cases := map[string]string{
		"ROOFTOP":      "ROOFTOP",
		"RANGE":        "RANGE_INTERPOLATED",
		"INTERPOLATED": "RANGE_INTERPOLATED",
		"AMBIGUOUS":    "APPROXIMATE",
		"unknown":      "APPROXIMATE",
	}
	for input, expected := range cases {
		if got := normalizeCustomerAddressGeocodeQuality(input); got != expected {
			t.Fatalf("quality %q: got %q, want %q", input, got, expected)
		}
	}
}

func TestStartDeliveryCheckoutUsesCartAndAuthoritativeFreight(t *testing.T) {
	tenantID, customerID, addressID := uuid.New(), uuid.New(), uuid.New()
	checkoutKey := "wa-checkout-test"
	token := "opaque-token"
	checkoutGateway := &fakeDeliveryCheckoutGateway{create: nodeadmin.DeliveryCheckoutResponse{
		TenantID: tenantID, CheckoutKey: checkoutKey, CustomerID: customerID, CustomerAddressID: addressID,
		FulfillmentMode: "OWN", Status: "PENDING_PAYMENT", OrderTotal: 20, CustomerDeliveryFee: 9.5,
		TotalAmount: 29.5, Currency: "BRL", ExpiresAt: time.Now().Add(10 * time.Minute), ConfirmationToken: &token,
	}}
	uc := &HandleWhatsAppMessageUseCase{
		deliveryCheckout: NewDeliveryCheckoutCoordinator(checkoutGateway, zap.NewNop()),
		logger:           zap.NewNop(),
	}
	sess := session.NewSession("5511999999999", tenantID)
	sess.SetContext(deliveryCustomerIDKey, customerID.String())
	sess.SetContext(deliverySelectedAddressKey, addressID.String())
	sess.SetContext(deliveryAddressReadyKey, true)
	sess.SetContext(deliveryCheckoutKeyKey, checkoutKey)
	sess.SetContext(deliveryOrderBatchKey, uuid.New().String())
	sess.SetContext(deliveryAddressDraftKey, map[string]interface{}{"latitude": -23.55, "longitude": -46.63, "street": "Rua A", "address_number": "10", "city": "São Paulo", "state": "SP", "postal_code": "01311000"})
	sess.SetContext(orderingCartKey, []orderingCartItem{{LineID: "line-1", Quantity: 2, UnitPrice: "10.00", MenuItemName: "Prato"}})

	message, state, err := uc.StartDeliveryCheckout(context.Background(), sess)
	if err != nil || state != session.StateDeliveryCheckoutReview {
		t.Fatalf("expected checkout review, state=%s err=%v message=%s", state, err, message)
	}
	if checkoutGateway.created.OrderTotal != 20 || checkoutGateway.created.CustomerAddressID != addressID {
		t.Fatalf("unexpected checkout input: %+v", checkoutGateway.created)
	}
	if got := deliverySessionFloat(sess, deliveryCheckoutFeeKey); got != 9.5 {
		t.Fatalf("expected authoritative fee 9.5, got %v", got)
	}
}

func TestConfirmDeliveryPaymentReconcilesBatchBeforeConfirmingCheckout(t *testing.T) {
	tenantID, batchID, deliveryID := uuid.New(), uuid.New(), uuid.New()
	checkoutKey := "wa-paid-checkout"
	token := "opaque-token"
	paymentReference := "provider-payment-1"
	checkoutGateway := &fakeDeliveryCheckoutGateway{confirm: nodeadmin.DeliveryCheckoutResponse{
		TenantID: tenantID, CheckoutKey: checkoutKey, Status: "PAID", PaymentReference: &paymentReference,
	}}
	batchGateway := &fakeDeliveryOrderBatchGateway{resp: nodeadmin.DeliveryOrderBatchReconcileResponse{BatchID: batchID, DeliveryID: &deliveryID}}
	uc := &HandleWhatsAppMessageUseCase{
		deliveryCheckout:   NewDeliveryCheckoutCoordinator(checkoutGateway, zap.NewNop()),
		deliveryOrderBatch: batchGateway,
		logger:             zap.NewNop(),
	}
	sess := session.NewSession("5511999999999", tenantID)
	sess.SetContext(deliveryCheckoutKeyKey, checkoutKey)
	sess.SetContext(deliveryCheckoutTokenKey, token)
	sess.SetContext(deliveryOrderBatchKey, batchID.String())

	if err := uc.ConfirmDeliveryPayment(context.Background(), sess, paymentReference, nil); err != nil {
		t.Fatalf("expected payment confirmation, got %v", err)
	}
	if batchGateway.input.TenantID != tenantID || batchGateway.input.BatchID != batchID || batchGateway.input.EventID == uuid.Nil {
		t.Fatalf("expected tenant-scoped idempotent reconciliation input, got %+v", batchGateway.input)
	}
	if got := uc.getContextString(sess, deliveryPaymentEventKey); got == "" {
		t.Fatal("expected payment event id to be persisted for retries")
	}
	if uc.getContextString(sess, deliveryCheckoutPaidKey) != "true" {
		t.Fatal("expected checkout to be marked paid only after confirmation")
	}
}

func TestExpiredDeliveryCheckoutClearsSessionBeforePayment(t *testing.T) {
	tenantID := uuid.New()
	uc := &HandleWhatsAppMessageUseCase{logger: zap.NewNop()}
	sess := session.NewSession("5511999999999", tenantID)
	sess.SetContext(deliveryCheckoutKeyKey, "wa-expired")
	sess.SetContext(deliveryCheckoutTokenKey, "opaque-token")
	sess.SetContext(deliveryCheckoutExpiresKey, time.Now().Add(-time.Minute).UTC().Format(time.RFC3339))

	message, state, err := uc.handleDeliveryCheckoutReview(context.Background(), sess, "1")
	if err != nil || state != session.StateDeliveryReady {
		t.Fatalf("expected expired checkout to return to ready, state=%s err=%v", state, err)
	}
	if !strings.Contains(message, "expirou") {
		t.Fatalf("expected expiry guidance, got %q", message)
	}
	if _, ok := sess.GetContext(deliveryCheckoutKeyKey); ok {
		t.Fatal("expected expired checkout key to be cleared")
	}
	if retryKey, ok := sess.GetContext(deliveryCheckoutRetryKeyKey); !ok || strings.TrimSpace(fmt.Sprint(retryKey)) == "" {
		t.Fatal("expected expired checkout to retain a retry nonce")
	}
}

func TestDeliveryCheckoutReviewRequiresConfirmationBeforeCancellation(t *testing.T) {
	tenantID := uuid.New()
	uc := &HandleWhatsAppMessageUseCase{logger: zap.NewNop()}
	sess := session.NewSession("5511999999999", tenantID)
	sess.SetContext(deliveryCheckoutKeyKey, "wa-pending")
	sess.SetContext(deliveryCheckoutExpiresKey, time.Now().Add(time.Hour).UTC().Format(time.RFC3339))

	message, state, err := uc.handleDeliveryCheckoutReview(context.Background(), sess, deliveryCancelOrderActionID)
	if err != nil || state != session.StateDeliveryCheckoutReview || !strings.Contains(message, "Deseja cancelar") {
		t.Fatalf("expected cancellation confirmation, state=%s message=%q err=%v", state, message, err)
	}
	if uc.getContextString(sess, deliveryCheckoutCancelConfirmationKey) != "true" {
		t.Fatal("expected cancellation confirmation context")
	}

	message, state, err = uc.handleDeliveryCheckoutReview(context.Background(), sess, deliveryKeepOrderActionID)
	if err != nil || state != session.StateDeliveryCheckoutReview || !strings.Contains(message, "Abrir pagamento") {
		t.Fatalf("expected pending order to remain after keeping it, state=%s message=%q err=%v", state, message, err)
	}
	if uc.getContextString(sess, deliveryCheckoutCancelConfirmationKey) != "" {
		t.Fatal("expected cancellation confirmation context to be cleared")
	}

	buttons := uc.deliveryPromptButtons(session.StateDeliveryCheckoutReview, sess)
	if len(buttons) != 2 || buttons[0].Reply.ID != deliveryPaymentLinkActionID || buttons[1].Reply.ID != deliveryCancelOrderActionID {
		t.Fatalf("expected payment-link and cancellation actions, got %+v", buttons)
	}

	_, state, err = uc.handleDeliveryCheckoutReview(context.Background(), sess, deliveryCancelOrderActionID)
	if err != nil || state != session.StateDeliveryCheckoutReview {
		t.Fatalf("expected confirmation before final cancellation, state=%s err=%v", state, err)
	}
	message, state, err = uc.handleDeliveryCheckoutReview(context.Background(), sess, deliveryConfirmCancelOrderActionID)
	if err != nil || state != session.StateDeliveryMenu || !strings.Contains(message, "Pedido de entrega cancelado") {
		t.Fatalf("expected confirmed cancellation to return to delivery menu, state=%s message=%q err=%v", state, message, err)
	}
}

func TestFindDeliveryOpenTabDoesNotReuseAnotherDeliveryJourney(t *testing.T) {
	tenantID := uuid.New()
	phone := "5511999999999"
	oldTab := &tab.Tab{
		ID:             uuid.New(),
		TenantID:       tenantID,
		UserPhone:      phone,
		Status:         tab.StatusOpen,
		OpeningChannel: "WHATSAPP_DELIVERY",
	}
	uc := &HandleWhatsAppMessageUseCase{
		tabRepo: &testTabRepo{byID: map[uuid.UUID]*tab.Tab{oldTab.ID: oldTab}},
	}
	sess := session.NewSession(phone, tenantID)

	if got := uc.findDeliveryOpenTab(context.Background(), sess); got != nil {
		t.Fatalf("delivery tab from a prior journey must not be discovered, got %s", got.ID)
	}

	sess.SetContext(deliveryTabIDKey, oldTab.ID.String())
	if got := uc.findDeliveryOpenTab(context.Background(), sess); got == nil || got.ID != oldTab.ID {
		t.Fatalf("current journey delivery tab should remain available, got %+v", got)
	}
}
