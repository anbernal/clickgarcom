import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsDateString, IsOptional, IsString, MaxLength, ValidateNested } from 'class-validator';
import { PurchaseEntryItemDto } from './purchase-entry-item.dto';

export class CreatePurchaseEntryDto {
    @IsString()
    @MaxLength(180)
    supplier_name: string;

    @IsOptional()
    @IsString()
    @MaxLength(40)
    supplier_document?: string;

    @IsOptional()
    @IsString()
    @MaxLength(80)
    invoice_number?: string;

    @IsOptional()
    @IsDateString()
    purchase_date?: string;

    @IsOptional()
    @IsString()
    @MaxLength(2000)
    notes?: string;

    @IsArray()
    @ArrayMaxSize(50)
    @ValidateNested({ each: true })
    @Type(() => PurchaseEntryItemDto)
    items: PurchaseEntryItemDto[];
}
