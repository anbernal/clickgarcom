import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import {
    BotFlowDefinition,
    BotFlowDefinitionStatus,
} from '../../entities/bot-flow-definition.entity';
import { getDefaultBotFlowDefinition } from '../../shared/bot-flow-definitions';

@Injectable()
export class BotConfigService {
    constructor(
        @InjectRepository(BotFlowDefinition)
        private readonly botFlowRepository: Repository<BotFlowDefinition>,
    ) { }

    async listPublishedFlows(tenantId: string, channel?: string) {
        const normalizedChannel = this.normalizeChannel(channel);

        const flows = await this.botFlowRepository.find({
            where: {
                tenantId,
                channel: normalizedChannel,
                status: BotFlowDefinitionStatus.PUBLISHED,
            },
            order: {
                key: 'ASC',
                version: 'DESC',
            },
        });

        return {
            tenant_id: tenantId,
            channel: normalizedChannel,
            flows,
        };
    }

    async getPublishedFlow(tenantId: string, key: string, channel?: string) {
        const normalizedChannel = this.normalizeChannel(channel);
        const normalizedKey = this.normalizeKey(key);

        const flow = await this.botFlowRepository.findOne({
            where: {
                tenantId,
                key: normalizedKey,
                channel: normalizedChannel,
                status: BotFlowDefinitionStatus.PUBLISHED,
            },
            order: {
                version: 'DESC',
            },
        });

        if (!flow) {
            throw new HttpException('Flow publicado não encontrado.', HttpStatus.NOT_FOUND);
        }

        return flow;
    }

    async getDefaultFlow(key: string) {
        const normalizedKey = this.normalizeKey(key);
        const definition = getDefaultBotFlowDefinition(normalizedKey);

        if (!definition) {
            throw new HttpException('Default flow não encontrado.', HttpStatus.NOT_FOUND);
        }

        return {
            key: normalizedKey,
            definition,
        };
    }

    async publishFlow(
        tenantId: string,
        key: string,
        channel: string | undefined,
        payload: any,
        actorId?: string,
    ) {
        const normalizedChannel = this.normalizeChannel(channel);
        const normalizedKey = this.normalizeKey(key);
        const definition = this.normalizeDefinition(
            payload?.definition ?? getDefaultBotFlowDefinition(normalizedKey),
        );

        return this.botFlowRepository.manager.transaction(async (manager) => {
            const currentPublished = await manager.findOne(BotFlowDefinition, {
                where: {
                    tenantId,
                    key: normalizedKey,
                    channel: normalizedChannel,
                    status: BotFlowDefinitionStatus.PUBLISHED,
                },
                order: {
                    version: 'DESC',
                },
            });

            const latestVersion = await manager.findOne(BotFlowDefinition, {
                where: {
                    tenantId,
                    key: normalizedKey,
                    channel: normalizedChannel,
                },
                order: {
                    version: 'DESC',
                },
            });

            if (currentPublished) {
                currentPublished.status = BotFlowDefinitionStatus.ARCHIVED;
                currentPublished.updatedBy = actorId || null;
                await manager.save(currentPublished);
            }

            const now = new Date();
            const nextVersion = latestVersion ? latestVersion.version + 1 : 1;
            const published = manager.create(BotFlowDefinition, {
                id: uuidv4(),
                tenantId,
                key: normalizedKey,
                channel: normalizedChannel,
                status: BotFlowDefinitionStatus.PUBLISHED,
                version: nextVersion,
                definition,
                createdBy: actorId || null,
                updatedBy: actorId || null,
                publishedAt: now,
            });

            await manager.save(published);

            return {
                status: 'published',
                flow: published,
                previous_published_id: currentPublished?.id || null,
            };
        });
    }

    private normalizeChannel(channel?: string) {
        const value = String(channel || 'whatsapp').trim().toLowerCase();
        return value || 'whatsapp';
    }

    private normalizeKey(key: string) {
        const normalized = String(key || '').trim();
        if (!normalized) {
            throw new HttpException('Flow key é obrigatório.', HttpStatus.BAD_REQUEST);
        }
        return normalized;
    }

    private normalizeDefinition(definition: unknown) {
        if (!definition || typeof definition !== 'object' || Array.isArray(definition)) {
            throw new HttpException('Definition inválida.', HttpStatus.BAD_REQUEST);
        }
        return definition as Record<string, any>;
    }
}
