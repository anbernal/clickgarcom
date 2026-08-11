import { ConflictException, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { createCipheriv, randomBytes } from 'crypto';
import { Repository } from 'typeorm';

import { DeliveryProviderConfig } from '../../entities/delivery-provider-config.entity';
import { DeliveryProviderCredential } from '../../entities/delivery-provider-credential.entity';
import { UserAccessAuditLog } from '../../entities/user-access-audit-log.entity';
import { SaveDeliveryProviderCredentialsDto, UpdateDeliveryProviderConfigDto } from './dto/delivery-provider-config.dto';

@Injectable()
export class DeliveryProviderConfigService {
    constructor(
        @InjectRepository(DeliveryProviderConfig) private readonly configs: Repository<DeliveryProviderConfig>,
        @InjectRepository(DeliveryProviderCredential) private readonly credentials: Repository<DeliveryProviderCredential>,
        @InjectRepository(UserAccessAuditLog) private readonly auditRepository: Repository<UserAccessAuditLog>,
    ) { }

    async list(tenantId: string) {
        const configs = await this.configs.find({ where: { tenantId }, order: { priority: 'ASC', provider: 'ASC' } });
        return configs.map((config) => this.view(config));
    }

    async upsert(tenantId: string, provider: string, dto: UpdateDeliveryProviderConfigDto) {
        const normalizedProvider = this.normalizeProvider(provider);
        const environment = dto.environment || 'PRODUCTION';
        let config = await this.configs.findOne({ where: { tenantId, provider: normalizedProvider, environment } });
        if (!config) config = this.configs.create({ tenantId, provider: normalizedProvider, environment });
        Object.assign(config, {
            enabled: dto.enabled ?? config.enabled,
            priority: dto.priority ?? config.priority,
            externalMerchantId: dto.external_merchant_id ?? config.externalMerchantId,
            connectionStatus: config.connectionStatus || 'NOT_TESTED',
        });
        const saved = await this.configs.save(config);
        await this.auditRepository.save(this.auditRepository.create({
            tenantId,
            actorUserId: null,
            actorName: null,
            actorRole: null,
            targetUserId: null,
            targetUserName: null,
            eventType: 'DELIVERY_PROVIDER_CONFIG_UPDATED',
            description: 'Configuração do operador de Delivery atualizada.',
            metadata: { provider: normalizedProvider, environment, enabled: saved.enabled, priority: saved.priority },
        }));
        return this.view(saved);
    }

    async saveCredentials(tenantId: string, provider: string, dto: SaveDeliveryProviderCredentialsDto) {
        const normalizedProvider = this.normalizeProvider(provider);
        const config = await this.configs.findOne({ where: { tenantId, provider: normalizedProvider, environment: 'PRODUCTION' } });
        if (!config) throw new NotFoundException('Configure o operador antes de salvar as credenciais.');
        const key = this.encryptionKey();
        const nonce = randomBytes(12);
        const cipher = createCipheriv('aes-256-gcm', key, nonce);
        const plaintext = Buffer.from(JSON.stringify(dto.credentials), 'utf8');
        const encryptedPayload = Buffer.concat([cipher.update(plaintext), cipher.final()]);
        const authTag = cipher.getAuthTag();
        const previous = await this.credentials.findOne({ where: { tenantId, providerConfigId: config.id } });
        if (previous) {
            previous.encryptedPayload = encryptedPayload;
            previous.nonce = nonce;
            previous.authTag = authTag;
            previous.keyVersion = dto.key_version || process.env.DELIVERY_CREDENTIAL_KEY_VERSION || 'v1';
            previous.rotatedAt = new Date();
            previous.revokedAt = null;
            await this.credentials.save(previous);
        } else {
            await this.credentials.save(this.credentials.create({
                tenantId,
                providerConfigId: config.id,
                encryptedPayload,
                nonce,
                authTag,
                keyVersion: dto.key_version || process.env.DELIVERY_CREDENTIAL_KEY_VERSION || 'v1',
                rotatedAt: null,
                revokedAt: null,
            }));
        }
        config.credentialRef = `delivery-provider-credential:${config.id}`;
        config.connectionStatus = 'NOT_TESTED';
        config.lastErrorCode = null;
        await this.configs.save(config);
        await this.auditRepository.save(this.auditRepository.create({
            tenantId,
            actorUserId: null,
            actorName: null,
            actorRole: null,
            targetUserId: null,
            targetUserName: null,
            eventType: 'DELIVERY_PROVIDER_CREDENTIAL_ROTATED',
            description: 'Credencial do operador de Delivery rotacionada.',
            metadata: { provider: normalizedProvider, key_version: dto.key_version || process.env.DELIVERY_CREDENTIAL_KEY_VERSION || 'v1' },
        }));
        return this.view(config);
    }

    async revokeCredentials(tenantId: string, provider: string) {
        const config = await this.configs.findOne({ where: { tenantId, provider: this.normalizeProvider(provider), environment: 'PRODUCTION' } });
        if (!config) throw new NotFoundException('Operador não encontrado.');
        const credential = await this.credentials.findOne({ where: { tenantId, providerConfigId: config.id } });
        if (!credential) throw new NotFoundException('Credencial não encontrada.');
        credential.revokedAt = new Date();
        await this.credentials.save(credential);
        config.connectionStatus = 'NOT_TESTED';
        config.credentialRef = null;
        await this.configs.save(config);
        await this.auditRepository.save(this.auditRepository.create({
            tenantId,
            actorUserId: null,
            actorName: null,
            actorRole: null,
            targetUserId: null,
            targetUserName: null,
            eventType: 'DELIVERY_PROVIDER_CREDENTIAL_REVOKED',
            description: 'Credencial do operador de Delivery revogada.',
            metadata: { provider: this.normalizeProvider(provider) },
        }));
        return this.view(config);
    }

    async testConnection(tenantId: string, provider: string) {
        const normalizedProvider = this.normalizeProvider(provider);
        const config = await this.configs.findOne({ where: { tenantId, provider: normalizedProvider }, order: { priority: 'ASC' } });
        if (!config) throw new NotFoundException('Configure o operador antes de testar a conexão.');
        const testedAt = new Date();
        if (!config.credentialRef) {
            config.connectionStatus = 'NOT_CONFIGURED';
            config.lastErrorCode = 'CREDENTIAL_MISSING';
            config.lastTestedAt = testedAt;
            await this.configs.save(config);
            await this.auditRepository.save(this.auditRepository.create({
                tenantId, actorUserId: null, actorName: null, actorRole: null, targetUserId: null, targetUserName: null,
                eventType: 'DELIVERY_PROVIDER_CONNECTION_TESTED',
                description: 'Teste de conexão do operador sem credencial configurada.',
                metadata: { provider: normalizedProvider, environment: config.environment, ok: false, error_code: 'CREDENTIAL_MISSING' },
            }));
            return { ...this.view(config), ok: false, tested_at: testedAt.toISOString(), error_code: 'CREDENTIAL_MISSING' };
        }
        // O adapter ativo nesta fase é fake determinístico: valida o wiring sem chamada externa.
        config.connectionStatus = 'CONNECTED';
        config.lastErrorCode = null;
        config.lastTestedAt = testedAt;
        await this.configs.save(config);
        await this.auditRepository.save(this.auditRepository.create({
            tenantId, actorUserId: null, actorName: null, actorRole: null, targetUserId: null, targetUserName: null,
            eventType: 'DELIVERY_PROVIDER_CONNECTION_TESTED',
            description: 'Teste de conexão do operador concluído pelo adapter local.',
            metadata: { provider: normalizedProvider, environment: config.environment, ok: true, adapter: 'FAKE' },
        }));
        return { ...this.view(config), ok: true, tested_at: testedAt.toISOString(), adapter: 'FAKE' };
    }

    private normalizeProvider(provider: string) {
        const value = String(provider || '').toUpperCase();
        if (value !== 'IFOOD') throw new ConflictException('Operador externo não suportado neste módulo.');
        return value;
    }

    private encryptionKey() {
        const raw = String(process.env.DELIVERY_CREDENTIAL_ENCRYPTION_KEY || '').trim();
        if (!raw) throw new ServiceUnavailableException('Criptografia de credenciais não configurada.');
        const key = /^[0-9a-f]{64}$/i.test(raw) ? Buffer.from(raw, 'hex') : Buffer.from(raw, 'base64');
        if (key.length !== 32) throw new ServiceUnavailableException('Chave de criptografia de credenciais inválida.');
        return key;
    }

    private view(config: DeliveryProviderConfig) {
        return {
            id: config.id,
            provider: config.provider,
            environment: config.environment,
            enabled: config.enabled,
            priority: config.priority,
            external_merchant_id: config.externalMerchantId,
            credential_configured: Boolean(config.credentialRef),
            connection_status: config.connectionStatus,
            last_tested_at: config.lastTestedAt,
            last_error_code: config.lastErrorCode,
        };
    }
}
