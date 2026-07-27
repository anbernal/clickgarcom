package payment

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/sha256"
	"encoding/base64"
	"errors"
	"fmt"
	"os"
	"strings"

	domainPayment "github.com/anbernal/clickgarcom/internal/domain/payment"
	"github.com/anbernal/clickgarcom/internal/domain/tenant"
)

var ErrGatewayNotConfigured = errors.New("payment gateway not configured for this tenant")

type GatewayConfig struct {
	Provider    domainPayment.Provider
	Enabled     bool
	Environment string
	AccessToken string
	PublicKey   string
	Legacy      bool
}

func ResolveTenantGateway(settings tenant.TenantSettings) (GatewayConfig, error) {
	configuredProvider := strings.ToUpper(strings.TrimSpace(settings.PaymentGateway.Provider))
	if configuredProvider == "NONE" {
		return GatewayConfig{}, ErrGatewayNotConfigured
	}

	if configuredProvider != "" {
		if configuredProvider != string(domainPayment.ProviderMercadoPago) || !settings.PaymentGateway.Enabled {
			return GatewayConfig{}, ErrGatewayNotConfigured
		}
		accessToken, err := decryptAccessToken(settings.PaymentGateway.AccessTokenEncrypted)
		if err != nil {
			return GatewayConfig{}, fmt.Errorf("invalid payment gateway credentials: %w", err)
		}
		if accessToken == "" {
			return GatewayConfig{}, ErrGatewayNotConfigured
		}
		return GatewayConfig{
			Provider:    domainPayment.ProviderMercadoPago,
			Enabled:     true,
			Environment: strings.ToUpper(strings.TrimSpace(settings.PaymentGateway.Environment)),
			AccessToken: accessToken,
			PublicKey:   strings.TrimSpace(settings.PaymentGateway.PublicKey),
		}, nil
	}

	// Compatibility during migration: tenants configured before gateway settings
	// continue to operate until an administrator saves the new configuration.
	if accessToken := strings.TrimSpace(settings.MPAccessToken); accessToken != "" {
		return GatewayConfig{
			Provider:    domainPayment.ProviderMercadoPago,
			Enabled:     true,
			AccessToken: accessToken,
			PublicKey:   strings.TrimSpace(settings.MPPublicKey),
			Legacy:      true,
		}, nil
	}

	return GatewayConfig{}, ErrGatewayNotConfigured
}

func decryptAccessToken(value string) (string, error) {
	parts := strings.Split(strings.TrimSpace(value), ".")
	if len(parts) != 4 || parts[0] != "v1" {
		return "", errors.New("encrypted access token is missing or malformed")
	}
	key, err := gatewayEncryptionKey()
	if err != nil {
		return "", err
	}
	nonce, err := base64.RawURLEncoding.DecodeString(parts[1])
	if err != nil {
		return "", errors.New("invalid credential nonce")
	}
	tag, err := base64.RawURLEncoding.DecodeString(parts[2])
	if err != nil {
		return "", errors.New("invalid credential authentication tag")
	}
	ciphertext, err := base64.RawURLEncoding.DecodeString(parts[3])
	if err != nil {
		return "", errors.New("invalid encrypted credential")
	}
	block, err := aes.NewCipher(key)
	if err != nil {
		return "", err
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return "", err
	}
	plaintext, err := gcm.Open(nil, nonce, append(ciphertext, tag...), nil)
	if err != nil {
		return "", errors.New("cannot decrypt payment gateway credential")
	}
	return strings.TrimSpace(string(plaintext)), nil
}

func gatewayEncryptionKey() ([]byte, error) {
	value := strings.TrimSpace(os.Getenv("PAYMENT_GATEWAY_ENCRYPTION_KEY"))
	if value == "" {
		return nil, errors.New("PAYMENT_GATEWAY_ENCRYPTION_KEY is not configured")
	}
	for _, encoding := range []*base64.Encoding{base64.RawStdEncoding, base64.StdEncoding} {
		if decoded, err := encoding.DecodeString(value); err == nil && len(decoded) == 32 {
			return decoded, nil
		}
	}
	// A 32+ character passphrase is accepted for operations that cannot yet
	// provide base64. SHA-256 makes the key length deterministic.
	if len(value) >= 32 {
		digest := sha256.Sum256([]byte(value))
		return digest[:], nil
	}
	return nil, errors.New("PAYMENT_GATEWAY_ENCRYPTION_KEY must be a 32-byte base64 key or passphrase")
}
