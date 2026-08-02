package application

import "testing"

func TestNormalizeOptionalText(t *testing.T) {
	tests := []struct {
		name  string
		input string
		want  string
	}{
		{name: "empty", input: "", want: ""},
		{name: "spaces", input: "   ", want: ""},
		{name: "go nil", input: "<nil>", want: ""},
		{name: "case insensitive nil", input: " NIL ", want: ""},
		{name: "null", input: "null", want: ""},
		{name: "undefined", input: "undefined", want: ""},
		{name: "real observation", input: "  Sem cebola  ", want: "Sem cebola"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := normalizeOptionalText(tt.input); got != tt.want {
				t.Fatalf("normalizeOptionalText(%q) = %q, want %q", tt.input, got, tt.want)
			}
		})
	}
}

func TestOptionalTextFromAny(t *testing.T) {
	if got := optionalTextFromAny(nil); got != "" {
		t.Fatalf("optionalTextFromAny(nil) = %q, want empty", got)
	}
	if got := optionalTextFromAny("<nil>"); got != "" {
		t.Fatalf("optionalTextFromAny(<nil>) = %q, want empty", got)
	}
}
