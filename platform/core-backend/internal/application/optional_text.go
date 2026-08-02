package application

import (
	"fmt"
	"strings"
)

var nullLikeOptionalTexts = map[string]struct{}{
	"<nil>":     {},
	"nil":       {},
	"null":      {},
	"<null>":    {},
	"undefined": {},
}

func normalizeOptionalText(value string) string {
	trimmed := strings.TrimSpace(value)
	if trimmed == "" {
		return ""
	}
	if _, nullLike := nullLikeOptionalTexts[strings.ToLower(trimmed)]; nullLike {
		return ""
	}
	return trimmed
}

func optionalTextFromAny(raw interface{}) string {
	if raw == nil {
		return ""
	}
	return normalizeOptionalText(fmt.Sprintf("%v", raw))
}
