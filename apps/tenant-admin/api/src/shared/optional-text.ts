const NULL_LIKE_OPTIONAL_TEXTS = new Set([
    '<nil>',
    'nil',
    'null',
    '<null>',
    'undefined',
]);

export function normalizeOptionalText(value: unknown, maxLength?: number): string | null {
    if (value === null || value === undefined) return null;
    const trimmed = String(value).trim();
    if (!trimmed || NULL_LIKE_OPTIONAL_TEXTS.has(trimmed.toLowerCase())) return null;
    if (Number.isFinite(maxLength) && Number(maxLength) >= 0) {
        return trimmed.slice(0, Number(maxLength));
    }
    return trimmed;
}
