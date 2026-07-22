package application

import (
	"context"
	"strings"

	"github.com/anbernal/clickgarcom/internal/domain/whatsapp"
)

const mainMenuBackButtonTitle = "↩️ Voltar ao menu"

// sendInteractiveButtonsWithBack keeps the back action visible without exceeding
// WhatsApp's three-button limit. Menus with three actions become a list.
func sendInteractiveButtonsWithBack(
	sender WhatsAppSender,
	ctx context.Context,
	to string,
	body string,
	buttons []whatsapp.InteractiveButton,
) (string, error) {
	actions := make([]whatsapp.InteractiveButton, 0, len(buttons))
	for _, button := range buttons {
		if strings.TrimSpace(button.Reply.ID) == "0" {
			continue
		}
		actions = append(actions, button)
	}

	back := mainMenuBackButton()
	if len(actions) <= 2 {
		return sender.SendInteractiveButtons(ctx, to, strings.TrimSpace(body), append(actions, back))
	}

	rows := make([]whatsapp.InteractiveListRow, 0, len(actions)+1)
	for _, action := range actions {
		rows = append(rows, whatsapp.InteractiveListRow{
			ID:          strings.TrimSpace(action.Reply.ID),
			Title:       truncateInteractiveTitle(action.Reply.Title),
			Description: "Selecionar esta opção",
		})
	}
	rows = append(rows, mainMenuBackRow())

	return sender.SendInteractiveList(
		ctx,
		to,
		strings.TrimSpace(body),
		"Escolher opção",
		[]whatsapp.InteractiveListSection{{Title: "Opções", Rows: rows}},
	)
}

func appendMainMenuBackRow(rows []whatsapp.InteractiveListRow) []whatsapp.InteractiveListRow {
	result := make([]whatsapp.InteractiveListRow, 0, len(rows)+1)
	for _, row := range rows {
		if strings.TrimSpace(row.ID) == "0" {
			continue
		}
		result = append(result, row)
	}
	return append(result, mainMenuBackRow())
}

func mainMenuBackButton() whatsapp.InteractiveButton {
	return whatsapp.InteractiveButton{
		Type: "reply",
		Reply: struct {
			ID    string `json:"id"`
			Title string `json:"title"`
		}{ID: "0", Title: mainMenuBackButtonTitle},
	}
}

func mainMenuBackRow() whatsapp.InteractiveListRow {
	return whatsapp.InteractiveListRow{
		ID:          "0",
		Title:       "Voltar ao menu",
		Description: "Retornar ao menu principal",
	}
}
