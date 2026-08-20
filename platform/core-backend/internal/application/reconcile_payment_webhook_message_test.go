package application

import (
	"encoding/json"
	"testing"
)

func TestDeliveryCustomerNameFromSnapshotIgnoresMissingOrNullLikeName(t *testing.T) {
	tests := []struct {
		name     string
		snapshot string
		want     string
	}{
		{name: "missing", snapshot: `{}`, want: ""},
		{name: "null", snapshot: `{"customer_name":null}`, want: ""},
		{name: "nil text", snapshot: `{"customer_name":"<nil>"}`, want: ""},
		{name: "valid", snapshot: `{"customer_name":"  Maria   Silva "}`, want: "Maria Silva"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := deliveryCustomerNameFromSnapshot(json.RawMessage(tt.snapshot)); got != tt.want {
				t.Fatalf("deliveryCustomerNameFromSnapshot(%s) = %q, want %q", tt.snapshot, got, tt.want)
			}
		})
	}
}
