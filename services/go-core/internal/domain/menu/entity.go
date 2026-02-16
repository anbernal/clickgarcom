package menu

import (
	"time"

	"github.com/google/uuid"
)

// Category representa uma categoria do cardápio
type Category struct {
	ID           uuid.UUID `json:"id" gorm:"type:uuid;primary_key"`
	TenantID     uuid.UUID `json:"tenant_id" gorm:"type:uuid;not null;index"`
	Name         string    `json:"name" gorm:"type:varchar(100);not null"`
	Description  string    `json:"description,omitempty" gorm:"type:text"`
	DisplayOrder int       `json:"display_order" gorm:"default:0"`
	Active       bool      `json:"active" gorm:"default:true"`
	CreatedAt    time.Time `json:"created_at"`
	UpdatedAt    time.Time `json:"updated_at"`
}

func (Category) TableName() string {
	return "menu_categories"
}

// Item representa um item do cardápio
type Item struct {
	ID         uuid.UUID  `json:"id" gorm:"type:uuid;primary_key"`
	TenantID   uuid.UUID  `json:"tenant_id" gorm:"type:uuid;not null;index"`
	CategoryID *uuid.UUID `json:"category_id,omitempty" gorm:"type:uuid"`

	// Info básica
	Name        string  `json:"name" gorm:"type:varchar(255);not null"`
	Description string  `json:"description,omitempty" gorm:"type:text"`
	Price       float64 `json:"price" gorm:"type:decimal(10,2);not null"`

	// Imagem
	ImageURL string `json:"image_url,omitempty" gorm:"type:text"`

	// Roteamento (KDS)
	Destination string `json:"destination" gorm:"type:varchar(20);not null;default:'KITCHEN'"`

	// Tempo estimado de preparo (minutos)
	PrepTimeMinutes int `json:"prep_time_minutes" gorm:"default:15"`

	// Status
	Available    bool `json:"available" gorm:"default:true"`
	DisplayOrder int  `json:"display_order" gorm:"default:0"`

	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`

	// Relação com categoria (para preload)
	Category *Category `json:"category,omitempty" gorm:"foreignKey:CategoryID"`
}

func (Item) TableName() string {
	return "menu_items"
}

// IsKitchen verifica se o item vai para a cozinha
func (i *Item) IsKitchen() bool {
	return i.Destination == "KITCHEN"
}

// IsBar verifica se o item vai para o bar
func (i *Item) IsBar() bool {
	return i.Destination == "BAR"
}

// CalculateSubtotal calcula o subtotal para uma quantidade
func (i *Item) CalculateSubtotal(quantity int) float64 {
	return i.Price * float64(quantity)
}
