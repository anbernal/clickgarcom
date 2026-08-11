import { Injectable } from '@nestjs/common';

export type DeliveryFeeMode = 'NONE' | 'FIXED' | 'DISTANCE_BANDS' | 'PER_KM' | 'HYBRID';

export type DeliveryRoundingMode = 'NONE' | 'CEIL_0_5_KM' | 'CEIL_1_KM';

export type DeliveryFeeBand = {
    from_km?: number;
    up_to_km: number;
    fee: number;
};

export type DeliverySurcharge = {
    code: string;
    mode: 'FIXED' | 'PERCENT';
    amount: number;
    enabled: boolean;
};

export type DeliveryFeeSettings = {
    mode: DeliveryFeeMode;
    fixed_fee: number;
    bands: DeliveryFeeBand[];
    included_km: number;
    price_per_km: number;
    minimum_fee: number;
    rounding_mode: DeliveryRoundingMode;
    surcharges: DeliverySurcharge[];
};

export type DeliveryFeeQuote = {
    amount: number;
    mode: DeliveryFeeMode;
    distance_km: number | null;
    rule: Record<string, unknown>;
};

@Injectable()
export class DeliveryFeeService {
    normalize(raw: unknown): DeliveryFeeSettings {
        const source = (raw || {}) as Record<string, unknown>;
        const mode = String(source.mode || 'NONE').toUpperCase() as DeliveryFeeMode;
        const fixedFee = this.money(source.fixed_fee, 0);
        const bands = Array.isArray(source.bands)
            ? source.bands.map((band) => {
                const item = (band || {}) as Record<string, unknown>;
                return {
                    from_km: Number.isFinite(Number(item.from_km)) ? Number(item.from_km) : undefined,
                    up_to_km: Number(item.up_to_km),
                    fee: this.money(item.fee, 0),
                };
            })
            : [];
        const surcharges = Array.isArray(source.surcharges)
            ? source.surcharges.map((raw) => {
                const item = (raw || {}) as Record<string, unknown>;
                return {
                    code: String(item.code || 'SURCHARGE').slice(0, 80),
                    mode: String(item.mode || 'FIXED').toUpperCase() as DeliverySurcharge['mode'],
                    amount: this.money(item.amount, 0),
                    enabled: item.enabled !== false,
                };
            })
            : [];
        return {
            mode,
            fixed_fee: fixedFee,
            bands,
            included_km: this.number(source.included_km, 0),
            price_per_km: this.money(source.price_per_km, 0),
            minimum_fee: this.money(source.minimum_fee, 0),
            rounding_mode: String(source.rounding_mode || 'NONE').toUpperCase() as DeliveryRoundingMode,
            surcharges,
        };
    }

    validate(raw: unknown): DeliveryFeeSettings {
        const settings = this.normalize(raw);
        if (!['NONE', 'FIXED', 'DISTANCE_BANDS', 'PER_KM', 'HYBRID'].includes(settings.mode)) {
            throw new Error('Modo de taxa de entrega inválido.');
        }
        if (settings.fixed_fee < 0 || settings.fixed_fee > 10000) {
            throw new Error('Taxa fixa de entrega inválida.');
        }
        if (settings.mode === 'DISTANCE_BANDS' && settings.bands.length === 0) {
            throw new Error('Informe ao menos uma faixa de distância.');
        }
        if (settings.included_km < 0 || settings.included_km > 500) throw new Error('Quilometragem incluída inválida.');
        if (settings.price_per_km < 0 || settings.price_per_km > 10000) throw new Error('Preço por quilômetro inválido.');
        if (settings.minimum_fee < 0 || settings.minimum_fee > 10000) throw new Error('Valor mínimo de entrega inválido.');
        if (!['NONE', 'CEIL_0_5_KM', 'CEIL_1_KM'].includes(settings.rounding_mode)) throw new Error('Arredondamento de distância inválido.');
        if (['PER_KM', 'HYBRID'].includes(settings.mode) && settings.price_per_km === 0 && settings.fixed_fee === 0 && settings.minimum_fee === 0) {
            throw new Error('Informe uma taxa base, preço por quilômetro ou mínimo para o modo selecionado.');
        }
        let previous = 0;
        for (const band of settings.bands) {
            const from = band.from_km === undefined ? previous : band.from_km;
            if (!Number.isFinite(from) || from !== previous || !Number.isFinite(band.up_to_km) || band.up_to_km <= from || band.up_to_km > 500) {
                throw new Error('Faixas de distância devem ser crescentes e estar entre 0 e 500 km.');
            }
            if (band.fee < 0 || band.fee > 10000) throw new Error('Taxa de faixa inválida.');
            previous = band.up_to_km;
        }
        for (const surcharge of settings.surcharges) {
            if (!['FIXED', 'PERCENT'].includes(surcharge.mode)) throw new Error('Tipo de adicional inválido.');
            if (surcharge.amount < 0 || surcharge.amount > (surcharge.mode === 'PERCENT' ? 100 : 10000)) {
                throw new Error('Valor de adicional inválido.');
            }
        }
        if (settings.mode === 'FIXED' && settings.fixed_fee === 0) {
            return { ...settings, mode: 'NONE' };
        }
        return settings;
    }

