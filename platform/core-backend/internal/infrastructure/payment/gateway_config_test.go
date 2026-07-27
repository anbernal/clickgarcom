package payment

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"encoding/base64"
	"testing"

	domainPayment "github.com/anbernal/clickgarcom/internal/domain/payment"
	"github.com/anbernal/clickgarcom/internal/domain/tenant"
)

func TestResolveTenantGatewaySupportsEncryptedMercadoPagoConfiguration(t *testing.T) {
	key := make([]byte, 32)
	if _, err := rand.Read(key); err != nil {
		t.Fatal(err)
	}
	t.Setenv("PAYMENT_GATEWAY_ENCRYPTION_KEY", base64.RawStdEncoding.EncodeToString(key))

	config, err := ResolveTenantGateway(tenant.TenantSettings{PaymentGateway: tenant.PaymentGatewaySettings{
		Provider: "MERCADO_PAGO", Enabled: true, Environment: "TEST", PublicKey: "TEST-public", AccessTokenEncrypted: encryptGatewayToken(t, key, "TEST-token"),
	}})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if config.Provider != domainPayment.ProviderMercadoPago || config.AccessToken != "TEST-token" || config.Legacy {
		t.Fatalf("unexpected config: %+v", config)
	}
}

func TestResolveTenantGatewayFallsBackToLegacyOnlyWhenNoGatewayWasSelected(t *testing.T) {
	config, err := ResolveTenantGateway(tenant.TenantSettings{MPAccessToken: "legacy-token", MPPublicKey: "legacy-public"})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !config.Legacy || config.Provider != domainPayment.ProviderMercadoPago {
		t.Fatalf("unexpected config: %+v", config)
	}

	_, err = ResolveTenantGateway(tenant.TenantSettings{MPAccessToken: "legacy-token", PaymentGateway: tenant.PaymentGatewaySettings{Provider: "NONE"}})
	if err == nil {
		t.Fatal("expected disabled gateway to suppress legacy fallback")
	}
}

func encryptGatewayToken(t *testing.T, key []byte, token string) string {
	t.Helper()
	block, err := aes.NewCipher(key)
	if err != nil {
		t.Fatal(err)
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		t.Fatal(err)
	}
	nonce := make([]byte, gcm.NonceSize())
	if _, err := rand.Read(nonce); err != nil {
		t.Fatal(err)
	}
	sealed := gcm.Seal(nil, nonce, []byte(token), nil)
	tagStart := len(sealed) - gcm.Overhead()
	return "v1." + base64.RawURLEncoding.EncodeToString(nonce) + "." + base64.RawURLEncoding.EncodeToString(sealed[tagStart:]) + "." + base64.RawURLEncoding.EncodeToString(sealed[:tagStart])
}
