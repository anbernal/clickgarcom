import { IsIn, IsNumber, IsObject, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';

export class CreateDeliveryCheckoutDto {
    @IsString()
    @MaxLength(255)
    checkout_key!: string;

    @IsOptional()
    @IsIn(['OWN', 'EXTERNAL'])
    fulfillment_mode?: 'OWN' | 'EXTERNAL';

    @IsUUID()
    customer_id!: string;

    @IsUUID()
    customer_address_id!: string;

    @IsOptional()
    @IsUUID()
    order_batch_id?: string;

    @IsOptional()
    @IsUUID()
    quote_id?: string;

    @IsNumber()
    @Min(0)
    @Max(1000000)
    order_total!: number;

    @IsNumber()
    @Min(-90)
    @Max(90)
    destination_lat!: number;

    @IsNumber()
    @Min(-180)
    @Max(180)
    destination_lng!: number;

    @IsOptional()
    @IsObject()
    address_snapshot?: Record<string, unknown>;
}

export class ConfirmDeliveryCheckoutDto {
    @IsString()
    @MaxLength(255)
    checkout_key!: string;

    @IsString()
    @MaxLength(255)
    confirmation_token!: string;

    @IsString()
    @MaxLength(255)
    payment_reference!: string;

    @IsOptional()
    @IsUUID()
    delivery_id?: string;
}

// Server-to-server confirmation used after the payment provider webhook has
// been reconciled by Core. The internal service token authenticates the caller;
// the customer-facing opaque confirmation token is intentionally not reused.
export class ConfirmPaidDeliveryCheckoutDto {
    @IsString()
    @MaxLength(255)
    checkout_key!: string;

    @IsString()
    @MaxLength(255)
    payment_reference!: string;

    @IsUUID()
    order_batch_id!: string;

    @IsNumber()
    @Min(0)
    @Max(1000000)
    paid_amount!: number;

    @IsOptional()
    @IsUUID()
    delivery_id?: string;
}
