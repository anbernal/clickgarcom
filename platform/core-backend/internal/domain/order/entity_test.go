package order

import (
	"testing"

	"github.com/google/uuid"
)

func TestOrderItemSetSelectedOptionsPersistsEmptyJSONArray(t *testing.T) {
	var item OrderItem

	item.SetSelectedOptions(nil)
	if item.SelectedOptionsRaw != "[]" {
		t.Fatalf("expected empty selected_options JSON array, got %q", item.SelectedOptionsRaw)
	}

	item.SetSelectedOptions([]SelectedOption{{GroupName: "", OptionName: "", PriceDelta: 0}})
	if item.SelectedOptionsRaw != "[]" {
		t.Fatalf("expected sanitized empty selected_options JSON array, got %q", item.SelectedOptionsRaw)
	}
}

func TestOrderItemSetSelectedOptionsPersistsJSONPayload(t *testing.T) {
	var item OrderItem

	item.SetSelectedOptions([]SelectedOption{{
		GroupName:  "Extras",
		OptionName: "Bacon",
		PriceDelta: 5,
	}})

	expected := `[{"group_name":"Extras","option_name":"Bacon","price_delta":5}]`
	if item.SelectedOptionsRaw != expected {
		t.Fatalf("expected %q, got %q", expected, item.SelectedOptionsRaw)
	}
}

func TestOrderCalculateTotalUsesEffectiveQuantityAfterVoid(t *testing.T) {
	o := Order{Items: []OrderItem{
		{ID: uuid.New(), Quantity: 3, VoidedQuantity: 1, UnitPrice: 12.50},
		{ID: uuid.New(), Quantity: 2, VoidedQuantity: 5, UnitPrice: 9.00},
	}}

	if got, want := o.CalculateTotal(), 25.00; got != want {
		t.Fatalf("expected effective total %.2f, got %.2f", want, got)
	}
}
