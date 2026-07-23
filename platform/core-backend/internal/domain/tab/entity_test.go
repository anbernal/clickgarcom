package tab

import (
	"testing"

	"github.com/google/uuid"
)

func TestBuildPublicCode(t *testing.T) {
	id := uuid.MustParse("550e8400-e29b-41d4-a716-446655440000")

	if got, want := BuildPublicCode(id), "550E8"; got != want {
		t.Fatalf("BuildPublicCode() = %q, want %q", got, want)
	}
}
