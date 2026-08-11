import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { DataSource, Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';

import { Customer } from '../../entities/customer.entity';
import { CustomerAddress } from '../../entities/customer-address.entity';
import { UserAccessAuditLog } from '../../entities/user-access-audit-log.entity';
import { CreateCustomerAddressDto, UpdateCustomerAddressDto } from './dto/delivery-customer.dto';

@Injectable()
export class DeliveryCustomerService {
    constructor(
        @InjectRepository(Customer) private readonly customers: Repository<Customer>,
        @InjectRepository(CustomerAddress) private readonly addresses: Repository<CustomerAddress>,
        private readonly dataSource: DataSource,
    ) { }

    normalizePhone(raw: string): string {
        const phone = String(raw || '').replace(/\D/g, '');
        if (!/^[1-9]\d{9,14}$/.test(phone)) {
            throw new BadRequestException('Telefone do cliente inválido. Informe o número com DDI, somente dígitos.');
        }
        return phone;
    }

    async resolveCustomer(tenantId: string, rawPhone: string) {
        const phoneNormalized = this.normalizePhone(rawPhone);
        await this.customers.createQueryBuilder()
            .insert()
            .into(Customer)
            .values({ tenantId, phoneNormalized, active: true })
            .orIgnore()
            .execute();

        const customer = await this.customers.findOne({ where: { tenantId, phoneNormalized, active: true } });
        if (!customer) throw new ConflictException('Não foi possível criar ou localizar o cliente.');
        return this.customerView(customer);
    }

    async getCustomer(tenantId: string, customerId: string) {
        const customer = await this.customers.findOne({ where: { id: customerId, tenantId, active: true } });
        if (!customer) throw new NotFoundException('Cliente não encontrado.');
        return this.customerView(customer);
    }

    async listAddresses(tenantId: string, customerId: string) {
        await this.assertCustomer(tenantId, customerId);
        const rows = await this.addresses.createQueryBuilder('address')
            .where('address.tenant_id = :tenantId', { tenantId })
            .andWhere('address.customer_id = :customerId', { customerId })
            .andWhere('address.deleted_at IS NULL')
            .orderBy('address.is_default', 'DESC')
            .addOrderBy('address.last_used_at', 'DESC', 'NULLS LAST')
            .addOrderBy('address.created_at', 'DESC')
            .getMany();
        return rows.map((row) => this.addressView(row));
    }

    async createAddress(tenantId: string, customerId: string, dto: CreateCustomerAddressDto) {
        if (!dto.confirmed) throw new BadRequestException('O endereço precisa ser confirmado pelo cliente.');
        const result = await this.dataSource.transaction(async (manager) => {
            const customer = await manager.getRepository(Customer).createQueryBuilder('customer')
                .where('customer.id = :customerId AND customer.tenant_id = :tenantId AND customer.active = TRUE', { customerId, tenantId })
                .setLock('pessimistic_write')
                .getOne();
            if (!customer) throw new NotFoundException('Cliente não encontrado.');

            const count = await manager.getRepository(CustomerAddress).count({ where: { tenantId, customerId, deletedAt: null } });
            if (count >= 5) throw new ConflictException('O cliente já possui o limite de cinco endereços ativos.');

            const isDefault = dto.is_default === true || count === 0;
            if (isDefault) {
                await manager.getRepository(CustomerAddress).update({ tenantId, customerId, deletedAt: null }, { isDefault: false });
            }
            const address = manager.getRepository(CustomerAddress).create(this.addressValues(dto, tenantId, customerId, isDefault));
            const saved = await manager.getRepository(CustomerAddress).save(address);
            await this.audit(manager, tenantId, 'DELIVERY_ADDRESS_CREATED', { customer_id: customerId, address_id: saved.id, is_default: saved.isDefault });
            return saved;
        });
        return this.addressView(result);
    }

    async updateAddress(tenantId: string, customerId: string, addressId: string, dto: UpdateCustomerAddressDto) {
        const result = await this.dataSource.transaction(async (manager) => {
            await this.lockCustomer(manager, tenantId, customerId);
            const repository = manager.getRepository(CustomerAddress);
            const address = await repository.findOne({ where: { id: addressId, tenantId, customerId, deletedAt: null } });
            if (!address) throw new NotFoundException('Endereço não encontrado.');
            if (dto.confirmed === false) throw new BadRequestException('O endereço precisa permanecer confirmado.');

            if (dto.is_default === true) {
                await repository.update({ tenantId, customerId, deletedAt: null }, { isDefault: false });
                address.isDefault = true;
            } else if (dto.is_default === false) {
                address.isDefault = false;
            }
            Object.assign(address, this.addressPatch(dto));
            if (this.hasAddressFieldChange(dto)) {
                address.formattedAddress = this.formatAddress(address);
                address.confirmedAt = new Date();
            } else if (dto.confirmed === true) {
                address.confirmedAt = new Date();
            }
            const saved = await repository.save(address);
            await this.audit(manager, tenantId, 'DELIVERY_ADDRESS_UPDATED', { customer_id: customerId, address_id: addressId, fields: Object.keys(dto).filter((key) => !['confirmed'].includes(key)).slice(0, 20) });
            return saved;
        });
        return this.addressView(result);
    }

    async removeAddress(tenantId: string, customerId: string, addressId: string) {
        const result = await this.dataSource.transaction(async (manager) => {
            await this.lockCustomer(manager, tenantId, customerId);
            const repository = manager.getRepository(CustomerAddress);
            const address = await repository.findOne({ where: { id: addressId, tenantId, customerId, deletedAt: null } });
            if (!address) throw new NotFoundException('Endereço não encontrado.');
            await repository.update(address.id, { deletedAt: new Date(), isDefault: false });
            if (address.isDefault) {
                const replacement = await repository.createQueryBuilder('candidate')
                    .where('candidate.tenant_id = :tenantId AND candidate.customer_id = :customerId', { tenantId, customerId })
                    .andWhere('candidate.deleted_at IS NULL')
                    .orderBy('candidate.last_used_at', 'DESC', 'NULLS LAST')
                    .addOrderBy('candidate.created_at', 'DESC')
                    .getOne();
                if (replacement) await repository.update(replacement.id, { isDefault: true });
            }
            await this.audit(manager, tenantId, 'DELIVERY_ADDRESS_REMOVED', { customer_id: customerId, address_id: addressId, replacement_default: Boolean(address.isDefault) });
            return { id: addressId, deleted: true };
        });
        return result;
    }

    async markUsed(tenantId: string, customerId: string, addressId: string) {
        return this.dataSource.transaction(async (manager) => {
            await this.lockCustomer(manager, tenantId, customerId);
            const repository = manager.getRepository(CustomerAddress);
            const address = await repository.createQueryBuilder('address')
                .where('address.id = :addressId AND address.tenant_id = :tenantId AND address.customer_id = :customerId', { addressId, tenantId, customerId })
                .andWhere('address.deleted_at IS NULL')
                .setLock('pessimistic_write')
                .getOne();
            if (!address) throw new NotFoundException('Endereço não encontrado.');
            const lastUsedAt = new Date();
            await repository.update({ tenantId, customerId, deletedAt: null }, { isDefault: false });
            address.isDefault = true;
            address.lastUsedAt = lastUsedAt;
            const saved = await repository.save(address);
            await this.audit(manager, tenantId, 'DELIVERY_ADDRESS_SELECTED', { customer_id: customerId, address_id: addressId });
            return this.addressView(saved);
        });
    }

    private async assertCustomer(tenantId: string, customerId: string) {
        const customer = await this.customers.findOne({ where: { id: customerId, tenantId, active: true } });
        if (!customer) throw new NotFoundException('Cliente não encontrado.');
        return customer;
    }

    private async lockCustomer(manager: any, tenantId: string, customerId: string) {
        const customer = await manager.getRepository(Customer).createQueryBuilder('customer')
            .where('customer.id = :customerId AND customer.tenant_id = :tenantId AND customer.active = TRUE', { customerId, tenantId })
            .setLock('pessimistic_write')
            .getOne();
        if (!customer) throw new NotFoundException('Cliente não encontrado.');
        return customer;
    }

    private async audit(manager: any, tenantId: string, eventType: string, metadata: Record<string, unknown>) {
        await manager.getRepository(UserAccessAuditLog).save(manager.getRepository(UserAccessAuditLog).create({
            tenantId,
            actorUserId: null,
            actorName: null,
            actorRole: null,
            targetUserId: null,
            targetUserName: null,
            eventType,
            description: 'Operação de endereço de Delivery registrada.',
            metadata,
        }));
    }

    private addressValues(dto: CreateCustomerAddressDto, tenantId: string, customerId: string, isDefault: boolean) {
        const values = this.addressPatch(dto);
        return {
            ...values,
            tenantId,
            customerId,
            confirmedAt: new Date(),
            isDefault,
            formattedAddress: this.formatAddress(values),
        };
    }

    private addressPatch(dto: CreateCustomerAddressDto | UpdateCustomerAddressDto): Partial<CustomerAddress> {
        const values: Partial<CustomerAddress> = {};
        const source = dto as Record<string, unknown>;
        const map: Record<string, keyof CustomerAddress> = {
            label: 'label', postal_code: 'postalCode', street: 'street', address_number: 'addressNumber',
            address_complement: 'addressComplement', neighborhood: 'neighborhood', city: 'city', state: 'state',
            address_reference: 'addressReference', latitude: 'latitude', longitude: 'longitude',
            postal_code_provider: 'postalCodeProvider', postal_code_provider_ref: 'postalCodeProviderRef',
            postal_code_lookup_status: 'postalCodeLookupStatus', geocode_provider: 'geocodeProvider',
            geocode_provider_id: 'geocodeProviderId', geocode_quality: 'geocodeQuality',
        };
        for (const [key, property] of Object.entries(map)) {
            if (source[key] !== undefined) (values as any)[property] = source[key];
        }
        if (values.postalCode) values.postalCode = values.postalCode.replace(/\D/g, '');
        if (values.state) values.state = values.state.toUpperCase();
        if (values.formattedAddress === undefined && this.hasRequiredAddressFields(values)) {
            values.formattedAddress = this.formatAddress(values);
        }
        return values;
    }

    private hasRequiredAddressFields(values: Partial<CustomerAddress>) {
        return Boolean(values.street && values.addressNumber && values.neighborhood && values.city && values.state && values.postalCode);
    }

    private hasAddressFieldChange(dto: UpdateCustomerAddressDto) {
        return Object.keys(dto).some((key) => !['confirmed', 'is_default'].includes(key));
    }

    private formatAddress(values: Partial<CustomerAddress>) {
        return [values.street, values.addressNumber, values.addressComplement, values.neighborhood, values.city, values.state, values.postalCode]
            .filter(Boolean).join(', ');
    }

    private customerView(customer: Customer) {
        return {
            id: customer.id,
            phone_normalized: customer.phoneNormalized,
            phone_masked: this.maskPhone(customer.phoneNormalized),
            created_at: customer.createdAt,
            updated_at: customer.updatedAt,
        };
    }

    private addressView(address: CustomerAddress) {
        return {
            id: address.id,
            customer_id: address.customerId,
            label: address.label,
            postal_code: address.postalCode,
            street: address.street,
            address_number: address.addressNumber,
            address_complement: address.addressComplement,
            neighborhood: address.neighborhood,
            city: address.city,
            state: address.state,
            address_reference: address.addressReference,
            formatted_address: address.formattedAddress,
            latitude: address.latitude,
            longitude: address.longitude,
            is_default: address.isDefault,
            last_used_at: address.lastUsedAt,
            confirmed_at: address.confirmedAt,
        };
    }

    private maskPhone(phone: string) {
        if (phone.length < 7) return '***';
        return `${phone.slice(0, 3)}*****${phone.slice(-2)}`;
    }
}
