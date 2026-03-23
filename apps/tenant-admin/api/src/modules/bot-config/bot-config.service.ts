import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import {
    BotFlowDefinition,
    BotFlowDefinitionStatus,
} from '../../entities/bot-flow-definition.entity';
import { getDefaultBotFlowDefinition } from '../../shared/bot-flow-definitions';
import { User } from '../../entities/user.entity';

@Injectable()
export class BotConfigService {
    constructor(
        @InjectRepository(BotFlowDefinition)
        private readonly botFlowRepository: Repository<BotFlowDefinition>,
        @InjectRepository(User)
        private readonly userRepository: Repository<User>,
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
            flows: await this.serializeFlowDefinitions(tenantId, flows),
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

        return this.serializeFlowDefinition(tenantId, flow);
    }

    async listFlowVersions(tenantId: string, key: string, channel?: string) {
        const normalizedChannel = this.normalizeChannel(channel);
        const normalizedKey = this.normalizeKey(key);

        const versions = await this.botFlowRepository.find({
            where: {
                tenantId,
                key: normalizedKey,
                channel: normalizedChannel,
            },
            order: {
                version: 'DESC',
            },
        });

        if (!versions.length) {
            throw new HttpException('Nenhuma versão encontrada para este flow.', HttpStatus.NOT_FOUND);
        }

        return {
            tenant_id: tenantId,
            channel: normalizedChannel,
            key: normalizedKey,
            versions: await this.serializeFlowDefinitions(tenantId, versions),
        };
    }