    quote(distanceMeters: number | null | undefined, raw: unknown): DeliveryFeeQuote {
        const settings = this.validate(raw);
        const rawDistanceKm = Number.isFinite(Number(distanceMeters)) && Number(distanceMeters) >= 0
            ? Number(distanceMeters) / 1000
            : null;
        const distanceKm = rawDistanceKm === null ? null : this.roundDistance(rawDistanceKm, settings.rounding_mode);
        if (settings.mode === 'NONE') {
            return { amount: 0, mode: 'NONE', distance_km: distanceKm, rule: { mode: 'NONE' } };
        }
        if (settings.mode === 'FIXED') {
            return this.result(settings.fixed_fee, settings, distanceKm, { mode: 'FIXED', fixed_fee: settings.fixed_fee });
        }
        if (distanceKm === null) {
            return { amount: 0, mode: settings.mode, distance_km: null, rule: { mode: settings.mode, status: 'UNQUOTED', bands: settings.bands } };
        }
        if (settings.mode === 'DISTANCE_BANDS') {
            const band = settings.bands.find((candidate) => distanceKm > (candidate.from_km ?? 0) && distanceKm <= candidate.up_to_km || distanceKm === (candidate.from_km ?? 0));
            if (!band) {
                return { amount: 0, mode: settings.mode, distance_km: distanceKm, rule: { mode: settings.mode, status: 'OUT_OF_RANGE', bands: settings.bands } };
            }
            return this.result(band.fee, settings, distanceKm, { mode: settings.mode, band, bands: settings.bands });
        }
        const chargeableKm = Math.max(0, distanceKm - settings.included_km);
        const perKmSubtotal = settings.fixed_fee + chargeableKm * settings.price_per_km;
        const band = settings.bands.find((candidate) => distanceKm > (candidate.from_km ?? 0) && distanceKm <= candidate.up_to_km || distanceKm === (candidate.from_km ?? 0));
        const base = settings.mode === 'HYBRID' && band ? Math.max(perKmSubtotal, band.fee) : perKmSubtotal;
        const subtotal = Math.max(settings.minimum_fee, base);
        const surchargeTotal = settings.surcharges.filter((item) => item.enabled).reduce((sum, item) => sum + (item.mode === 'PERCENT' ? subtotal * item.amount / 100 : item.amount), 0);
        return this.result(subtotal + surchargeTotal, settings, distanceKm, {
            mode: settings.mode,
            fixed_fee: settings.fixed_fee,
            included_km: settings.included_km,
            price_per_km: settings.price_per_km,
            chargeable_km: chargeableKm,
            minimum_fee: settings.minimum_fee,
            band,
            surcharges: settings.surcharges,
        });
    }

    private money(value: unknown, fallback: number): number {
        const parsed = Number(value);
        if (!Number.isFinite(parsed)) return fallback;
        return Math.round(parsed * 100) / 100;
    }

    private number(value: unknown, fallback: number): number {
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : fallback;
    }

    private roundDistance(distanceKm: number, mode: DeliveryRoundingMode): number {
        if (mode === 'CEIL_0_5_KM') return Math.ceil(distanceKm * 2) / 2;
        if (mode === 'CEIL_1_KM') return Math.ceil(distanceKm);
        return Math.round(distanceKm * 100) / 100;
    }

    private result(amount: number, settings: DeliveryFeeSettings, distanceKm: number | null, rule: Record<string, unknown>): DeliveryFeeQuote {
        return {
            amount: this.money(amount, 0),
            mode: settings.mode,
            distance_km: distanceKm,
            rule: { ...rule, rounding_mode: settings.rounding_mode, formula_version: 1 },
        };
    }
}
