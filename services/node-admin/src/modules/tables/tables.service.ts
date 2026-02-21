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

        // Attach open tab for each table
        const result = await Promise.all(
            tables.map(async (table) => {
                const tab = await this.tabRepo.findOne({
                    where: { tableId: table.id, status: 'OPEN' },
                });
                return { ...table, currentTab: tab || null };
            }),
        );

        return result;
    }

    async create(tenantId: string, data: { number: string }) {
        const table = this.tableRepo.create({
            id: uuidv4(),
            tenantId,
            number: data.number,
            status: 'AVAILABLE',
        });
        return this.tableRepo.save(table);
    }

    async updateStatus(id: string, status: string) {
        await this.tableRepo.update(id, { status });
        return this.tableRepo.findOne({ where: { id } });
    }

    async getTab(tableId: string) {
        return this.tabRepo.findOne({
            where: { tableId, status: 'OPEN' },
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

    async approveRequest(requestId: string, tenantId: string) {
        const req = await this.tableRequestRepo.findOne({ where: { id: requestId, tenantId } });
        if (!req) throw new Error('Request not found');

        // Note: The actual DB status and Table updates are handled by Go-Core via the event
        // We just notify Go-Core that this was approved. Look at the AmqpService logic
        await this.amqpService.publishTableEvent(req.id, 'APPROVE');

        // Optimistic update
        req.status = RequestStatus.APPROVED;
        await this.tableRequestRepo.save(req);

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
