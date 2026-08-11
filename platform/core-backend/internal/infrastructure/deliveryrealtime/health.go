package deliveryrealtime

import "time"

type HealthSnapshot struct {
	Status    string    `json:"status"`
	Timestamp time.Time `json:"timestamp"`
	Stats     Stats     `json:"stats"`
}

func (h *Hub) Health() HealthSnapshot {
	status := "ok"
	if h == nil {
		status = "unavailable"
	}
	return HealthSnapshot{Status: status, Timestamp: time.Now().UTC(), Stats: h.Stats()}
}
