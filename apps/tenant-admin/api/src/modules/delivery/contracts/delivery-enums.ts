/**
 * Versioned values shared by the Delivery bounded context.
 *
 * Keep these values stable: they are persisted, exposed by HTTP and sent over
 * RabbitMQ/WebSocket. Adding a value is backwards compatible; renaming or
 * removing one requires a new contract version.
 */

export enum DeliveryStatus {
    PendingRestaurantAcceptance = 'PENDING_RESTAURANT_ACCEPTANCE',
    Accepted = 'ACCEPTED',
    Preparing = 'PREPARING',
    ReadyForDispatch = 'READY_FOR_DISPATCH',
    Assigned = 'ASSIGNED',
    PickedUp = 'PICKED_UP',
    InTransit = 'IN_TRANSIT',
    Arrived = 'ARRIVED',
    Delivered = 'DELIVERED',
    Rejected = 'REJECTED',
    Canceled = 'CANCELED',
    DeliveryFailed = 'DELIVERY_FAILED',
    Returning = 'RETURNING',
    Returned = 'RETURNED',
}

/**
 * V2 fulfillment contracts. These values describe how a Delivery is executed
 * and deliberately remain separate from the production/logistics aggregate
 * status above. Legacy driver/tracking values stay available during rollout.
 */
export enum DeliveryFulfillmentMode {
    Own = 'OWN',
    External = 'EXTERNAL',
}

export enum DeliveryFulfillmentStatus {
    CapacityHeld = 'CAPACITY_HELD',
    CapacityReserved = 'CAPACITY_RESERVED',
    WaitingDispatch = 'WAITING_DISPATCH',
    Quoted = 'QUOTED',
    WaitingPreparation = 'WAITING_PREPARATION',
    AllocationPending = 'ALLOCATION_PENDING',
    Requesting = 'REQUESTING',
    CourierAssigned = 'COURIER_ASSIGNED',
    AtPickup = 'AT_PICKUP',
    InTransit = 'IN_TRANSIT',
    CycleExhausted = 'CYCLE_EXHAUSTED',
    Failed = 'FAILED',
    Canceled = 'CANCELED',
    Delivered = 'DELIVERED',
}

export enum DeliveryQuoteStatus {
    Valid = 'VALID',
    Used = 'USED',
    Expired = 'EXPIRED',
    Replaced = 'REPLACED',
    Failed = 'FAILED',
}

export enum DeliveryAttemptStatus {
    Scheduled = 'SCHEDULED',
    Requesting = 'REQUESTING',
    Succeeded = 'SUCCEEDED',
    Failed = 'FAILED',
    Ambiguous = 'AMBIGUOUS',
    Skipped = 'SKIPPED',
}

export enum DeliveryProviderCode {
    Ifood = 'IFOOD',
    UberDirect = 'UBER_DIRECT',
    Lalamove = 'LALAMOVE',
}

export enum DeliveryPricingMode {
    None = 'NONE',
    Fixed = 'FIXED',
    DistanceBands = 'DISTANCE_BANDS',
    PerKm = 'PER_KM',
    Hybrid = 'HYBRID',
}

export enum DeliveryProviderErrorCode {
    InvalidCredentials = 'INVALID_CREDENTIALS',
    AccountDisabled = 'ACCOUNT_DISABLED',
    StoreNotMapped = 'STORE_NOT_MAPPED',
    OutOfCoverage = 'OUT_OF_COVERAGE',
    OutsideOpeningHours = 'OUTSIDE_OPENING_HOURS',
    NoCourier = 'NO_COURIER',
    HighDemand = 'HIGH_DEMAND',
    QuoteExpired = 'QUOTE_EXPIRED',
    PaymentMethodUnsupported = 'PAYMENT_METHOD_UNSUPPORTED',
    RateLimited = 'RATE_LIMITED',
    Timeout = 'TIMEOUT',
    Provider5xx = 'PROVIDER_5XX',
    AmbiguousCreation = 'AMBIGUOUS_CREATION',
    CancellationRejected = 'CANCELLATION_REJECTED',
    Unknown = 'UNKNOWN_PROVIDER_ERROR',
}

