export type ManualOrderItemDto = {
    menu_item_id: string;
    quantity: number;
    observations?: string;
    selected_options?: Array<{
        group_name?: string;
        option_name?: string;
        price_delta?: number;
    }>;
};

export class CreateManualOrderDto {
    tab_id!: string;
    items!: ManualOrderItemDto[];
    notes?: string;
}

export class UpdateManualOrderDto {
    notes?: string;
}

export class UpdateManualOrderItemDto {
    quantity!: number;
    observations?: string;
}

export class VoidManualOrderItemDto {
    quantity?: number;
    reason!: string;
}
