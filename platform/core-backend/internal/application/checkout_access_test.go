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
}
