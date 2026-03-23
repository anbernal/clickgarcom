import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsUUID, Min } from 'class-validator';

export class MenuItemComboComponentDto {
    @IsUUID()
    menu_item_id: string;

    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    quantity?: number;

    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(0)
    display_order?: number;
}
