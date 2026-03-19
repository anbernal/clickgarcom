package whatsapp

import (
	"net/url"
	"strings"
)

func normalizeWhatsAppImageURL(raw string) string {
	trimmed := strings.TrimSpace(raw)
	if trimmed == "" {
		return ""
	}

	parsed, err := url.Parse(trimmed)
	if err != nil {
		return trimmed
	}

	host := strings.ToLower(parsed.Hostname())
	switch host {
	case "images.unsplash.com":
		query := parsed.Query()
		query.Set("fm", "jpg")

		autoValues := splitCSV(query.Get("auto"))
		filteredAuto := make([]string, 0, len(autoValues))
		for _, value := range autoValues {
			if value == "format" || value == "" {
				continue
			}
			filteredAuto = append(filteredAuto, value)
		}
		if len(filteredAuto) > 0 {
			query.Set("auto", strings.Join(filteredAuto, ","))
		} else {
			query.Del("auto")
		}

		parsed.RawQuery = query.Encode()
		return parsed.String()
	default:
		return trimmed
	}
}

func splitCSV(raw string) []string {
	if strings.TrimSpace(raw) == "" {
		return nil
	}

	parts := strings.Split(raw, ",")
	values := make([]string, 0, len(parts))
	for _, part := range parts {
		value := strings.ToLower(strings.TrimSpace(part))
		if value == "" {
			continue
		}
		values = append(values, value)
	}
	return values
}
