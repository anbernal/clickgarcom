package inbox

import (
    "time"

    "github.com/google/uuid"
)

type InboxEvent struct {
    ID                 uuid.UUID  `json:"id" gorm:"type:uuid;primary_key"`
    Source             string     `json:"source" gorm:"not null"`
    ProviderMessageID  string     `json:"provider_message_id" gorm:"not null"`
    TenantID           *uuid.UUID `json:"tenant_id,omitempty" gorm:"type:uuid"`
    Payload            []byte     `json:"payload" gorm:"type:jsonb;not null"`
    Processed          bool       `json:"processed" gorm:"default:false"`
    ProcessingError    string     `json:"processing_error,omitempty" gorm:"type:text"`
    ReceivedAt         time.Time  `json:"received_at"`
    ProcessedAt        *time.Time `json:"processed_at,omitempty"`
}

func (InboxEvent) TableName() string {
    return "inbox_events"
}