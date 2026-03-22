package application

import (
	"os"
	"testing"
)

func TestMain(m *testing.M) {
	orderingPreviewDelay = 0
	os.Exit(m.Run())
}
