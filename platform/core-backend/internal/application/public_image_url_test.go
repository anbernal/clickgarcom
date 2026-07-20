package application

import "testing"

func TestResolvePublicImageURLKeepsAbsoluteURL(t *testing.T) {
	uc := &HandleWhatsAppMessageUseCase{publicCheckoutBaseURL: "https://public.example"}

	got := uc.resolvePublicImageURL("https://cdn.example/menu.jpg")
	if got != "https://cdn.example/menu.jpg" {
		t.Fatalf("expected absolute URL to remain unchanged, got %q", got)
	}
}

func TestResolvePublicImageURLPrefixesRelativeAsset(t *testing.T) {
	uc := &HandleWhatsAppMessageUseCase{publicCheckoutBaseURL: "https://public.example/"}

	got := uc.resolvePublicImageURL("/assets/demo-menu/burgers.jpg")
	want := "https://public.example/assets/demo-menu/burgers.jpg"
	if got != want {
		t.Fatalf("expected %q, got %q", want, got)
	}
}
