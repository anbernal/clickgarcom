package application

import (
	"testing"

	"github.com/golang-jwt/jwt/v5"
)

func TestBuildCheckoutAccessTokenDoesNotRequirePhone(t *testing.T) {
	t.Setenv("JWT_SECRET", "checkout-test-secret")

	token, ttl, err := buildCheckoutAccessToken("tab-test", "")
	if err != nil {
		t.Fatalf("buildCheckoutAccessToken() error = %v", err)
	}
	if ttl <= 0 {
		t.Fatalf("buildCheckoutAccessToken() ttl = %s, want positive ttl", ttl)
	}

	claims := &checkoutAccessClaims{}
	parsed, err := jwt.ParseWithClaims(token, claims, func(_ *jwt.Token) (interface{}, error) {
		return []byte("checkout-test-secret"), nil
	})
	if err != nil || !parsed.Valid {
		t.Fatalf("signed checkout token was not valid: parsed=%v err=%v", parsed.Valid, err)
	}
	if claims.OwnerPhone != "" {
		t.Fatalf("checkout token unexpectedly contains owner phone %q", claims.OwnerPhone)
	}
	if claims.DeliveryCheckoutKey != "" {
		t.Fatalf("generic checkout token unexpectedly contains delivery key %q", claims.DeliveryCheckoutKey)
	}
}

func TestBuildDeliveryCheckoutAccessTokenBindsFrozenCheckoutKey(t *testing.T) {
	t.Setenv("JWT_SECRET", "checkout-test-secret")

	token, _, err := buildCheckoutAccessTokenWithDelivery("tab-test", "", "delivery-checkout-key")
	if err != nil {
		t.Fatalf("buildCheckoutAccessTokenWithDelivery() error = %v", err)
	}

	claims := &checkoutAccessClaims{}
	parsed, err := jwt.ParseWithClaims(token, claims, func(_ *jwt.Token) (interface{}, error) {
		return []byte("checkout-test-secret"), nil
	})
	if err != nil || !parsed.Valid {
		t.Fatalf("signed delivery checkout token was not valid: parsed=%v err=%v", parsed.Valid, err)
	}
	if claims.DeliveryCheckoutKey != "delivery-checkout-key" {
		t.Fatalf("delivery checkout key = %q, want frozen key", claims.DeliveryCheckoutKey)
	}
}

func TestBuildDeliveryPublicCheckoutURLUsesTheSignedToken(t *testing.T) {
	got := buildDeliveryPublicCheckoutURL(
		"https://clickgarcom.example/",
		"tab-test",
		"signed-token",
		"delivery-checkout-key",
	)
	const want = "https://clickgarcom.example/checkout.html?access_token=signed-token&tab_id=tab-test"
	if got != want {
		t.Fatalf("buildDeliveryPublicCheckoutURL() = %q, want %q", got, want)
	}
}

func TestBuildPublicExitURLs(t *testing.T) {
	baseURL := "https://clickgarcom.example"
	tabID := "tab-test"
	accessToken := "signed-token"

	if got := buildPublicExitURL(baseURL, tabID, accessToken); got != "https://clickgarcom.example/exit.html#access_token=signed-token&tab_id=tab-test" {
		t.Fatalf("buildPublicExitURL() = %q", got)
	}
	if got := buildPublicExitQRCodeURL(baseURL, tabID, accessToken); got != "https://clickgarcom.example/api/exit/tab-test/qr.png?access_token=signed-token" {
		t.Fatalf("buildPublicExitQRCodeURL() = %q", got)
	}
}
