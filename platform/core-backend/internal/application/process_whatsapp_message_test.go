package application

import "testing"

func TestExtractSupportedInputFromInteractiveListReply(t *testing.T) {
	msg := WhatsAppInboundMessage{Type: "interactive"}
	msg.Interactive.Type = "list_reply"
	msg.Interactive.ListReply.ID = "4"

	got := extractSupportedInput(msg)
	if got != "4" {
		t.Fatalf("expected list reply id %q, got %q", "4", got)
	}

	if isUnsupportedNonTextMessage(msg) {
		t.Fatal("expected list reply to be treated as supported input")
	}
}
