package application

import (
	"context"
	"strings"
	"testing"

	"github.com/google/uuid"

	"github.com/anbernal/clickgarcom/internal/domain/tenant"
	"go.uber.org/zap"
)

func TestIsAppointmentStartChoiceAcceptsWhatsAppVisibleReplyTitle(t *testing.T) {
	cases := []string{
		"agenda:start",
		"Agendar horário",
		"📅 Agendar horário",
		"  📅   agendar   horario  ",
	}

	for _, input := range cases {
		if !isAppointmentStartChoice(input) {
			t.Fatalf("expected %q to start appointment flow", input)
		}
	}
}

func TestIsAppointmentStartChoiceRejectsUnrelatedInput(t *testing.T) {
	if isAppointmentStartChoice("fazer pedido") {
		t.Fatal("unrelated input must not start appointment flow")
	}
}

type appointmentAccessGatewayForTest struct{}

func (appointmentAccessGatewayForTest) Create(_ context.Context, _ uuid.UUID, _ string) (string, string, error) {
	return "anderson-restaurant", "appointment-capability", nil
}

func TestAppointmentsOnlyWelcomeSendsOneMenuAndOneLinkPerClick(t *testing.T) {
	ctx := context.Background()
	tenantID := uuid.New()
	phone := "5511975062841"
	attendanceEnabled := false
	tenantObj := testTenant(tenantID)
	tenantObj.IsOpen = true
	tenantObj.Settings.Attendance.Enabled = &attendanceEnabled
	tenantObj.Settings.Appointments = tenant.AppointmentSettings{Enabled: true, Permanent: true}

	sessionRepo := newTestSessionRepo()
	sender := &testExternalURLSender{}
	uc := NewHandleWhatsAppMessageUseCase(
		sessionRepo,
		&testTenantRepo{tenant: tenantObj},
		nil, nil, nil, nil, nil, nil, nil,
		sender,
		"https://example.test",
		zap.NewNop(),
	)
	uc.SetAppointmentAccessGateway(appointmentAccessGatewayForTest{})

	if err := uc.Execute(ctx, HandleMessageInput{From: phone, Text: "olá", TenantID: tenantID}); err != nil {
		t.Fatalf("appointment welcome failed: %v", err)
	}
	if len(sender.interactiveMessages) != 1 {
		t.Fatalf("expected one appointment-only welcome, got %d messages", len(sender.interactiveMessages))
	}
	if body := sender.interactiveMessages[0].Body; strings.Contains(body, "nenhum canal de pedidos") {
		t.Fatalf("appointment-only welcome must not mention inactive order channels: %q", body)
	}

	if err := uc.Execute(ctx, HandleMessageInput{From: phone, Text: "📅 Agendar horário", TenantID: tenantID}); err != nil {
		t.Fatalf("appointment link request failed: %v", err)
	}
	if len(sender.urlMessages) != 1 || !strings.Contains(sender.urlMessages[0].URL, "/agendar/anderson-restaurant#access=appointment-capability") {
		t.Fatalf("expected one appointment URL, got %+v", sender.urlMessages)
	}
	if len(sender.interactiveMessages) != 1 {
		t.Fatalf("must not send a second welcome menu after the URL, got %d interactive messages", len(sender.interactiveMessages))
	}
}