    async getFlowDiff(
        tenantId: string,
        key: string,
        fromFlowId?: string,
        toFlowId?: string,
        channel?: string,
    ) {
        const normalizedChannel = this.normalizeChannel(channel);
        const normalizedKey = this.normalizeKey(key);
        const from = await this.findFlowVersionById(tenantId, normalizedKey, normalizedChannel, fromFlowId);
        const to = await this.findFlowVersionById(tenantId, normalizedKey, normalizedChannel, toFlowId);

        const changes = this.buildDefinitionDiff(from.definition, to.definition);
        return {
            tenant_id: tenantId,
            channel: normalizedChannel,
            key: normalizedKey,
            from_flow: await this.serializeFlowDefinition(tenantId, from),
            to_flow: await this.serializeFlowDefinition(tenantId, to),
            summary: {
                total_changes: changes.length,
                added: changes.filter((change) => change.change_type === 'ADDED').length,
                removed: changes.filter((change) => change.change_type === 'REMOVED').length,
                updated: changes.filter((change) => change.change_type === 'UPDATED').length,
            },
            changes,
        };
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
        const reason = this.normalizeReason(payload?.reason);

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
                changeReason: reason,
                sourceFlowId: null,
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

    async rollbackFlow(
        tenantId: string,
        key: string,
        channel: string | undefined,
        payload: any,
        actorId?: string,
    ) {
        const normalizedChannel = this.normalizeChannel(channel);
        const normalizedKey = this.normalizeKey(key);
        const sourceFlowId = String(payload?.source_flow_id || payload?.sourceFlowId || '').trim();
        if (!sourceFlowId) {
            throw new HttpException('source_flow_id é obrigatório para rollback.', HttpStatus.BAD_REQUEST);
        }
        const reason = this.normalizeReason(payload?.reason, true);

        return this.botFlowRepository.manager.transaction(async (manager) => {
            const sourceFlow = await manager.findOne(BotFlowDefinition, {
                where: {
                    id: sourceFlowId,
                    tenantId,
                    key: normalizedKey,
                    channel: normalizedChannel,
                },
            });

            if (!sourceFlow) {
                throw new HttpException('Versão de origem não encontrada para rollback.', HttpStatus.NOT_FOUND);
            }

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

            if (currentPublished && currentPublished.id === sourceFlow.id) {
                throw new HttpException('A versão selecionada já está publicada.', HttpStatus.BAD_REQUEST);
            }

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
            const rolledBack = manager.create(BotFlowDefinition, {
                id: uuidv4(),
                tenantId,
                key: normalizedKey,
                channel: normalizedChannel,
                status: BotFlowDefinitionStatus.PUBLISHED,
                version: nextVersion,
                definition: JSON.parse(JSON.stringify(sourceFlow.definition || {})),
                changeReason: reason,
                sourceFlowId: sourceFlow.id,
                createdBy: actorId || null,
                updatedBy: actorId || null,
                publishedAt: now,
            });

            await manager.save(rolledBack);

            return {
                status: 'rolled_back',
                flow: await this.serializeFlowDefinition(tenantId, rolledBack),
                source_flow_id: sourceFlow.id,
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

    private normalizeReason(reason: unknown, required = false) {
        const normalized = String(reason || '').trim();
        if (required && !normalized) {
            throw new HttpException('Motivo é obrigatório para esta ação.', HttpStatus.BAD_REQUEST);
        }
        return normalized || null;
    }

    private normalizeDefinition(definition: unknown) {
        if (!definition || typeof definition !== 'object' || Array.isArray(definition)) {
            throw new HttpException('Definition inválida.', HttpStatus.BAD_REQUEST);
        }
        return definition as Record<string, any>;
    }

    private async findFlowVersionById(
        tenantId: string,
        key: string,
        channel: string,
        flowId?: string,
    ) {
        const normalizedFlowId = String(flowId || '').trim();
        if (!normalizedFlowId) {
            throw new HttpException('from_flow_id e to_flow_id são obrigatórios.', HttpStatus.BAD_REQUEST);
        }

        const flow = await this.botFlowRepository.findOne({
            where: {
                id: normalizedFlowId,
                tenantId,
                key,
                channel,
            },
        });

        if (!flow) {
            throw new HttpException(`Flow ${normalizedFlowId} não encontrado.`, HttpStatus.NOT_FOUND);
        }

        return flow;
    }

    private async serializeFlowDefinitions(tenantId: string, flows: BotFlowDefinition[]) {
        const actorIds = Array.from(new Set(
            (flows || [])
                .flatMap((flow) => [flow.createdBy, flow.updatedBy])
                .filter((value): value is string => !!value),
        ));

        const users = actorIds.length
            ? await this.userRepository.find({
                where: {
                    tenantId,
                    id: In(actorIds),
                },
            })
            : [];

        const userNameById = new Map(users.map((user) => [user.id, user.name]));
        return flows.map((flow) => this.mapFlowDefinition(flow, userNameById));
    }

    private async serializeFlowDefinition(tenantId: string, flow: BotFlowDefinition) {
        const [serialized] = await this.serializeFlowDefinitions(tenantId, [flow]);
        return serialized;
    }

    private mapFlowDefinition(flow: BotFlowDefinition, userNameById: Map<string, string>) {
        return {
            ...flow,
            createdByName: flow.createdBy ? userNameById.get(flow.createdBy) || null : null,
            updatedByName: flow.updatedBy ? userNameById.get(flow.updatedBy) || null : null,
        };
    }

    private buildDefinitionDiff(fromDefinition: Record<string, any>, toDefinition: Record<string, any>) {
        const changes: Array<{
            path: string;
            change_type: 'ADDED' | 'REMOVED' | 'UPDATED';
            from_value: unknown;
            to_value: unknown;
        }> = [];

        const visit = (path: string, fromValue: unknown, toValue: unknown) => {
            if (this.areValuesEqual(fromValue, toValue)) {
                return;
            }

            if (typeof fromValue === 'undefined') {
                changes.push({ path, change_type: 'ADDED', from_value: null, to_value: toValue });
                return;
            }

            if (typeof toValue === 'undefined') {
                changes.push({ path, change_type: 'REMOVED', from_value: fromValue, to_value: null });
                return;
            }

            if (Array.isArray(fromValue) && Array.isArray(toValue)) {
                const maxLength = Math.max(fromValue.length, toValue.length);
                for (let index = 0; index < maxLength; index += 1) {
                    visit(`${path}[${index}]`, fromValue[index], toValue[index]);
                }
                return;
            }

            if (this.isPlainObject(fromValue) && this.isPlainObject(toValue)) {
                const keys = Array.from(new Set([...Object.keys(fromValue), ...Object.keys(toValue)])).sort();
                for (const key of keys) {
                    const nextPath = path ? `${path}.${key}` : key;
                    visit(nextPath, (fromValue as Record<string, unknown>)[key], (toValue as Record<string, unknown>)[key]);
                }
                return;
            }

            changes.push({
                path,
                change_type: 'UPDATED',
                from_value: fromValue,
                to_value: toValue,
            });
        };

        visit('', fromDefinition || {}, toDefinition || {});

        return changes.map((change) => ({
            ...change,
            path: change.path || 'root',
        }));
    }

    private isPlainObject(value: unknown): value is Record<string, unknown> {
        return !!value && typeof value === 'object' && !Array.isArray(value);
    }

    private areValuesEqual(left: unknown, right: unknown) {
        return JSON.stringify(left) === JSON.stringify(right);
    }
}
