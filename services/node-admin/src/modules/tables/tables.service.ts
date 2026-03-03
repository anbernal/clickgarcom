import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Table } from '../../entities/table.entity';
import { Tab } from '../../entities/tab.entity';
import { TableRequest, RequestStatus } from '../../entities/table-request.entity';
import { AmqpService } from '../amqp/amqp.service';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class TablesService {
    constructor(
        @InjectRepository(Table)
        private readonly tableRepo: Repository<Table>,
        @InjectRepository(Tab)
        private readonly tabRepo: Repository<Tab>,
        @InjectRepository(TableRequest)
        private readonly tableRequestRepo: Repository<TableRequest>,
        private readonly amqpService: AmqpService,
    ) { }

    async findAll(tenantId: string) {
        const tables = await this.tableRepo.find({
            where: { tenantId },
            order: { number: 'ASC' },
        });

        // Attach open tabs for each table (Fase 14 - Split Checks)
        const result = await Promise.all(
            tables.map(async (table) => {
                const tabs = await this.tabRepo.find({
                    where: { tableId: table.id, status: 'OPEN' },
                });
                return { ...table, activeTabs: tabs || [] };
            }),
        );

        return result;
    }

    async create(tenantId: string, data: { number: string, capacity?: number }) {
        const table = this.tableRepo.create({
            id: uuidv4(),
            tenantId,
            number: data.number,
            capacity: data.capacity || 4,
            status: 'AVAILABLE',
        });
        return this.tableRepo.save(table);
    }

    async updateStatus(id: string, tenantId: string, status: string) {
        await this.tableRepo.update({ id, tenantId }, { status });
        return this.tableRepo.findOne({ where: { id, tenantId } });
    }

    async getTab(tableId: string, tenantId: string) {
        // Retorna a primeira tab aberta para manter retrocompatibilidade com partes antigas
        return this.tabRepo.findOne({
            where: { tableId, tenantId, status: 'OPEN' },
            order: { openedAt: 'ASC' }
        });
    }

    // Retorna todas as tabs abertas
    async getTabs(tableId: string, tenantId: string) {
        return this.tabRepo.find({
            where: { tableId, tenantId, status: 'OPEN' },
            order: { openedAt: 'ASC' }
        });
    }

    async getTabStats(tenantId: string) {
        const tables = await this.tableRepo.find({ where: { tenantId } });
        const total = tables.length;
        const occupied = tables.filter((t) => t.status === 'OCCUPIED').length;
        const available = tables.filter((t) => t.status === 'AVAILABLE').length;

        // Sum open tabs
        const openTabs = await this.tabRepo
            .createQueryBuilder('tab')
            .select('SUM(tab.total)', 'totalOpen')
            .where('tab.tenant_id = :tenantId', { tenantId })
            .andWhere('tab.status = :status', { status: 'OPEN' })
            .getRawOne();

        return {
            total,
            occupied,
            available,
            openTabsTotal: parseFloat(openTabs?.totalOpen || '0'),
        };
    }

    // --- Table Requests Methods ---

    async getPendingRequests(tenantId: string) {
        return this.tableRequestRepo.find({
            where: { tenantId, status: RequestStatus.PENDING },
            relations: ['table'],
            order: { createdAt: 'ASC' }
        });
    }

    async approveRequest(requestId: string, tenantId: string, tableId?: string) {
        const req = await this.tableRequestRepo.findOne({ where: { id: requestId, tenantId } });
        if (!req) throw new Error('Request not found');
        if (req.status === RequestStatus.REJECTED) {
            throw new Error('Rejected requests cannot be approved');
        }

        if (tableId) {
            req.tableId = tableId;
        }

        // Keep the request pending until Go-Core consumes the event and finalizes
        // the approval, otherwise the worker ignores the message as already handled.
        req.status = RequestStatus.PENDING;
        await this.tableRequestRepo.save(req);

        // Note: The actual Go-Core updates are triggered by the event
        await this.amqpService.publishTableEvent(req.id, 'APPROVE');

        return req;
    }

    async rejectRequest(requestId: string, tenantId: string) {
        const req = await this.tableRequestRepo.findOne({ where: { id: requestId, tenantId } });
        if (!req) throw new Error('Request not found');

        req.status = RequestStatus.REJECTED;
        await this.tableRequestRepo.save(req);

        return req;
    }

    async createManualRequest(tenantId: string, data: { tableId: string, userPhone: string, paxCount: number }) {
        // 1. Create request directly as PENDING
        const req = this.tableRequestRepo.create({
            id: uuidv4(),
            tenantId,
            tableId: data.tableId,
            userPhone: data.userPhone,
            paxCount: data.paxCount,
            status: RequestStatus.PENDING,
        });
        await this.tableRequestRepo.save(req);

        // 2. Immediatelly approve it to trigger Go-Core WhatsApp notification
        await this.approveRequest(req.id, tenantId);

        return req;
    }
}
