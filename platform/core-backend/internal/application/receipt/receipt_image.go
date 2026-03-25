package receipt

import (
	"bytes"
	"fmt"
	"image/color"
	"image/png"
	"math"
	"strings"
	"time"

	"github.com/fogleman/gg"
	"golang.org/x/image/font"
	"golang.org/x/image/font/basicfont"
)

// ReceiptItem represents a single line item on the receipt
type ReceiptItem struct {
	Name     string
	Quantity int
	Price    float64
}

// ReceiptData holds all data needed to generate a receipt image
type ReceiptData struct {
	RestaurantName string
	TableNumber    string
	TabID          string
	Items          []ReceiptItem
	Subtotal       float64
	ServiceFee     float64
	ServicePercent float64
	Total          float64
	GeneratedAt    time.Time
}

var (
	colBg     = color.RGBA{255, 255, 255, 255}
	colDark   = color.RGBA{35, 35, 35, 255}
	colMuted  = color.RGBA{120, 120, 120, 255}
	colAccent = color.RGBA{26, 188, 156, 255}
	colLine   = color.RGBA{210, 210, 210, 255}
	colDash   = color.RGBA{180, 180, 180, 255}
)

func monoFace() font.Face {
	return basicfont.Face7x13
}

// GenerateReceiptImage draws a receipt-style PNG and returns the bytes.
func GenerateReceiptImage(data ReceiptData) ([]byte, error) {
	const (
		width     = 420
		padX      = 24.0
		lineH     = 20.0
		sectionGap = 12.0
	)

	contentW := float64(width) - 2*padX

	// Pre-calculate height
	headerLines := 4.0 // restaurant name, date, table, separator
	itemLines := float64(len(data.Items))
	totalLines := 4.0 // separator, subtotal, service fee, total
	footerLines := 2.0

	totalH := sectionGap + // top padding
		headerLines*lineH + sectionGap + // header
		itemLines*lineH + sectionGap + // items
		totalLines*lineH + sectionGap + // totals
		footerLines*lineH + sectionGap // footer

	height := int(math.Ceil(totalH)) + 30 // extra padding

	dc := gg.NewContext(width, height)
	face := monoFace()
	dc.SetFontFace(face)

	// Background
	dc.SetColor(colBg)
	dc.Clear()

	// Subtle border
	dc.SetColor(colLine)
	dc.SetLineWidth(1)
	dc.DrawRoundedRectangle(4, 4, float64(width)-8, float64(height)-8, 8)
	dc.Stroke()

	y := sectionGap + 8

	// ── HEADER ──
	dc.SetColor(colAccent)
	restaurantName := strings.ToUpper(data.RestaurantName)
	if len(restaurantName) > 30 {
		restaurantName = restaurantName[:30]
	}
	nameW := float64(len(restaurantName)) * 7
	dc.DrawString(restaurantName, (float64(width)-nameW)/2, y+lineH)
	y += lineH + 4

	dc.SetColor(colMuted)
	dateStr := data.GeneratedAt.Format("02/01/2006  15:04")
	dateW := float64(len(dateStr)) * 7
	dc.DrawString(dateStr, (float64(width)-dateW)/2, y+lineH)
	y += lineH

	tableInfo := fmt.Sprintf("Mesa %s", data.TableNumber)
	if data.TableNumber == "" {
		tableInfo = fmt.Sprintf("Comanda %s", shortID(data.TabID))
	}
	tableW := float64(len(tableInfo)) * 7
	dc.DrawString(tableInfo, (float64(width)-tableW)/2, y+lineH)
	y += lineH + sectionGap

	// ── SEPARATOR ──
	y = drawDashedLine(dc, padX, y, contentW)
	y += sectionGap

	// ── COLUMN HEADERS ──
	dc.SetColor(colMuted)
	dc.DrawString("ITEM", padX, y+lineH*0.8)
	dc.DrawString("VALOR", padX+contentW-35, y+lineH*0.8)
	y += lineH

	// ── ITEMS ──
	dc.SetColor(colDark)
	for _, item := range data.Items {
		qtyLabel := fmt.Sprintf("%dx ", item.Quantity)
		itemName := truncate(item.Name, 28)
		left := qtyLabel + itemName
		right := fmt.Sprintf("%.2f", item.Price*float64(item.Quantity))

		dc.DrawString(left, padX, y+lineH*0.8)
		rightW := float64(len(right)) * 7
		dc.DrawString(right, padX+contentW-rightW, y+lineH*0.8)
		y += lineH
	}

	y += 4

	// ── SEPARATOR ──
	y = drawDashedLine(dc, padX, y, contentW)
	y += sectionGap

	// ── TOTALS ──
	// Subtotal
	dc.SetColor(colMuted)
	dc.DrawString("Subtotal", padX, y+lineH*0.8)
	subStr := fmt.Sprintf("R$ %.2f", data.Subtotal)
	subW := float64(len(subStr)) * 7
	dc.DrawString(subStr, padX+contentW-subW, y+lineH*0.8)
	y += lineH

	// Service Fee
	feeLabel := fmt.Sprintf("Taxa servico (%.0f%%)", data.ServicePercent)
	dc.DrawString(feeLabel, padX, y+lineH*0.8)
	feeStr := fmt.Sprintf("R$ %.2f", data.ServiceFee)
	feeW := float64(len(feeStr)) * 7
	dc.DrawString(feeStr, padX+contentW-feeW, y+lineH*0.8)
	y += lineH + 6

	// Solid line before total
	dc.SetColor(colDark)
	dc.SetLineWidth(2)
	dc.DrawLine(padX, y, padX+contentW, y)
	dc.Stroke()
	y += 8

	// TOTAL
	dc.SetColor(colAccent)
	dc.DrawString("TOTAL", padX, y+lineH*0.8)
	totalStr := fmt.Sprintf("R$ %.2f", data.Total)
	totalW := float64(len(totalStr)) * 7
	dc.DrawString(totalStr, padX+contentW-totalW, y+lineH*0.8)
	y += lineH + sectionGap

	// ── FOOTER ──
	dc.SetColor(colLine)
	dc.SetLineWidth(0.5)
	dc.DrawLine(padX, y, padX+contentW, y)
	dc.Stroke()
	y += sectionGap

	dc.SetColor(colMuted)
	footer := "ClickGarcom  -  Recibo digital"
	footerW := float64(len(footer)) * 7
	dc.DrawString(footer, (float64(width)-footerW)/2, y+lineH*0.8)

	// Encode to PNG
	var buf bytes.Buffer
	if err := png.Encode(&buf, dc.Image()); err != nil {
		return nil, fmt.Errorf("failed to encode receipt PNG: %w", err)
	}

	return buf.Bytes(), nil
}

func drawDashedLine(dc *gg.Context, x, y, width float64) float64 {
	dc.SetColor(colDash)
	dc.SetLineWidth(1)
	dashLen := 5.0
	gap := 3.0
	cx := x
	for cx < x+width {
		end := cx + dashLen
		if end > x+width {
			end = x + width
		}
		dc.DrawLine(cx, y, end, y)
		dc.Stroke()
		cx = end + gap
	}
	return y + 2
}

func truncate(s string, maxLen int) string {
	if len(s) <= maxLen {
		return s
	}
	return s[:maxLen-1] + "…"
}

func shortID(id string) string {
	if len(id) >= 8 {
		return id[:8]
	}
	return id
}
