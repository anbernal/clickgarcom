package whatsapp

import "testing"

func TestNormalizeWhatsAppImageURLForUnsplashForcesJPG(t *testing.T) {
	input := "https://images.unsplash.com/photo-1550547660-d9450f859349?auto=format&fit=crop&w=1200&q=80"

	got := normalizeWhatsAppImageURL(input)

	want := "https://images.unsplash.com/photo-1550547660-d9450f859349?fit=crop&fm=jpg&q=80&w=1200"
	if got != want {
		t.Fatalf("expected %q, got %q", want, got)
	}
}

func TestNormalizeWhatsAppImageURLKeepsUnknownHosts(t *testing.T) {
	input := "https://cdn.example.com/menu/item.png?fit=crop&w=1200"

	got := normalizeWhatsAppImageURL(input)

	if got != input {
		t.Fatalf("expected URL to stay unchanged, got %q", got)
	}
}
