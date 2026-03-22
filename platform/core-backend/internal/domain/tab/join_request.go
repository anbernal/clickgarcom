package tab

import (
	"time"

	"github.com/google/uuid"
)

// JoinType representa o tipo de entrada do solicitante
type JoinType string

const (
	JoinTypeShared     JoinType = "shared"
	JoinTypeIndividual JoinType = "individual"
)

// JoinRequestStatus representa o estado da solicitação
type JoinRequestStatus string

const (
	JoinRequestPending  JoinRequestStatus = "PENDING"
	JoinRequestApproved JoinRequestStatus = "APPROVED"
	JoinRequestRejected JoinRequestStatus = "REJECTED"
)

// TabJoinRequest representa a solicitação de entrada de um novo cliente na mesa
type TabJoinRequest struct {
	ID             uuid.UUID         `json:"id" gorm:"type:uuid;primary_key"`
	TenantID       uuid.UUID         `json:"tenant_id" gorm:"type:uuid;not null;index"`
	TableID        uuid.UUID         `json:"table_id" gorm:"type:uuid;not null"`
	MainTabID      uuid.UUID         `json:"main_tab_id" gorm:"type:uuid"`                     // Tab do opener
	RequestorPhone string            `json:"requestor_phone" gorm:"type:varchar(30);not null"` // Client B
	OpenerPhone    string            `json:"opener_phone" gorm:"type:varchar(30);not null"`    // Client A
	JoinType       JoinType          `json:"join_type" gorm:"type:varchar(20);not null"`
	Status         JoinRequestStatus `json:"status" gorm:"type:varchar(20);default:PENDING"`
	CreatedAt      time.Time         `json:"created_at"`
	UpdatedAt      time.Time         `json:"updated_at"`
}

func (TabJoinRequest) TableName() string {
	return "tab_join_requests"
}
