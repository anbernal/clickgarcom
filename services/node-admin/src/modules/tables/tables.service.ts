import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Table } from '../../entities/table.entity';
import { Tab } from '../../entities/tab.entity';
import { TableRequest, RequestStatus } from '../../entities/table-request.entity';
import { AmqpService } from '../amqp/amqp.service';
import { WalletService } from '../wallet/wallet.service';
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
        private readonly walletService: WalletService,
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

    async getPendingCloseRequests(tenantId: string) {
        const rows = await this.dataSource.query(
            `SELECT sr.id,
                    sr.tab_id,
                    sr.table_id,
                    sr.status,
                    sr.created_at,
                    tb.user_phone,
                    tb.total,
                    tb.paid_amount,
                    t.number AS table_number
               FROM service_requests sr
               LEFT JOIN tabs tb
                 ON tb.id = sr.tab_id
               LEFT JOIN tables t
                 ON t.id = sr.table_id
              WHERE sr.tenant_id = $1
                AND sr.request_type = 'CLOSE_BILL'
                AND sr.status IN ('PENDING', 'IN_PROGRESS')
              ORDER BY sr.created_at ASC`,
            [tenantId],
        );

        return (rows || []).map((row: any) => ({
            id: String(row.id),
            tabId: row.tab_id ? String(row.tab_id) : null,
            tableId: row.table_id ? String(row.table_id) : null,
            tableNumber: row.table_number || null,
            userPhone: String(row.user_phone || ''),
            status: String(row.status || 'PENDING'),
            createdAt: row.created_at,
            total: Number.parseFloat(String(row.total ?? '0')) || 0,
            paidAmount: Number.parseFloat(String(row.paid_amount ?? '0')) || 0,
            amountDue: this.getAmountDue(
                Number.parseFloat(String(row.total ?? '0')) || 0,
                Number.parseFloat(String(row.paid_amount ?? '0')) || 0,
                'OPEN',
            ),
        }));
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

    async finalizeCloseRequest(requestId: string, tenantId: string, staffUserId?: string) {
        const rows = await this.dataSource.query(
            `SELECT id, tab_id, status
               FROM service_requests
              WHERE id = $1
                AND tenant_id = $2
                AND request_type = 'CLOSE_BILL'
              LIMIT 1`,
            [requestId, tenantId],
        );

        const request = rows?.[0];
        if (!request) {
            throw new NotFoundException('Solicitação de fechamento não encontrada');
        }

        if (!request.tab_id) {
            throw new BadRequestException('Solicitação sem comanda vinculada');
        }

        const result = await this.finalizeTabInternal(String(request.tab_id), tenantId, {
            resolvedByUserId: staffUserId,
            requestId,
        });

        return {
            ok: true,
            requestId,
            alreadyClosed: result.alreadyClosed,
            tab: result.tab,
        };
    }

    async finalizeTab(tabId: string, tenantId: string, staffUserId?: string) {
        const result = await this.finalizeTabInternal(tabId, tenantId, {
            resolvedByUserId: staffUserId,
        });

        return {
            ok: true,
            alreadyClosed: result.alreadyClosed,
            tab: result.tab,
        };
    }

    async getPublicTabById(tabId: string) {
        const tab = await this.loadPublicTabContext(tabId);
        if (!tab) {
            throw new NotFoundException('Comanda não encontrada');
        }

        return this.buildPublicTabPayload(tab);
    }

    async createPublicPixPayment(tabId: string, payload: Record<string, unknown>) {
        const tab = await this.loadPublicTabContext(tabId);
        if (!tab) {
            throw new NotFoundException('Comanda não encontrada');
        }

        const amountDue = this.getAmountDue(tab.total, tab.paidAmount, tab.status);
        if (amountDue <= 0) {
            return {
                status: 'approved',
                approved: true,
                tabClosed: true,
            };
        }

        const orderId = await this.resolveAnchorOrderId(tabId, tab.tenantId);
        const response = await this.walletService.createPixPayment(tab.tenantId, {
            order_id: orderId,
            amount: amountDue,
            description: this.buildCheckoutDescription(tab),
            payer_email: this.resolvePayerField(payload['payer_email'], 'cliente@email.com'),
            payer_name: this.resolvePayerField(payload['payer_name'], 'Visitante'),
            payer_cpf: this.resolveCpf(payload['payer_cpf']),
        });

        return {
            ...response,
            amount_due: amountDue,
        };
    }

    async createPublicCardPayment(tabId: string, payload: Record<string, unknown>) {
        const tab = await this.loadPublicTabContext(tabId);
        if (!tab) {
            throw new NotFoundException('Comanda não encontrada');
        }

        const amountDue = this.getAmountDue(tab.total, tab.paidAmount, tab.status);
        if (amountDue <= 0) {
            return {
                status: 'approved',
                approved: true,
                tabClosed: true,
            };
        }

        const orderId = await this.resolveAnchorOrderId(tabId, tab.tenantId);
        const response = await this.walletService.createCardPayment(tab.tenantId, {
            order_id: orderId,
            amount: amountDue,
            token: String(payload['token'] || '').trim(),
            description: this.buildCheckoutDescription(tab),
            installments: Number(payload['installments'] || 1),
            payment_method_id: String(payload['payment_method_id'] || '').trim() || 'master',
            issuer_id: String(payload['issuer_id'] || '').trim(),
            payer_email: this.resolvePayerField(payload['payer_email'], 'cliente@email.com'),
            payer_cpf: this.resolveCpf(payload['payer_cpf']),
        });

        const status = String(response?.status || '').trim().toLowerCase();
        if (status === 'approved') {
            await this.finalizeTabInternal(tabId, tab.tenantId, {});
        }

        return {
            ...response,
            amount_due: amountDue,
            tabClosed: status === 'approved',
        };
    }

    async getPublicPaymentStatus(tabId: string, paymentId: string) {
        const tab = await this.loadPublicTabContext(tabId);
        if (!tab) {
            throw new NotFoundException('Comanda não encontrada');
        }

        const amountDue = this.getAmountDue(tab.total, tab.paidAmount, tab.status);
        if (amountDue <= 0) {
            return {
                payment_id: paymentId,
                status: 'approved',
                approved: true,
                tabClosed: true,
            };
        }

        const payment = await this.walletService.getPaymentStatus(tab.tenantId, paymentId);
        const approved = !!payment?.approved || String(payment?.status || '').trim().toLowerCase() === 'approved';
        if (approved) {
            await this.finalizeTabInternal(tabId, tab.tenantId, {});
        }

        return {
            ...payment,
            approved,
            tabClosed: approved,
        };
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

    private async finalizeTabInternal(
        tabId: string,
        tenantId: string,
        options: { resolvedByUserId?: string; requestId?: string },
    ) {
        const queryRunner = this.dataSource.createQueryRunner();
        await queryRunner.connect();
        await queryRunner.startTransaction();

        try {
            const tabRows = await queryRunner.query(
                `SELECT id, tenant_id, table_id, total, paid_amount, status, opened_at, closed_at
                   FROM tabs
                  WHERE id = $1
                    AND tenant_id = $2
                  LIMIT 1
                  FOR UPDATE`,
                [tabId, tenantId],
            );
            const tab = tabRows?.[0];
            if (!tab) {
                throw new NotFoundException('Comanda não encontrada');
            }

            const total = Number.parseFloat(String(tab.total ?? '0')) || 0;
            const paidAmount = Number.parseFloat(String(tab.paid_amount ?? '0')) || 0;
            const alreadyClosed = String(tab.status || '').trim().toUpperCase() === 'CLOSED';
            const nextPaidAmount = this.roundMoney(Math.max(total, paidAmount));

            if (!alreadyClosed) {
                await queryRunner.query(
                    `UPDATE tabs
                        SET status = 'CLOSED',
                            paid_amount = $1,
                            closed_at = COALESCE(closed_at, NOW())
                      WHERE id = $2
                        AND tenant_id = $3`,
                    [nextPaidAmount, tabId, tenantId],
                );
            }

            if (options.requestId) {
                await queryRunner.query(
                    `UPDATE service_requests
                        SET status = 'RESOLVED',
                            resolved_at = COALESCE(resolved_at, NOW()),
                            resolved_by = COALESCE($3::uuid, resolved_by)
                      WHERE id = $1
                        AND tenant_id = $2
                        AND request_type = 'CLOSE_BILL'
                        AND status IN ('PENDING', 'IN_PROGRESS')`,
                    [options.requestId, tenantId, this.normalizeUuidOrNull(options.resolvedByUserId)],
                );
            }

            await queryRunner.query(
                `UPDATE service_requests
                    SET status = 'RESOLVED',
                        resolved_at = COALESCE(resolved_at, NOW()),
                        resolved_by = COALESCE($3::uuid, resolved_by)
                  WHERE tenant_id = $1
                    AND tab_id = $2
                    AND request_type = 'CLOSE_BILL'
                    AND status IN ('PENDING', 'IN_PROGRESS')`,
                [tenantId, tabId, this.normalizeUuidOrNull(options.resolvedByUserId)],
            );

            if (tab.table_id) {
                const otherOpenRows = await queryRunner.query(
                    `SELECT COUNT(*)::int AS total
                       FROM tabs
                      WHERE tenant_id = $1
                        AND table_id = $2
                        AND status <> 'CLOSED'
                        AND id <> $3`,
                    [tenantId, tab.table_id, tabId],
                );

                const otherOpenTabs = Number(otherOpenRows?.[0]?.total || 0);
                if (otherOpenTabs === 0) {
                    await queryRunner.query(
                        `UPDATE tables
                            SET status = 'AVAILABLE'
                          WHERE id = $1
                            AND tenant_id = $2`,
                        [tab.table_id, tenantId],
                    );
                }
            }

            const updatedRows = await queryRunner.query(
                `SELECT id, tenant_id, table_id, total, paid_amount, status, opened_at, closed_at
                   FROM tabs
                  WHERE id = $1
                    AND tenant_id = $2
                  LIMIT 1`,
                [tabId, tenantId],
            );

            await queryRunner.commitTransaction();

            return {
                alreadyClosed,
                tab: updatedRows?.[0] || tab,
            };
        } catch (error) {
            await queryRunner.rollbackTransaction();
            throw error;
        } finally {
            await queryRunner.release();
        }
    }

    private async loadPublicTabContext(tabId: string) {
        const rows = await this.dataSource.query(
            `SELECT tb.id,
                    tb.tenant_id,
                    tb.table_id,
                    tb.user_phone,
                    tb.total,
                    tb.paid_amount,
                    tb.status,
                    tb.opened_at,
                    tb.closed_at,
                    t.number AS table_number,
                    tn.name AS tenant_name,
                    tn.settings AS tenant_settings
               FROM tabs tb
               JOIN tenants tn
                 ON tn.id = tb.tenant_id
               LEFT JOIN tables t
                 ON t.id = tb.table_id
              WHERE tb.id = $1
              LIMIT 1`,
            [tabId],
        );

        const row = rows?.[0];
        if (!row) return null;

        return {
            id: String(row.id),
            tenantId: String(row.tenant_id),
            tableId: row.table_id ? String(row.table_id) : null,
            userPhone: String(row.user_phone || ''),
            total: Number.parseFloat(String(row.total ?? '0')) || 0,
            paidAmount: Number.parseFloat(String(row.paid_amount ?? '0')) || 0,
            status: String(row.status || 'OPEN'),
            openedAt: row.opened_at,
            closedAt: row.closed_at,
            tableNumber: row.table_number || null,
            tenantName: String(row.tenant_name || 'ClickGarcom'),
            tenantSettings: this.parseTenantSettings(row.tenant_settings),
        };
    }

    private buildPublicTabPayload(tab: any) {
        const amountDue = this.getAmountDue(tab.total, tab.paidAmount, tab.status);

        return {
            id: tab.id,
            tenantName: tab.tenantName,
            tableNumber: tab.tableNumber,
            status: tab.status,
            total: amountDue,
            fullTotal: this.roundMoney(tab.total),
            paidAmount: this.roundMoney(tab.paidAmount),
            amountDue,
            closed: amountDue <= 0,
            mpPublicKey: String(tab.tenantSettings?.mp_public_key || '').trim(),
        };
    }

    private async resolveAnchorOrderId(tabId: string, tenantId: string) {
        const rows = await this.dataSource.query(
            `SELECT id
               FROM orders
              WHERE tab_id = $1
                AND tenant_id = $2
                AND status <> 'CANCELED'
              ORDER BY created_at ASC
              LIMIT 1`,
            [tabId, tenantId],
        );

        const orderId = String(rows?.[0]?.id || '').trim();
        if (!orderId) {
            throw new BadRequestException('Não encontrei pedidos nessa comanda para processar o pagamento');
        }
        return orderId;
    }

    private buildCheckoutDescription(tab: any) {
        const tableLabel = String(tab.tableNumber || '').trim()
            ? `Mesa ${String(tab.tableNumber).trim()}`
            : 'Comanda';
        return `${tableLabel} - ${String(tab.tenantName || 'ClickGarcom').trim()}`;
    }

    private resolvePayerField(value: unknown, fallback: string) {
        const text = String(value || '').trim();
        return text || fallback;
    }

    private resolveCpf(value: unknown) {
        const digits = String(value || '').replace(/\D/g, '');
        return digits || '19119119100';
    }

    private parseTenantSettings(value: unknown) {
        if (!value) return {};
        if (typeof value === 'object') return value as Record<string, unknown>;
        try {
            return JSON.parse(String(value));
        } catch (_error) {
            return {};
        }
    }

    private getAmountDue(total: number, paidAmount: number, status: string) {
        if (String(status || '').trim().toUpperCase() === 'CLOSED') {
            return 0;
        }
        return this.roundMoney(Math.max(0, total - paidAmount));
    }

    private normalizeUuidOrNull(value?: string) {
        const text = String(value || '').trim();
        return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(text)
            ? text
            : null;
    }

    private roundMoney(value: number) {
        return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
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
