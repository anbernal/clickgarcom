import { Injectable } from '@nestjs/common';

export type DeliveryWeekday = 'MON' | 'TUE' | 'WED' | 'THU' | 'FRI' | 'SAT' | 'SUN';

export type DeliveryWindow = {
    days: DeliveryWeekday[];
    start: string;
    end: string;
};

export type DeliveryPolicySettings = {
    enabled: boolean;
    timezone: string;
    auto_accept: {
        enabled: boolean;
        require_confirmed_payment: boolean;
        max_active_deliveries: number;
        preparation_minutes: number;
        windows: DeliveryWindow[];
    };
};

export type DeliveryPolicyInput = {
    now: Date;
    tenantIsActive: boolean;
    tenantIsOpen: boolean;
    addressConfirmed: boolean;
    insideServiceArea: boolean;
    itemsAvailable: boolean;
    paymentConfirmed: boolean;
    activeDeliveries: number;
    manuallyBlocked: boolean;
};

export type DeliveryPolicyCheck = {
    code: string;
    passed: boolean;
};

export type DeliveryPolicyDecision = {
    result: 'AUTO_ACCEPTED' | 'MANUAL_REQUIRED';
    reasonCode: string;
    timezone: string;
    evaluatedAt: string;
    localDateTime: string;
    checks: DeliveryPolicyCheck[];
};

const WEEKDAYS: DeliveryWeekday[] = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
const TIME_PATTERN = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

@Injectable()
export class DeliveryPolicyService {
    normalizeSettings(raw: Partial<DeliveryPolicySettings> | null | undefined): DeliveryPolicySettings {
        const source = raw || {};
        const auto = (source.auto_accept || {}) as Partial<DeliveryPolicySettings['auto_accept']>;

        return {
            enabled: source.enabled === true,
            timezone: this.normalizeTimezone(source.timezone),
            auto_accept: {
                enabled: auto.enabled === true,
                require_confirmed_payment: auto.require_confirmed_payment !== false,
                max_active_deliveries: this.normalizeCapacity(auto.max_active_deliveries),
                preparation_minutes: this.normalizePreparationMinutes(auto.preparation_minutes),
                windows: this.normalizeWindows(auto.windows || []),
            },
        };
    }

    validateSettings(raw: Partial<DeliveryPolicySettings> | null | undefined): DeliveryPolicySettings {
        const settings = this.normalizeSettings(raw);
        if (!this.isValidTimezone(settings.timezone)) {
            throw new Error(`Fuso horário inválido: ${settings.timezone}`);
        }
        if (settings.auto_accept.windows.some((window) => window.days.length === 0)) {
            throw new Error('Cada janela de aceite deve possuir ao menos um dia.');
        }
        if (this.hasOverlappingWindows(settings.auto_accept.windows)) {
            throw new Error('As janelas de aceite automático não podem se sobrepor.');
        }

        return settings;
    }

    decide(settings: DeliveryPolicySettings, input: DeliveryPolicyInput): DeliveryPolicyDecision {
        const normalized = this.validateSettings(settings);
        const local = this.toLocalParts(input.now, normalized.timezone);
        const checks: DeliveryPolicyCheck[] = [
            { code: 'DELIVERY_ENABLED', passed: normalized.enabled },
            { code: 'TENANT_INACTIVE', passed: input.tenantIsActive },
            { code: 'TENANT_CLOSED', passed: input.tenantIsOpen },
            { code: 'AUTO_ACCEPT_DISABLED', passed: normalized.auto_accept.enabled },
            { code: 'OUTSIDE_ACCEPTANCE_WINDOW', passed: this.isWithinWindow(normalized.auto_accept.windows, local) },
            { code: 'ADDRESS_NOT_GEOCODED', passed: input.addressConfirmed },
            { code: 'ADDRESS_OUTSIDE_DELIVERY_AREA', passed: input.insideServiceArea },
            { code: 'ITEMS_UNAVAILABLE', passed: input.itemsAvailable },
            {
                code: 'PAYMENT_NOT_CONFIRMED',
                passed: normalized.auto_accept.require_confirmed_payment ? input.paymentConfirmed : true,
            },
            {
                code: 'ACTIVE_DELIVERY_CAPACITY_EXCEEDED',
                passed: input.activeDeliveries < normalized.auto_accept.max_active_deliveries,
            },
            { code: 'OPERATIONAL_BLOCK', passed: !input.manuallyBlocked },
        ];
        const failed = checks.find((check) => !check.passed);

        return {
            result: failed ? 'MANUAL_REQUIRED' : 'AUTO_ACCEPTED',
            reasonCode: failed?.code || 'ALL_RULES_MATCHED',
            timezone: normalized.timezone,
            evaluatedAt: input.now.toISOString(),
            localDateTime: local.iso,
            checks,
        };
    }

