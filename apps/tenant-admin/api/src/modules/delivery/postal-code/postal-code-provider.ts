export type PostalCodeLookupStatus = 'FOUND' | 'NOT_FOUND' | 'ERROR';

export type PostalCodeResult = {
    postal_code: string;
    street: string;
    neighborhood: string;
    city: string;
    state: string;
    provider: string;
    status: PostalCodeLookupStatus;
};

export interface DeliveryPostalCodeProvider {
    lookup(postalCode: string): Promise<PostalCodeResult>;
}

export const DELIVERY_POSTAL_CODE_PROVIDER = Symbol('DELIVERY_POSTAL_CODE_PROVIDER');
