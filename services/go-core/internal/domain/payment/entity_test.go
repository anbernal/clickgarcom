package payment

import (
	"sync"
	"testing"

	"gorm.io/gorm/schema"
)

func TestPaymentSchemaMapsPixTxIDToLegacyColumn(t *testing.T) {
	t.Parallel()

	parsedSchema, err := schema.Parse(&Payment{}, &sync.Map{}, schema.NamingStrategy{})
	if err != nil {
		t.Fatalf("parse schema: %v", err)
	}

	field := parsedSchema.LookUpField("PixTxID")
	if field == nil {
		t.Fatalf("PixTxID field not found in schema")
	}

	if field.DBName != "pix_txid" {
		t.Fatalf("unexpected DB column for PixTxID: got %q want %q", field.DBName, "pix_txid")
	}
}

func TestAttemptSchemaMapsProviderStatusDetailColumn(t *testing.T) {
	t.Parallel()

	parsedSchema, err := schema.Parse(&Attempt{}, &sync.Map{}, schema.NamingStrategy{})
	if err != nil {
		t.Fatalf("parse schema: %v", err)
	}

	field := parsedSchema.LookUpField("ProviderStatusInfo")
	if field == nil {
		t.Fatalf("ProviderStatusInfo field not found in schema")
	}

	if field.DBName != "provider_status_detail" {
		t.Fatalf("unexpected DB column for ProviderStatusInfo: got %q want %q", field.DBName, "provider_status_detail")
	}
}
