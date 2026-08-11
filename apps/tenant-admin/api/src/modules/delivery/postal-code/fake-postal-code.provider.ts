import { Injectable } from '@nestjs/common';
import { DeliveryPostalCodeProvider, PostalCodeResult } from './postal-code-provider';

@Injectable()
export class FakeDeliveryPostalCodeProvider implements DeliveryPostalCodeProvider {
    async lookup(postalCode: string): Promise<PostalCodeResult> {
        if (postalCode === '00000000') {
            return { postal_code: postalCode, street: '', neighborhood: '', city: '', state: '', provider: 'FAKE', status: 'NOT_FOUND' };
        }
        return {
            postal_code: postalCode,
            street: 'Rua informada pelo provedor fake',
            neighborhood: 'Centro',
            city: 'São Paulo',
            state: 'SP',
            provider: 'FAKE',
            status: 'FOUND',
        };
    }
}