export enum DeliveryAcceptanceMode {
    Auto = 'AUTO',
    Manual = 'MANUAL',
    Override = 'OVERRIDE',
}

export enum DeliveryAcceptanceResult {
    AutoAccepted = 'AUTO_ACCEPTED',
    ManualRequired = 'MANUAL_REQUIRED',
}

export enum DeliveryAcceptanceReasonCode {
    AllRulesMatched = 'ALL_RULES_MATCHED',
    DeliveryDisabled = 'DELIVERY_DISABLED',
    TenantClosed = 'TENANT_CLOSED',
    TenantInactive = 'TENANT_INACTIVE',
    AutoAcceptDisabled = 'AUTO_ACCEPT_DISABLED',
    OutsideAcceptanceWindow = 'OUTSIDE_ACCEPTANCE_WINDOW',
    AddressNotGeocoded = 'ADDRESS_NOT_GEOCODED',
    AddressAmbiguous = 'ADDRESS_AMBIGUOUS',
    AddressOutsideDeliveryArea = 'ADDRESS_OUTSIDE_DELIVERY_AREA',
    ItemsUnavailable = 'ITEMS_UNAVAILABLE',
    PaymentNotConfirmed = 'PAYMENT_NOT_CONFIRMED',
    ActiveDeliveryCapacityExceeded = 'ACTIVE_DELIVERY_CAPACITY_EXCEEDED',
    OperationalBlock = 'OPERATIONAL_BLOCK',
}

export enum DeliveryDriverAvailability {
    Offline = 'OFFLINE',
    Available = 'AVAILABLE',
    Busy = 'BUSY',
    Paused = 'PAUSED',
}

export enum DeliveryRejectionReason {
    OutOfArea = 'OUT_OF_AREA',
    ItemsUnavailable = 'ITEMS_UNAVAILABLE',
    PaymentFailed = 'PAYMENT_FAILED',
    RestaurantClosed = 'RESTAURANT_CLOSED',
    CustomerRequested = 'CUSTOMER_REQUESTED',
    DuplicateOrder = 'DUPLICATE_ORDER',
    Other = 'OTHER',
}

export enum DeliveryCancellationReason {
    CustomerRequested = 'CUSTOMER_REQUESTED',
    RestaurantRequested = 'RESTAURANT_REQUESTED',
    PaymentFailed = 'PAYMENT_FAILED',
    DuplicateOrder = 'DUPLICATE_ORDER',
    OperationalBlock = 'OPERATIONAL_BLOCK',
    Other = 'OTHER',
}

export enum DeliveryExceptionReason {
    CustomerAbsent = 'CUSTOMER_ABSENT',
    WrongAddress = 'WRONG_ADDRESS',
    CustomerRefused = 'CUSTOMER_REFUSED',
    AccidentOrIssue = 'ACCIDENT_OR_ISSUE',
    DamagedOrder = 'DAMAGED_ORDER',
    VehicleIssue = 'VEHICLE_ISSUE',
    Other = 'OTHER',
}

export enum DeliveryOverrideReason {
    CustomerCouldNotProvidePin = 'CUSTOMER_COULD_NOT_PROVIDE_PIN',
    PinDeliveryFailure = 'PIN_DELIVERY_FAILURE',
    CustomerIdentityConfirmed = 'CUSTOMER_IDENTITY_CONFIRMED',
    OperationalException = 'OPERATIONAL_EXCEPTION',
    Other = 'OTHER',
}

export enum DeliveryLocationSampleReason {
    Interval = 'INTERVAL',
    Distance = 'DISTANCE',
    Status = 'STATUS',
    Final = 'FINAL',
}

export enum DeliveryActorType {
    System = 'SYSTEM',
    User = 'USER',
    Driver = 'DRIVER',
    Customer = 'CUSTOMER',
    InternalService = 'INTERNAL_SERVICE',
    Dispatcher = 'DISPATCHER',
}

