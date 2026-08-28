package application

import "testing"

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
