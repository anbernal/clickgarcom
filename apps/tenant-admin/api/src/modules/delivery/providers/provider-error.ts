import { DeliveryProviderError } from './delivery-provider';

export function normalizeDeliveryProviderError(error: unknown): DeliveryProviderError {
    const message = error instanceof Error ? error.message : 'Falha desconhecida no operador externo.';
    const normalized = message.toLowerCase();
    if (normalized.includes('timeout')) return { code: 'TIMEOUT', retryable: true, message: 'O operador demorou para responder.' };
    if (normalized.includes('not found')) return { code: 'NOT_FOUND', retryable: false, message: 'Entrega não encontrada no operador.' };
    if (normalized.includes('rate')) return { code: 'RATE_LIMITED', retryable: true, message: 'Limite temporário do operador atingido.' };
    return { code: 'UNKNOWN_PROVIDER_ERROR', retryable: true, message: 'Não foi possível concluir a comunicação com o operador.' };
}
