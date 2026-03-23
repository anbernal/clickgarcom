package menu

import (
	"encoding/json"
	"sort"
	"strings"
	"time"

	"github.com/google/uuid"
)

// Category representa uma categoria do cardápio
type Category struct {
	ID           uuid.UUID `json:"id" gorm:"type:uuid;primary_key"`
	TenantID     uuid.UUID `json:"tenant_id" gorm:"type:uuid;not null;index"`
	Name         string    `json:"name" gorm:"type:varchar(100);not null"`
	Description  string    `json:"description,omitempty" gorm:"type:text"`
	ImageURL     string    `json:"image_url,omitempty" gorm:"type:text"`
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

	// Apresentação específica para WhatsApp
	WhatsAppShortName        string `json:"whatsapp_short_name,omitempty" gorm:"type:varchar(80)"`
	WhatsAppShortDescription string `json:"whatsapp_short_description,omitempty" gorm:"type:varchar(160)"`

	// Roteamento (KDS)
	Destination string `json:"destination" gorm:"type:varchar(20);not null;default:'KITCHEN'"`

	// Tempo estimado de preparo (minutos)
	PrepTimeMinutes int `json:"prep_time_minutes" gorm:"default:15"`

	// Status
	Available         bool `json:"available" gorm:"default:true"`
	TrackStock        bool `json:"track_stock" gorm:"column:track_stock;default:false"`
	StockQuantity     *int `json:"stock_quantity,omitempty" gorm:"column:stock_quantity"`
	LowStockThreshold *int `json:"low_stock_threshold,omitempty" gorm:"column:low_stock_threshold"`
	DisplayOrder      int  `json:"display_order" gorm:"default:0"`

	AvailabilityWindowsRaw string               `json:"-" gorm:"column:availability_windows;type:jsonb"`
	AvailabilityWindows    []AvailabilityWindow `json:"availability_windows,omitempty" gorm:"-"`

	IsCurrentlyAvailable      bool   `json:"is_currently_available" gorm:"-"`
	CurrentAvailabilityStatus string `json:"current_availability_status,omitempty" gorm:"-"`
	UnavailableReason         string `json:"unavailable_reason,omitempty" gorm:"-"`

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

type AvailabilityWindow struct {
	DayOfWeek int    `json:"day_of_week"`
	StartTime string `json:"start_time"`
	EndTime   string `json:"end_time"`
}

const (
	AvailabilityStatusAvailable            = "available"
	AvailabilityStatusLowStock             = "low_stock"
	AvailabilityStatusManualInactive       = "manual_inactive"
	AvailabilityStatusOutOfStock           = "out_of_stock"
	AvailabilityStatusScheduledUnavailable = "scheduled_unavailable"
)

func (i *Item) EnsureAvailabilityWindows() []AvailabilityWindow {
	if len(i.AvailabilityWindows) > 0 {
		return i.AvailabilityWindows
	}

	raw := strings.TrimSpace(i.AvailabilityWindowsRaw)
	if raw == "" || raw == "null" {
		return nil
	}

	var windows []AvailabilityWindow
	if err := json.Unmarshal([]byte(raw), &windows); err != nil {
		return nil
	}

	sanitized := make([]AvailabilityWindow, 0, len(windows))
	for _, window := range windows {
		if window.DayOfWeek < 0 || window.DayOfWeek > 6 {
			continue
		}
		if !isClockValue(window.StartTime) || !isClockValue(window.EndTime) {
			continue
		}
		sanitized = append(sanitized, AvailabilityWindow{
			DayOfWeek: window.DayOfWeek,
			StartTime: strings.TrimSpace(window.StartTime),
			EndTime:   strings.TrimSpace(window.EndTime),
		})
	}

	sort.Slice(sanitized, func(left, right int) bool {
		if sanitized[left].DayOfWeek == sanitized[right].DayOfWeek {
			return sanitized[left].StartTime < sanitized[right].StartTime
		}
		return sanitized[left].DayOfWeek < sanitized[right].DayOfWeek
	})

	i.AvailabilityWindows = sanitized
	return i.AvailabilityWindows
}

func (i *Item) EvaluateAvailabilityAt(now time.Time) (bool, string, string) {
	if !i.Available {
		return false, AvailabilityStatusManualInactive, "Item desativado manualmente"
	}

	if i.TrackStock && i.CurrentStockQuantity() <= 0 {
		return false, AvailabilityStatusOutOfStock, "Sem estoque no momento"
	}

	if windows := i.EnsureAvailabilityWindows(); len(windows) > 0 && !isWithinAvailabilityWindows(windows, now) {
		return false, AvailabilityStatusScheduledUnavailable, "Fora do horario configurado"
	}

	if i.TrackStock && i.LowStockThreshold != nil && i.StockQuantity != nil && *i.StockQuantity <= *i.LowStockThreshold {
		return true, AvailabilityStatusLowStock, ""
	}

	return true, AvailabilityStatusAvailable, ""
}

func (i *Item) IsAvailableAt(now time.Time) bool {
	available, _, _ := i.EvaluateAvailabilityAt(now)
	return available
}

func (i *Item) HydrateAvailabilityState(now time.Time) {
	available, status, reason := i.EvaluateAvailabilityAt(now)
	i.IsCurrentlyAvailable = available
	i.CurrentAvailabilityStatus = status
	i.UnavailableReason = reason
}

func (i *Item) CurrentStockQuantity() int {
	if i.StockQuantity == nil {
		return 0
	}
	return *i.StockQuantity
}

func isWithinAvailabilityWindows(windows []AvailabilityWindow, now time.Time) bool {
	currentDay := int(now.Weekday())
	currentMinutes := now.Hour()*60 + now.Minute()
	hasValidWindow := false

	for _, window := range windows {
		startMinutes, startOk := parseClockMinutes(window.StartTime)
		endMinutes, endOk := parseClockMinutes(window.EndTime)
		if !startOk || !endOk {
			continue
		}

		hasValidWindow = true

		if startMinutes == endMinutes {
			if currentDay == window.DayOfWeek {
				return true
			}
			continue
		}

		if startMinutes < endMinutes {
			if currentDay == window.DayOfWeek && currentMinutes >= startMinutes && currentMinutes <= endMinutes {
				return true
			}
			continue
		}

		if currentDay == window.DayOfWeek && currentMinutes >= startMinutes {
			return true
		}

		previousDay := (currentDay + 6) % 7
		if previousDay == window.DayOfWeek && currentMinutes <= endMinutes {
			return true
		}
	}

	if !hasValidWindow {
		return true
	}

	return false
}

func parseClockMinutes(value string) (int, bool) {
	value = strings.TrimSpace(value)
	if !isClockValue(value) {
		return 0, false
	}

	parts := strings.Split(value, ":")
	hours := int(parts[0][0]-'0')*10 + int(parts[0][1]-'0')
	minutes := int(parts[1][0]-'0')*10 + int(parts[1][1]-'0')
	return hours*60 + minutes, true
}

func isClockValue(value string) bool {
	if len(value) != 5 || value[2] != ':' {
		return false
	}

	if value[0] < '0' || value[0] > '2' || value[1] < '0' || value[1] > '9' || value[3] < '0' || value[3] > '5' || value[4] < '0' || value[4] > '9' {
		return false
	}

	hours := int(value[0]-'0')*10 + int(value[1]-'0')
	return hours >= 0 && hours <= 23
}
