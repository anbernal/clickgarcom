import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { AmqpModule } from '../amqp/amqp.module';

import { Tenant } from '../../entities/tenant.entity';
import { UserAccessAuditLog } from '../../entities/user-access-audit-log.entity';
import { DeliveryPolicyService } from './delivery-policy.service';
import { DeliverySettingsController } from './delivery-settings.controller';
import { DeliverySettingsService } from './delivery-settings.service';
import { Delivery } from '../../entities/delivery.entity';
import { DeliveryEvent } from '../../entities/delivery-event.entity';
import { DeliveryLocationSample } from '../../entities/delivery-location-sample.entity';
import { DeliveryTrackingCredential } from '../../entities/delivery-tracking-credential.entity';
import { DeliveryCommandIdempotency } from '../../entities/delivery-command-idempotency.entity';
import { DeliveryPinChallenge } from '../../entities/delivery-pin-challenge.entity';
import { DomainOutboxEvent } from '../../entities/domain-outbox-event.entity';
import { OrderBatch } from '../../entities/order-batch.entity';
import { Order } from '../../entities/order.entity';
import { User } from '../../entities/user.entity';
import { DeliveryController } from './delivery.controller';
import { DeliveryInternalController } from './delivery-internal.controller';
import { DeliveryService } from './delivery.service';
import { DeliveryPinService } from './delivery-pin.service';
import { DeliveryNotificationService } from './delivery-notification.service';
import { DeliveryDriverController } from './delivery-driver.controller';
import { DeliveryTrackingAdminController, DeliveryTrackingPublicController } from './delivery-tracking.controller';
import { DeliveryTrackingService } from './delivery-tracking.service';
import { DeliveryMaintenanceService } from './delivery-maintenance.service';
import { DeliveryReportsController } from './delivery-reports.controller';
import { DeliveryReportsService } from './delivery-reports.service';
import { DeliveryFeeService } from './delivery-fee.service';
import { DeliveryEtaService } from './delivery-eta.service';
import { DeliveryLocationService } from './delivery-location.service';
import { DeliveryRedisMaintenanceAdapter } from './delivery-redis-maintenance.adapter';
import { DELIVERY_REDIS_MAINTENANCE } from './delivery-maintenance.service';
import { DELIVERY_MAPS_PROVIDER } from './maps/maps-provider';
import { FakeDeliveryMapsProvider } from './maps/fake-maps.provider';
import { HttpDeliveryMapsProvider } from './maps/http-maps.provider';
import { Customer } from '../../entities/customer.entity';
import { CustomerAddress } from '../../entities/customer-address.entity';
import { DeliveryProviderConfig } from '../../entities/delivery-provider-config.entity';
import { DeliveryProviderCredential } from '../../entities/delivery-provider-credential.entity';
import { DeliveryQuote } from '../../entities/delivery-quote.entity';
import { DeliveryFulfillment } from '../../entities/delivery-fulfillment.entity';
import { DeliveryProviderAttempt } from '../../entities/delivery-provider-attempt.entity';
import { DeliveryOwnCapacityReservation } from '../../entities/delivery-own-capacity-reservation.entity';
import { DeliveryProviderWebhookInbox } from '../../entities/delivery-provider-webhook-inbox.entity';
import { DeliveryCustomerService } from './delivery-customer.service';
import { DeliveryCustomerController } from './delivery-customer.controller';
import { DeliveryCustomerInternalController } from './delivery-customer-internal.controller';
import { DeliveryPostalCodeController, DeliveryPostalCodeInternalController } from './delivery-postal-code.controller';
import { DeliveryPostalCodeService } from './postal-code/delivery-postal-code.service';
import { DELIVERY_POSTAL_CODE_PROVIDER } from './postal-code/postal-code-provider';
import { FakeDeliveryPostalCodeProvider } from './postal-code/fake-postal-code.provider';
import { HttpDeliveryPostalCodeProvider } from './postal-code/http-postal-code.provider';
import { DeliveryAddressGeocodeService } from './delivery-address-geocode.service';
import { DeliveryProviderConfigService } from './delivery-provider-config.service';
import { DeliveryProviderConfigController } from './delivery-provider-config.controller';
import { DeliveryAddressSnapshotService } from './delivery-address-snapshot.service';
import { DeliveryCapacityService } from './delivery-capacity.service';
import { DeliveryCapacityController, DeliveryCapacityInternalController } from './delivery-capacity.controller';
import { DELIVERY_PROVIDER } from './providers/delivery-provider';
import { FakeDeliveryProvider } from './providers/fake-delivery.provider';
import { DeliveryQuoteService } from './delivery-quote.service';
import { DeliveryQuoteController, DeliveryQuoteInternalController } from './delivery-quote.controller';
import { DeliveryFulfillmentService } from './delivery-fulfillment.service';
import { DeliveryFulfillmentController, DeliveryFulfillmentInternalController } from './delivery-fulfillment.controller';
import { DeliveryCheckoutService } from './delivery-checkout.service';
import { DeliveryCheckoutController, DeliveryCheckoutInternalController } from './delivery-checkout.controller';
import { DeliveryWebhookService } from './delivery-webhook.service';
import { DeliveryWebhookController } from './delivery-webhook.controller';
import { DeliveryCheckout } from '../../entities/delivery-checkout.entity';
import { DeliveryOutboxRelayService } from './delivery-outbox-relay.service';