export enum DeliveryEventType {
    Created = 'delivery.created.v1',
    Accepted = 'delivery.accepted.v1',
    ManualAcceptanceRequired = 'delivery.manual_acceptance_required.v1',
    ReadyForDispatch = 'delivery.ready_for_dispatch.v1',
    Assigned = 'delivery.assigned.v1',
    PickedUp = 'delivery.picked_up.v1',
    StatusChanged = 'delivery.status_changed.v1',
    LocationUpdated = 'delivery.location_updated.v1',
    Arrived = 'delivery.arrived.v1',
    Completed = 'delivery.completed.v1',
    ExceptionOpened = 'delivery.exception_opened.v1',
    Returned = 'delivery.returned.v1',
    TrackingAccessCreated = 'delivery.tracking_access_created.v1',
    DriverAvailabilityChanged = 'delivery.driver_availability_changed.v1',
    CustomerAddressCreated = 'delivery.customer_address_created.v1',
    CustomerAddressUpdated = 'delivery.customer_address_updated.v1',
    CustomerAddressDeleted = 'delivery.customer_address_deleted.v1',
    QuoteCreated = 'delivery.quote_created.v1',
    QuoteReplaced = 'delivery.quote_replaced.v1',
    OwnCapacityHeld = 'delivery.own_capacity_held.v1',
    OwnCapacityReserved = 'delivery.own_capacity_reserved.v1',
    OwnCapacityReleased = 'delivery.own_capacity_released.v1',
    FulfillmentCreated = 'delivery.fulfillment_created.v1',
    ProviderCycleStarted = 'delivery.provider_cycle_started.v1',
    ProviderAttemptFailed = 'delivery.provider_attempt_failed.v1',
    ProviderAssigned = 'delivery.provider_assigned.v1',
    ProviderCycleExhausted = 'delivery.provider_cycle_exhausted.v1',
    FulfillmentChanged = 'delivery.fulfillment_changed.v1',
    TrackingAvailable = 'delivery.tracking_available.v1',
}

/** All status transitions allowed by the v1 domain state machine. */
export const DELIVERY_STATUS_TRANSITIONS: Readonly<Record<DeliveryStatus, readonly DeliveryStatus[]>> = {
    [DeliveryStatus.PendingRestaurantAcceptance]: [
        DeliveryStatus.Accepted,
        DeliveryStatus.Rejected,
        DeliveryStatus.Canceled,
    ],
    [DeliveryStatus.Accepted]: [
        DeliveryStatus.Preparing,
        DeliveryStatus.Canceled,
    ],
    [DeliveryStatus.Preparing]: [
        DeliveryStatus.ReadyForDispatch,
        DeliveryStatus.Canceled,
    ],
    [DeliveryStatus.ReadyForDispatch]: [
        DeliveryStatus.Assigned,
        DeliveryStatus.InTransit,
        DeliveryStatus.Canceled,
    ],
    [DeliveryStatus.Assigned]: [
        DeliveryStatus.ReadyForDispatch,
        DeliveryStatus.PickedUp,
        DeliveryStatus.Canceled,
    ],
    [DeliveryStatus.PickedUp]: [
        DeliveryStatus.InTransit,
        DeliveryStatus.DeliveryFailed,
    ],
    [DeliveryStatus.InTransit]: [
        DeliveryStatus.Arrived,
        DeliveryStatus.Delivered,
        DeliveryStatus.DeliveryFailed,
        DeliveryStatus.Returning,
    ],
    [DeliveryStatus.Arrived]: [
        DeliveryStatus.Delivered,
        DeliveryStatus.DeliveryFailed,
        DeliveryStatus.Returning,
    ],
    [DeliveryStatus.Delivered]: [],
    [DeliveryStatus.Rejected]: [],
    [DeliveryStatus.Canceled]: [],
    [DeliveryStatus.DeliveryFailed]: [
        DeliveryStatus.Assigned,
        DeliveryStatus.Returning,
        DeliveryStatus.Canceled,
    ],
    [DeliveryStatus.Returning]: [DeliveryStatus.Returned],
    [DeliveryStatus.Returned]: [],
};

export const DELIVERY_TERMINAL_STATUSES: readonly DeliveryStatus[] = [
    DeliveryStatus.Delivered,
    DeliveryStatus.Rejected,
    DeliveryStatus.Canceled,
    DeliveryStatus.Returned,
];

export function canTransitionDeliveryStatus(from: DeliveryStatus, to: DeliveryStatus): boolean {
    return DELIVERY_STATUS_TRANSITIONS[from]?.includes(to) ?? false;
}
