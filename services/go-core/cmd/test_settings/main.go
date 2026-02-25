package main

import (
	"encoding/json"
	"fmt"

	"github.com/anbernal/clickgarcom/internal/domain/tenant"
)

func main() {
	raw := `{"messages": {"msg_restaurant_closed": "Custom closed!"}, "nps_enabled": true, "service_fee_percent": 10}`
	var ts tenant.TenantSettings
	err := json.Unmarshal([]byte(raw), &ts)
	if err != nil {
		fmt.Println("ERROR:", err)
		return
	}
	fmt.Printf("RestaurantClosed=[%s]\n", ts.Messages.RestaurantClosed)
	fmt.Printf("NPSEnabled=%v\n", ts.NPSEnabled)
	fmt.Printf("ServiceFee=%.0f\n", ts.ServiceFeePercent)
}
