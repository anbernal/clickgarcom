import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
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
        private readonly dataSource: DataSource,
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

    async remove(id: string, tenantId: string) {
        const table = await this.tableRepo.findOne({ where: { id, tenantId } });
        if (!table) {
            throw new NotFoundException('Mesa não encontrada');
        }

        if (table.status !== 'AVAILABLE') {
            throw new BadRequestException('Apenas mesas livres podem ser excluídas');
        }

        await this.tableRepo.delete({ id, tenantId });
        return { success: true, id };
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
        const pending = await this.tableRequestRepo.find({
            where: { tenantId, status: RequestStatus.PENDING },
            relations: ['table'],
            // Desc para manter a versão mais recente ao deduplicar por telefone.
            order: { createdAt: 'DESC' }
        });

        // Evita itens duplicados no painel quando o mesmo número envia várias mensagens.
        const latestByPhone = new Map<string, TableRequest>();
        for (const req of pending) {
            const phone = String(req.userPhone || '').trim();
            if (!phone || latestByPhone.has(phone)) continue;
            latestByPhone.set(phone, req);
        }

        return Array.from(latestByPhone.values()).sort((a, b) => {
            const aTime = new Date(a.createdAt || 0).getTime();
            const bTime = new Date(b.createdAt || 0).getTime();
            return aTime - bTime;
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

    async getOpenWaiterChats(tenantId: string) {
        const rows = await this.dataSource.query(
            `SELECT wc.id,
                    wc.user_phone,
                    wc.status,
                    wc.opened_at,
                    wc.last_message_at,
                    wc.tab_id,
                    wc.table_id,
                    t.number AS table_number,
                    lm.message AS last_message,
                    lm.sender_type AS last_sender_type,
                    lm.created_at AS last_message_created_at
               FROM waiter_chats wc
               LEFT JOIN tables t
                 ON t.id = wc.table_id
               LEFT JOIN LATERAL (
                    SELECT m.message, m.sender_type, m.created_at
                      FROM waiter_chat_messages m
                     WHERE m.chat_id = wc.id
                     ORDER BY m.created_at DESC
                     LIMIT 1
               ) lm ON TRUE
              WHERE wc.tenant_id = $1
                AND wc.status = 'OPEN'
              ORDER BY COALESCE(wc.last_message_at, wc.opened_at) DESC`,
            [tenantId],
        );

        return (rows || []).map((row: any) => ({
            id: String(row.id),
            userPhone: String(row.user_phone || ''),
            status: String(row.status || 'OPEN'),
            openedAt: row.opened_at,
            lastMessageAt: row.last_message_at,
            tabId: row.tab_id || null,
            tableId: row.table_id || null,
            tableNumber: row.table_number || null,
            lastMessage: row.last_message || '',
            lastSenderType: row.last_sender_type || null,
            lastMessageCreatedAt: row.last_message_created_at || null,
        }));
    }

    async getWaiterChatMessages(chatId: string, tenantId: string) {
        const chatRows = await this.dataSource.query(
            `SELECT id, user_phone, status, table_id, tab_id
               FROM waiter_chats
              WHERE id = $1
                AND tenant_id = $2
              LIMIT 1`,
            [chatId, tenantId],
        );
        if (!chatRows?.[0]) {
            throw new NotFoundException('Conversa não encontrada');
        }

        const rows = await this.dataSource.query(
            `SELECT id, chat_id, sender_type, sender_name, message, created_at
               FROM waiter_chat_messages
              WHERE chat_id = $1
                AND tenant_id = $2
              ORDER BY created_at ASC
              LIMIT 300`,
            [chatId, tenantId],
        );

        return {
            chat: {
                id: String(chatRows[0].id),
                userPhone: String(chatRows[0].user_phone || ''),
                status: String(chatRows[0].status || 'OPEN'),
                tableId: chatRows[0].table_id || null,
                tabId: chatRows[0].tab_id || null,
            },
            messages: (rows || []).map((row: any) => ({
                id: String(row.id),
                chatId: String(row.chat_id),
                senderType: String(row.sender_type || ''),
                senderName: String(row.sender_name || ''),
                message: String(row.message || ''),
                createdAt: row.created_at,
            })),
        };
    }

    async sendWaiterChatMessage(chatId: string, tenantId: string, message: string, staffName?: string) {
        const text = String(message || '').trim();
        if (!text) {
            throw new BadRequestException('Mensagem obrigatória');
        }

        await this.assertTenantCanSendWhatsApp(tenantId);

        const rows = await this.dataSource.query(
            `SELECT id, user_phone, status
               FROM waiter_chats
              WHERE id = $1
                AND tenant_id = $2
              LIMIT 1`,
            [chatId, tenantId],
        );
        const chat = rows?.[0];
        if (!chat) {
            throw new NotFoundException('Conversa não encontrada');
        }
        if (String(chat.status) !== 'OPEN') {
            throw new BadRequestException('Conversa já encerrada');
        }

        await this.dataSource.query(
            `INSERT INTO waiter_chat_messages
                (id, chat_id, tenant_id, sender_type, sender_name, message, created_at)
             VALUES (gen_random_uuid(), $1, $2, 'STAFF', $3, $4, NOW())`,
            [chatId, tenantId, String(staffName || 'Equipe').trim() || 'Equipe', text],
        );

        await this.dataSource.query(
            `UPDATE waiter_chats
                SET last_message_at = NOW()
              WHERE id = $1
                AND tenant_id = $2`,
            [chatId, tenantId],
        );

        await this.dataSource.query(
            `INSERT INTO outbox_messages
                (tenant_id, destination, recipient, payload, sent, attempts, max_attempts, created_at)
             VALUES ($1, 'whatsapp', $2, $3, false, 0, 3, NOW())`,
            [tenantId, String(chat.user_phone || ''), text],
        );

        return { ok: true };
    }

    async closeWaiterChat(chatId: string, tenantId: string, staffName?: string) {
        const rows = await this.dataSource.query(
            `SELECT id, user_phone, status
               FROM waiter_chats
              WHERE id = $1
                AND tenant_id = $2
              LIMIT 1`,
            [chatId, tenantId],
        );
        const chat = rows?.[0];
        if (!chat) {
            throw new NotFoundException('Conversa não encontrada');
        }

        if (String(chat.status) === 'OPEN') {
            await this.dataSource.query(
                `UPDATE waiter_chats
                    SET status = 'CLOSED',
                        closed_at = NOW(),
                        closed_by = 'STAFF',
                        last_message_at = NOW()
                  WHERE id = $1
                    AND tenant_id = $2`,
                [chatId, tenantId],
            );

            const sender = String(staffName || 'Equipe').trim() || 'Equipe';
            const closingMessage = '✅ Atendimento encerrado pela equipe. Se precisar novamente, digite 4 no menu principal.';

            await this.dataSource.query(
                `INSERT INTO waiter_chat_messages
                    (id, chat_id, tenant_id, sender_type, sender_name, message, created_at)
                 VALUES (gen_random_uuid(), $1, $2, 'SYSTEM', $3, $4, NOW())`,
                [chatId, tenantId, sender, closingMessage],
            );

            await this.dataSource.query(
                `INSERT INTO outbox_messages
                    (tenant_id, destination, recipient, payload, sent, attempts, max_attempts, created_at)
                 VALUES ($1, 'whatsapp', $2, $3, false, 0, 3, NOW())`,
                [tenantId, String(chat.user_phone || ''), closingMessage],
            );
        }

        return { ok: true };
    }

    private async assertTenantCanSendWhatsApp(tenantId: string) {
        const rows = await this.dataSource.query(
            `SELECT wallet_balance, message_price, billing_plan
               FROM tenants
              WHERE id = $1
              LIMIT 1`,
            [tenantId],
        );

        const tenant = rows?.[0];
        if (!tenant) {
            throw new NotFoundException('Tenant não encontrado');
        }

        const billingPlan = String(tenant.billing_plan || 'pre_paid').trim().toLowerCase();
        if (billingPlan !== 'pre_paid') return;

        const balance = Number.parseFloat(String(tenant.wallet_balance ?? '0')) || 0;
        const messagePrice = Number.parseFloat(String(tenant.message_price ?? '0.02')) || 0.02;

        if (balance < messagePrice) {
            throw new BadRequestException('Saldo insuficiente para enviar mensagem WhatsApp');
        }
    }
}