@Module({
    imports: [AmqpModule, TypeOrmModule.forFeature([
        Tenant,
        UserAccessAuditLog,
        Delivery,
        DeliveryEvent,
        DeliveryLocationSample,
        DeliveryTrackingCredential,
        DeliveryCommandIdempotency,
        DeliveryPinChallenge,
        DomainOutboxEvent,
        OrderBatch,
        Order,
        User,
        Customer,
        CustomerAddress,
        DeliveryProviderConfig,
        DeliveryProviderCredential,
        DeliveryQuote,
        DeliveryFulfillment,
        DeliveryProviderAttempt,
        DeliveryOwnCapacityReservation,
        DeliveryProviderWebhookInbox,
        DeliveryCheckout,
    ])],
    controllers: [DeliverySettingsController, DeliveryController, DeliveryInternalController, DeliveryCustomerController, DeliveryCustomerInternalController, DeliveryPostalCodeController, DeliveryPostalCodeInternalController, DeliveryProviderConfigController, DeliveryCapacityController, DeliveryCapacityInternalController, DeliveryQuoteController, DeliveryQuoteInternalController, DeliveryFulfillmentController, DeliveryFulfillmentInternalController, DeliveryCheckoutController, DeliveryCheckoutInternalController, DeliveryWebhookController, DeliveryDriverController, DeliveryTrackingAdminController, DeliveryTrackingPublicController, DeliveryReportsController],
    providers: [
        DeliveryPolicyService,
        DeliverySettingsService,
        DeliveryService,
        DeliveryPinService,
        DeliveryNotificationService,
        DeliveryTrackingService,
        DeliveryMaintenanceService,
        DeliveryReportsService,
        DeliveryFeeService,
        DeliveryEtaService,
        DeliveryLocationService,
        DeliveryCustomerService,
        DeliveryPostalCodeService,
        DeliveryAddressGeocodeService,
        DeliveryProviderConfigService,
        DeliveryAddressSnapshotService,
        DeliveryCapacityService,
        DeliveryQuoteService,
        DeliveryFulfillmentService,
        DeliveryCheckoutService,
        DeliveryWebhookService,
        DeliveryOutboxRelayService,
        FakeDeliveryProvider,
        {
            provide: DELIVERY_PROVIDER,
            // V2 usa o fake determinístico até a homologação oficial do iFood.
            // O domínio não deve depender de HTTP real durante o desenvolvimento.
            useExisting: FakeDeliveryProvider,
        },
        FakeDeliveryPostalCodeProvider,
        HttpDeliveryPostalCodeProvider,
        {
            provide: DELIVERY_POSTAL_CODE_PROVIDER,
            inject: [ConfigService, FakeDeliveryPostalCodeProvider, HttpDeliveryPostalCodeProvider],
            useFactory: (config: ConfigService, fake: FakeDeliveryPostalCodeProvider, http: HttpDeliveryPostalCodeProvider) =>
                String(config.get('DELIVERY_POSTAL_CODE_PROVIDER') || 'http').toLowerCase() === 'fake' ? fake : http,
        },
        DeliveryRedisMaintenanceAdapter,
        {
            provide: DELIVERY_REDIS_MAINTENANCE,
            inject: [DeliveryRedisMaintenanceAdapter],
            useFactory: (adapter: DeliveryRedisMaintenanceAdapter) => adapter,
        },
        FakeDeliveryMapsProvider,
        HttpDeliveryMapsProvider,
        {
            provide: DELIVERY_MAPS_PROVIDER,
            inject: [ConfigService, FakeDeliveryMapsProvider, HttpDeliveryMapsProvider],
            useFactory: (config: ConfigService, fake: FakeDeliveryMapsProvider, http: HttpDeliveryMapsProvider) =>
                String(config.get('DELIVERY_MAPS_PROVIDER') || 'fake').toLowerCase() === 'http' ? http : fake,
        },
    ],
    exports: [DeliveryPolicyService, DeliverySettingsService, DeliveryService, DeliveryTrackingService, DeliveryPinService, DeliveryNotificationService, DeliveryReportsService, DeliveryCustomerService],
})
export class DeliveryModule { }