    isWithinWindow(windows: DeliveryWindow[], local: { weekday: DeliveryWeekday; minutes: number }): boolean {
        return windows.some((window) => {
            if (!window.days.includes(local.weekday)) return false;
            const start = this.toMinutes(window.start);
            const end = this.toMinutes(window.end);

            if (start === end) return false;
            if (start < end) return local.minutes >= start && local.minutes < end;
            return local.minutes >= start || local.minutes < end;
        });
    }

    hasOverlappingWindows(windows: DeliveryWindow[]): boolean {
        for (const weekday of WEEKDAYS) {
            const intervals = windows
                .filter((window) => window.days.includes(weekday))
                .flatMap((window) => this.splitWindow(window));
            intervals.sort((a, b) => a.start - b.start);
            for (let index = 1; index < intervals.length; index += 1) {
                if (intervals[index].start < intervals[index - 1].end) return true;
            }
        }
        return false;
    }

    private normalizeWindows(rawWindows: unknown): DeliveryWindow[] {
        if (!Array.isArray(rawWindows)) return [];

        return rawWindows.map((raw) => {
            const candidate = (raw || {}) as Partial<DeliveryWindow>;
            const days = Array.isArray(candidate.days)
                ? Array.from(new Set(candidate.days.map((day) => String(day).toUpperCase() as DeliveryWeekday)))
                : [];
            const start = String(candidate.start || '').trim();
            const end = String(candidate.end || '').trim();
            if (days.some((day) => !WEEKDAYS.includes(day)) || !TIME_PATTERN.test(start) || !TIME_PATTERN.test(end)) {
                throw new Error('Janela de aceite possui dia ou horário inválido.');
            }
            if (start === end) throw new Error('Janela de aceite não pode ter início e fim iguais.');
            return { days, start, end };
        });
    }

    private splitWindow(window: DeliveryWindow): Array<{ start: number; end: number }> {
        const start = this.toMinutes(window.start);
        const end = this.toMinutes(window.end);
        return start < end
            ? [{ start, end }]
            : [{ start, end: 24 * 60 }, { start: 0, end }];
    }

    private toMinutes(value: string): number {
        const [hours, minutes] = value.split(':').map(Number);
        return hours * 60 + minutes;
    }

    private normalizeCapacity(value: unknown): number {
        const capacity = Number(value);
        if (!Number.isFinite(capacity)) return 8;
        return Math.min(500, Math.max(1, Math.trunc(capacity)));
    }

    private normalizePreparationMinutes(value: unknown): number {
        const parsed = Number(value);
        if (!Number.isFinite(parsed)) return 30;
        return Math.min(240, Math.max(5, Math.round(parsed)));
    }

    private normalizeTimezone(value: unknown): string {
        const timezone = String(value || 'America/Sao_Paulo').trim();
        return timezone || 'America/Sao_Paulo';
    }

    private isValidTimezone(timezone: string): boolean {
        try {
            new Intl.DateTimeFormat('en-US', { timeZone: timezone }).format();
            return true;
        } catch (_error) {
            return false;
        }
    }

    private toLocalParts(date: Date, timezone: string): { weekday: DeliveryWeekday; minutes: number; iso: string } {
        const formatter = new Intl.DateTimeFormat('en-US', {
            timeZone: timezone,
            weekday: 'short',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            hourCycle: 'h23',
        });
        const values = Object.fromEntries(formatter.formatToParts(date).map((part) => [part.type, part.value]));
        const weekday = WEEKDAYS.find((candidate) => candidate.startsWith(String(values.weekday || '').slice(0, 3).toUpperCase())) || 'SUN';
        const localDateTime = `${values.year}-${values.month}-${values.day}T${values.hour}:${values.minute}:00`;
        return { weekday, minutes: Number(values.hour) * 60 + Number(values.minute), iso: localDateTime };
    }
}
