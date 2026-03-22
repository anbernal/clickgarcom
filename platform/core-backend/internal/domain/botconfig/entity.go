package botconfig

import (
	"database/sql/driver"
	"encoding/json"
	"errors"
	"time"

	"github.com/google/uuid"
)

type Channel string

const (
	ChannelWhatsApp Channel = "whatsapp"
)

type Status string

const (
	StatusDraft     Status = "DRAFT"
	StatusPublished Status = "PUBLISHED"
	StatusArchived  Status = "ARCHIVED"
)

type Definition map[string]interface{}

type FlowDefinition struct {
	ID          uuid.UUID  `json:"id" gorm:"type:uuid;primary_key"`
	TenantID    uuid.UUID  `json:"tenant_id" gorm:"type:uuid;not null;index"`
	Key         string     `json:"key" gorm:"column:flow_key;not null"`
	Channel     Channel    `json:"channel" gorm:"type:varchar(30);not null"`
	Status      Status     `json:"status" gorm:"type:varchar(20);not null"`
	Version     int        `json:"version" gorm:"not null"`
	Definition  Definition `json:"definition" gorm:"type:jsonb"`
	CreatedBy   *uuid.UUID `json:"created_by,omitempty" gorm:"type:uuid"`
	UpdatedBy   *uuid.UUID `json:"updated_by,omitempty" gorm:"type:uuid"`
	PublishedAt *time.Time `json:"published_at,omitempty"`
	CreatedAt   time.Time  `json:"created_at"`
	UpdatedAt   time.Time  `json:"updated_at"`
}

func (FlowDefinition) TableName() string {
	return "bot_flow_definitions"
}

func (d *Definition) Scan(value interface{}) error {
	if value == nil {
		*d = Definition{}
		return nil
	}

	raw, ok := value.([]byte)
	if !ok {
		return errors.New("failed to scan Definition: expected []byte")
	}

	var decoded map[string]interface{}
	if err := json.Unmarshal(raw, &decoded); err != nil {
		return err
	}

	*d = Definition(decoded)
	return nil
}

func (d Definition) Value() (driver.Value, error) {
	if d == nil {
		return json.Marshal(map[string]interface{}{})
	}
	return json.Marshal(map[string]interface{}(d))
}
