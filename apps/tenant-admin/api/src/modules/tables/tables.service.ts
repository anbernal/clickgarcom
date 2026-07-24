import { BadRequestException, Injectable, Logger, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import { Table } from '../../entities/table.entity';
import { Tab } from '../../entities/tab.entity';
import { TableRequest, RequestStatus } from '../../entities/table-request.entity';
import { AmqpService } from '../amqp/amqp.service';
import { WalletService } from '../wallet/wallet.service';
import { TenantUserRole } from '../auth/roles';
import { v4 as uuidv4 } from 'uuid';
import { createHash, randomBytes, randomInt } from 'crypto';

type TabActorContext = {
    userId?: string;
    userName?: string;
    userRole?: string;
    reason?: string;
    requestedAmount?: number;
};

@Injectable()
export class TablesService {
    private readonly logger = new Logger(TablesService.name);

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
        private readonly jwtService: JwtService,
    ) { }

    async findAll(tenantId: string) {
        const tables = await this.tableRepo.find({
            where: { tenantId },
            order: { number: 'ASC' },
        });

        if (!tables.length) {
            return [];
        }

        const openTabs = await this.tabRepo.find({
            where: {
                tableId: In(tables.map((table) => table.id)),
                tenantId,
                status: 'OPEN',
            },
            order: { openedAt: 'ASC' },
        });

        const tabsByTableId = new Map<string, Tab[]>();
        for (const tab of openTabs) {
            const tableId = String(tab.tableId || '');
            if (!tableId) continue;
            const current = tabsByTableId.get(tableId) || [];
            current.push(tab);
            tabsByTableId.set(tableId, current);
        }

        const result = tables.map((table) => ({
            ...table,
            activeTabs: tabsByTableId.get(table.id) || [],
        }));

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
        const tabs = await this.tabRepo.find({
            where: { tableId, tenantId },
            order: { openedAt: 'DESC' },
            take: 20,
        });

        return tabs.sort((left, right) => {
            if (left.status === 'OPEN' && right.status !== 'OPEN') return -1;
            if (left.status !== 'OPEN' && right.status === 'OPEN') return 1;
            return new Date(right.openedAt || 0).getTime() - new Date(left.openedAt || 0).getTime();
        });
    }

    async getTabStats(tenantId: string) {
        const [tableStats, openTabs] = await Promise.all([
            this.tableRepo
                .createQueryBuilder('tb')
                .select('COUNT(*)', 'total')
                .addSelect(`COUNT(*) FILTER (WHERE tb.status = 'OCCUPIED')`, 'occupied')
                .addSelect(`COUNT(*) FILTER (WHERE tb.status = 'AVAILABLE')`, 'available')
                .where('tb.tenant_id = :tenantId', { tenantId })
                .getRawOne(),
            this.tabRepo
                .createQueryBuilder('tab')
                .select('SUM(tab.total)', 'totalOpen')
                .where('tab.tenant_id = :tenantId', { tenantId })
                .andWhere('tab.status = :status', { status: 'OPEN' })
                .getRawOne(),
        ]);

        return {
            total: Number.parseInt(String(tableStats?.total || '0'), 10) || 0,
            occupied: Number.parseInt(String(tableStats?.occupied || '0'), 10) || 0,
            available: Number.parseInt(String(tableStats?.available || '0'), 10) || 0,
            openTabsTotal: parseFloat(openTabs?.totalOpen || '0'),
        };
    }

    async listOpenTabs(tenantId: string) {
        const rows = await this.dataSource.query(
            `SELECT tb.id,
                    tb.public_code,
                    tb.user_phone,
                    tb.customer_instagram,
                    tb.table_id,
                    tb.status,
                    tb.service_mode,
                    tb.subtotal,
                    tb.service_fee,
                    tb.total,
                    tb.paid_amount,
                    tb.opened_at,
                    tb.opened_by_user_name,
                    tb.opening_channel,
                    t.number AS table_number
               FROM tabs tb
               LEFT JOIN tables t
                 ON t.id = tb.table_id
              WHERE tb.tenant_id = $1
                AND tb.status = 'OPEN'
              ORDER BY tb.opened_at ASC`,
            [tenantId],
        );

        return (rows || []).map((row: any) => ({
            id: String(row.id),
            publicCode: String(row.public_code || ''),
            userPhone: row.user_phone ? String(row.user_phone) : null,
            customerInstagram: row.customer_instagram ? String(row.customer_instagram) : null,
            tableId: row.table_id ? String(row.table_id) : null,
            tableNumber: row.table_number ? String(row.table_number) : null,
            status: String(row.status || 'OPEN'),
            serviceMode: String(row.service_mode || 'SEM_MESA'),
            subtotal: Number(row.subtotal || 0),
            serviceFee: Number(row.service_fee || 0),
            total: Number(row.total || 0),
            paidAmount: Number(row.paid_amount || 0),
            openedAt: row.opened_at,
            openedByUserName: row.opened_by_user_name ? String(row.opened_by_user_name) : null,
            openingChannel: String(row.opening_channel || 'LEGACY'),
        }));
    }

    async listClosedTabs(tenantId: string, requestedLimit?: number) {
        const limit = Math.min(Math.max(Number.isFinite(requestedLimit) ? Math.floor(Number(requestedLimit)) : 200, 1), 500);
        const rows = await this.dataSource.query(
            `SELECT tb.id,
                    tb.public_code,
                    tb.user_phone,
                    tb.customer_instagram,
                    tb.table_id,
                    tb.status,
                    tb.service_mode,
                    tb.subtotal,
                    tb.service_fee,
                    tb.total,
                    tb.paid_amount,
                    tb.opened_at,
                    tb.opened_by_user_name,
                    tb.opening_channel,
                    tb.closed_at,
                    tb.closed_by_user_name,
                    t.number AS table_number
               FROM tabs tb
               LEFT JOIN tables t
                 ON t.id = tb.table_id
              WHERE tb.tenant_id = $1
                AND tb.status = 'CLOSED'
              ORDER BY tb.closed_at DESC NULLS LAST, tb.opened_at DESC
              LIMIT $2`,
            [tenantId, limit],
        );

        return (rows || []).map((row: any) => ({
            id: String(row.id),
            publicCode: String(row.public_code || ''),
            userPhone: row.user_phone ? String(row.user_phone) : null,
            customerInstagram: row.customer_instagram ? String(row.customer_instagram) : null,
            tableId: row.table_id ? String(row.table_id) : null,
            tableNumber: row.table_number ? String(row.table_number) : null,
            status: 'CLOSED',
            serviceMode: String(row.service_mode || 'SEM_MESA'),
            subtotal: Number(row.subtotal || 0),
            serviceFee: Number(row.service_fee || 0),
            total: Number(row.total || 0),
            paidAmount: Number(row.paid_amount || 0),
            openedAt: row.opened_at,
            openedByUserName: row.opened_by_user_name ? String(row.opened_by_user_name) : null,
            openingChannel: String(row.opening_channel || 'LEGACY'),
            closedAt: row.closed_at || null,
            closedByUserName: row.closed_by_user_name ? String(row.closed_by_user_name) : null,
        }));
    }

    async openTab(
        tenantId: string,
        data: { user_phone?: string; customer_instagram?: string; table_id?: string },
        actor: TabActorContext,
    ) {
        const phone = this.normalizePhone(data?.user_phone);
        const instagram = this.normalizeInstagram(data?.customer_instagram);
        const tableId = String(data?.table_id || '').trim() || null;

        if (tableId) {
            const table = await this.tableRepo.findOne({ where: { id: tableId, tenantId } });
            if (!table) {
                throw new NotFoundException('Mesa não encontrada para este restaurante.');
            }
        }

        if (phone) {
            const existing = await this.tabRepo.findOne({ where: { tenantId, userPhone: phone, status: 'OPEN' } });
            if (existing) {
                throw new BadRequestException(`Já existe uma comanda aberta para o telefone informado (${existing.publicCode || existing.id}).`);
            }
        }

        if (instagram) {
            const existing = await this.tabRepo.findOne({ where: { tenantId, customerInstagram: instagram, status: 'OPEN' } });
            if (existing) {
                throw new BadRequestException(`Já existe uma comanda aberta para o Instagram informado (${existing.publicCode || existing.id}).`);
            }
        }

        for (let attempt = 0; attempt < 8; attempt += 1) {
            const publicCode = await this.generateTabPublicCode(tenantId);
            const tab = this.tabRepo.create({
                id: uuidv4(),
                tenantId,
                tableId,
                userPhone: phone || null,
                customerInstagram: instagram || null,
                openedByUserId: this.normalizeUuidOrNull(actor.userId),
                openedByUserName: this.normalizeTextOrNull(actor.userName),
                openingChannel: 'STAFF',
                serviceMode: tableId ? 'COM_MESA' : 'SEM_MESA',
                publicCode,
                status: 'OPEN',
                subtotal: 0,
                serviceFee: 0,
                total: 0,
                paidAmount: 0,
                openedAt: new Date(),
                closedAt: null,
            });

            try {
                const saved = await this.tabRepo.save(tab);
                if (tableId) {
                    await this.tableRepo.update(
                        { id: tableId, tenantId },
                        { status: 'OCCUPIED' },
                    );
                }
                await this.recordTabEvent(this.dataSource, tenantId, saved.id, 'TAB_OPENED_BY_STAFF', {
                    actorUserId: actor.userId,
                    actorName: actor.userName,
                    details: {
                        public_code: publicCode,
                        user_phone: phone || null,
                        customer_instagram: instagram || null,
                    },
                });
                return saved;
            } catch (error: any) {
                if (!this.isUniqueViolation(error)) throw error;
            }
        }

        throw new BadRequestException('Não foi possível gerar um código único para a comanda. Tente novamente.');
    }

    async createPortalAccess(tenantId: string, tabId: string, staffUserId?: string) {
        const queryRunner = this.dataSource.createQueryRunner();
        await queryRunner.connect();
        await queryRunner.startTransaction();

        try {
            const rows = await queryRunner.query(
                `SELECT id, tenant_id, status
                   FROM tabs
                  WHERE id = $1
                    AND tenant_id = $2
                  LIMIT 1
                  FOR UPDATE`,
                [tabId, tenantId],
            );
            const tab = rows?.[0];
            if (!tab) {
                throw new NotFoundException('Comanda não encontrada para este restaurante.');
            }
            if (String(tab.status || '').toUpperCase() === 'CLOSED') {
                throw new BadRequestException('Não é possível liberar o portal de uma comanda finalizada.');
            }

            await queryRunner.query(
                `UPDATE tab_portal_access_credentials
                    SET revoked_at = NOW(),
                        revoked_by_user_id = $3::uuid
                  WHERE tenant_id = $1
                    AND tab_id = $2
                    AND revoked_at IS NULL`,
                [tenantId, tabId, this.normalizeUuidOrNull(staffUserId)],
            );

            const rawToken = randomBytes(32).toString('base64url');
            const tokenHash = this.hashPortalToken(rawToken);
            const credentialId = uuidv4();
            await queryRunner.query(
                `INSERT INTO tab_portal_access_credentials
                    (id, tenant_id, tab_id, token_hash, created_at)
                 VALUES ($1, $2, $3, $4, NOW())`,
                [credentialId, tenantId, tabId, tokenHash],
            );

            await this.recordTabEvent(queryRunner, tenantId, tabId, 'PORTAL_ACCESS_CREATED', {
                actorUserId: staffUserId,
                details: { credential_id: credentialId },
            });
            await queryRunner.commitTransaction();

            const portalPath = `/portal.html#access_token=${encodeURIComponent(rawToken)}`;
            return {
                portalPath,
                portalUrl: `${this.resolvePublicPortalBaseUrl()}${portalPath}`,
                qrImagePath: `/api/portal/qr.png?access_token=${encodeURIComponent(rawToken)}`,
            };
        } catch (error) {
            await queryRunner.rollbackTransaction();
            throw error;
        } finally {
            await queryRunner.release();
        }
    }

    async startPortalSession(accessToken: string) {
        const credential = await this.loadPortalCredential(accessToken);
        const sessionToken = this.jwtService.sign({
            scope: 'tab_portal',
            credential_id: credential.id,
            tenant_id: credential.tenantId,
            tab_id: credential.tabId,
        }, { expiresIn: '12h' });

        return { sessionToken, expiresInSeconds: 12 * 60 * 60 };
    }

    async getPortalTab(sessionToken: string) {
        const credential = await this.loadPortalSession(sessionToken);
        const tab = await this.loadPortalTabContext(credential.tabId, credential.tenantId);
        if (!tab) {
            throw new UnauthorizedException('Acesso à comanda não está mais disponível.');
        }

        const [items, messages] = await Promise.all([
            this.dataSource.query(
                `SELECT oi.quantity,
                        oi.unit_price,
                        COALESCE(mi.name, 'Item') AS name,
                        o.status AS order_status,
                        o.created_at
                   FROM orders o
                   JOIN order_items oi ON oi.order_id = o.id
              LEFT JOIN menu_items mi ON mi.id = oi.menu_item_id
                  WHERE o.tenant_id = $1
                    AND o.tab_id = $2
                    AND o.status <> 'CANCELED'
                  ORDER BY o.created_at DESC, oi.created_at ASC`,
                [credential.tenantId, credential.tabId],
            ),
            this.dataSource.query(
                `SELECT sender_type, sender_name, message, created_at
                   FROM waiter_chat_messages
                  WHERE tenant_id = $1
                    AND chat_id IN (
                        SELECT id
                          FROM waiter_chats
                         WHERE tenant_id = $1
                           AND tab_id = $2
                    )
                  ORDER BY created_at ASC
                  LIMIT 100`,
                [credential.tenantId, credential.tabId],
            ),
        ]);

        return {
            ...this.buildPublicTabPayload(tab),
            subtotal: this.roundMoney(tab.subtotal),
            serviceFee: this.roundMoney(tab.serviceFee),
            openedAt: tab.openedAt,
            items: (items || []).map((item: any) => ({
                name: String(item.name || 'Item'),
                quantity: Number(item.quantity || 0),
                unitPrice: Number(item.unit_price || 0),
                orderStatus: String(item.order_status || ''),
                createdAt: item.created_at,
            })),
            messages: (messages || []).map((message: any) => ({
                senderType: String(message.sender_type || 'SYSTEM'),
                senderName: String(message.sender_name || ''),
                message: String(message.message || ''),
                createdAt: message.created_at,
            })),
        };
    }

    async sendPortalMessage(sessionToken: string, message: string) {
        const credential = await this.loadPortalSession(sessionToken);
        const text = String(message || '').trim();
        if (!text) {
            throw new BadRequestException('Digite uma mensagem para a equipe.');
        }
        if (text.length > 1000) {
            throw new BadRequestException('A mensagem pode ter no máximo 1000 caracteres.');
        }

        const queryRunner = this.dataSource.createQueryRunner();
        await queryRunner.connect();
        await queryRunner.startTransaction();
        try {
            const tabRows = await queryRunner.query(
                `SELECT id, table_id, public_code
                   FROM tabs
                  WHERE id = $1
                    AND tenant_id = $2
                    AND status <> 'CLOSED'
                  LIMIT 1
                  FOR UPDATE`,
                [credential.tabId, credential.tenantId],
            );
            const tab = tabRows?.[0];
            if (!tab) {
                throw new UnauthorizedException('A comanda foi encerrada.');
            }

            const chatRows = await queryRunner.query(
                `SELECT id
                   FROM waiter_chats
                  WHERE tenant_id = $1
                    AND tab_id = $2
                    AND status = 'OPEN'
                  ORDER BY opened_at ASC
                  LIMIT 1
                  FOR UPDATE`,
                [credential.tenantId, credential.tabId],
            );

            let chatId = String(chatRows?.[0]?.id || '');
            if (!chatId) {
                chatId = uuidv4();
                const portalIdentity = `portal:${String(tab.public_code || credential.tabId).slice(0, 20)}`;
                await queryRunner.query(
                    `INSERT INTO waiter_chats
                        (id, tenant_id, user_phone, tab_id, table_id, status, opened_at, last_message_at)
                     VALUES ($1, $2, $3, $4, $5, 'OPEN', NOW(), NOW())`,
                    [chatId, credential.tenantId, portalIdentity, credential.tabId, tab.table_id || null],
                );
            }

            await queryRunner.query(
                `INSERT INTO waiter_chat_messages
                    (id, chat_id, tenant_id, sender_type, sender_name, message, created_at)
                 VALUES (gen_random_uuid(), $1, $2, 'CUSTOMER', 'Cliente do portal', $3, NOW())`,
                [chatId, credential.tenantId, text],
            );
            await queryRunner.query(
                `UPDATE waiter_chats
                    SET last_message_at = NOW()
                  WHERE id = $1
                    AND tenant_id = $2`,
                [chatId, credential.tenantId],
            );
            await queryRunner.commitTransaction();
            void this.notifyPortalEvent(credential.tenantId, credential.tabId, 'chat.updated');
            return { ok: true, chatId };
        } catch (error) {
            await queryRunner.rollbackTransaction();
            throw error;
        } finally {
            await queryRunner.release();
        }
    }

    async getPortalMenu(sessionToken: string) {
        const credential = await this.loadPortalSession(sessionToken);
        const rows = await this.dataSource.query(
            `SELECT mi.id,
                    mi.category_id,
                    mi.name,
                    mi.description,
                    mi.price,
                    mi.image_url,
                    mi.destination,
                    mi.available,
                    mi.track_stock,
                    mi.stock_quantity,
                    mi.availability_windows,
                    mi.item_type,
                    mi.option_groups,
                    mc.name AS category_name,
                    mc.display_order AS category_display_order,
                    mi.display_order
               FROM menu_items mi
          LEFT JOIN menu_categories mc
                 ON mc.id = mi.category_id
                AND mc.tenant_id = mi.tenant_id
              WHERE mi.tenant_id = $1
              ORDER BY COALESCE(mc.display_order, 9999), mc.name, mi.display_order, mi.name`,
            [credential.tenantId],
        );

        return (rows || [])
            .filter((item: any) => this.isPortalMenuItemAvailable(item) && this.isPortalSimpleMenuItem(item))
            .map((item: any) => ({
                id: String(item.id),
                categoryId: item.category_id ? String(item.category_id) : null,
                categoryName: String(item.category_name || 'Cardápio'),
                name: String(item.name || 'Item'),
                description: String(item.description || ''),
                price: Number(item.price || 0),
                imageUrl: String(item.image_url || ''),
            }));
    }

    async createPortalOrder(sessionToken: string, rawItems: unknown) {
        const credential = await this.loadPortalSession(sessionToken);
        const requestedItems = this.normalizePortalOrderItems(rawItems);
        const queryRunner = this.dataSource.createQueryRunner();
        await queryRunner.connect();
        await queryRunner.startTransaction();

        try {
            const tabRows = await queryRunner.query(
                `SELECT id
                   FROM tabs
                  WHERE id = $1
                    AND tenant_id = $2
                    AND status <> 'CLOSED'
                  LIMIT 1
                  FOR UPDATE`,
                [credential.tabId, credential.tenantId],
            );
            if (!tabRows?.[0]) {
                throw new UnauthorizedException('A comanda foi encerrada.');
            }

            const ids = requestedItems.map((item) => item.menuItemId);
            const menuRows = await queryRunner.query(
                `SELECT id, name, price, destination, available, track_stock, stock_quantity, availability_windows,
                        item_type, option_groups
                   FROM menu_items
                  WHERE tenant_id = $1
                    AND id = ANY($2::uuid[])
                  FOR UPDATE`,
                [credential.tenantId, ids],
            );
            const menuById = new Map<string, Record<string, unknown>>(
                (menuRows || []).map((item: any) => [String(item.id), item as Record<string, unknown>]),
            );
            const grouped = new Map<string, Array<{ id: string; quantity: number; name: string; price: number }>>();

            for (const requested of requestedItems) {
                const menuItem = menuById.get(requested.menuItemId);
                if (!menuItem || !this.isPortalMenuItemAvailable(menuItem) || !this.isPortalSimpleMenuItem(menuItem)) {
                    throw new BadRequestException('Um dos itens selecionados não está mais disponível. Atualize o cardápio.');
                }
                const destination = String(menuItem.destination || '').toUpperCase();
                if (destination !== 'KITCHEN' && destination !== 'BAR') {
                    throw new BadRequestException('Um dos itens selecionados não possui destino de preparo válido.');
                }
                const items = grouped.get(destination) || [];
                items.push({
                    id: String(menuItem.id),
                    quantity: requested.quantity,
                    name: String(menuItem.name || 'Item'),
                    price: Number(menuItem.price || 0),
                });
                grouped.set(destination, items);
            }

            const createdOrderIds: string[] = [];
            for (const [destination, items] of grouped) {
                const orderId = uuidv4();
                await queryRunner.query(
                    `INSERT INTO orders (id, tenant_id, tab_id, destination, status, notes, created_at)
                     VALUES ($1, $2, $3, $4, 'PENDING', 'Pedido realizado pelo Portal da Comanda', NOW())`,
                    [orderId, credential.tenantId, credential.tabId, destination],
                );
                for (const item of items) {
                    await queryRunner.query(
                        `INSERT INTO order_items (id, order_id, menu_item_id, quantity, unit_price, created_at)
                         VALUES (gen_random_uuid(), $1, $2, $3, $4, NOW())`,
                        [orderId, item.id, item.quantity, item.price],
                    );
                }
                createdOrderIds.push(orderId);
            }

            await this.recordTabEvent(queryRunner, credential.tenantId, credential.tabId, 'PORTAL_ORDER_CREATED', {
                details: { order_ids: createdOrderIds, item_count: requestedItems.length },
            });
            await queryRunner.commitTransaction();
            await this.reconcileTabFinancialSnapshot(credential.tabId, credential.tenantId);
            void this.notifyPortalEvent(credential.tenantId, credential.tabId, 'order.updated');
            return { ok: true, orderIds: createdOrderIds };
        } catch (error) {
            await queryRunner.rollbackTransaction();
            throw error;
        } finally {
            await queryRunner.release();
        }
    }

    async updateTabCustomer(
        tenantId: string,
        tabId: string,
        data: { user_phone?: string; customer_instagram?: string },
        actor: TabActorContext,
    ) {
        const phone = this.normalizePhone(data?.user_phone);
        const instagram = this.normalizeInstagram(data?.customer_instagram);
        const queryRunner = this.dataSource.createQueryRunner();
        await queryRunner.connect();
        await queryRunner.startTransaction();

        try {
            const rows = await queryRunner.query(
                `SELECT id, public_code, user_phone, customer_instagram, status
                   FROM tabs
                  WHERE id = $1
                    AND tenant_id = $2
                  LIMIT 1
                  FOR UPDATE`,
                [tabId, tenantId],
            );
            const tab = rows?.[0];
            if (!tab) {
                throw new NotFoundException('Comanda não encontrada para este restaurante.');
            }
            if (String(tab.status || '').toUpperCase() !== 'OPEN') {
                throw new BadRequestException('Apenas comandas abertas podem ter os dados do cliente alterados.');
            }

            if (phone) {
                const duplicatePhone = await queryRunner.query(
                    `SELECT public_code
                       FROM tabs
                      WHERE tenant_id = $1
                        AND id <> $2
                        AND status = 'OPEN'
                        AND user_phone = $3
                      LIMIT 1`,
                    [tenantId, tabId, phone],
                );
                if (duplicatePhone?.[0]) {
                    throw new BadRequestException(
                        `Já existe uma comanda aberta para o telefone informado (${duplicatePhone[0].public_code || 'sem código'}).`,
                    );
                }
            }

            if (instagram) {
                const duplicateInstagram = await queryRunner.query(
                    `SELECT public_code
                       FROM tabs
                      WHERE tenant_id = $1
                        AND id <> $2
                        AND status = 'OPEN'
                        AND customer_instagram = $3
                      LIMIT 1`,
                    [tenantId, tabId, instagram],
                );
                if (duplicateInstagram?.[0]) {
                    throw new BadRequestException(
                        `Já existe uma comanda aberta para o Instagram informado (${duplicateInstagram[0].public_code || 'sem código'}).`,
                    );
                }
            }

            const updatedRows = await queryRunner.query(
                `UPDATE tabs
                    SET user_phone = $1,
                        customer_instagram = $2
                  WHERE id = $3
                    AND tenant_id = $4
              RETURNING id, public_code, user_phone, customer_instagram, table_id, status`,
                [phone || null, instagram || null, tabId, tenantId],
            );

            await this.recordTabEvent(queryRunner, tenantId, tabId, 'TAB_CUSTOMER_UPDATED', {
                actorUserId: actor.userId,
                actorName: actor.userName,
                details: {
                    previous_user_phone: String(tab.user_phone || '').trim() || null,
                    user_phone: phone || null,
                    previous_customer_instagram: String(tab.customer_instagram || '').trim() || null,
                    customer_instagram: instagram || null,
                },
            });

            await queryRunner.commitTransaction();
            const updated = Array.isArray(updatedRows?.[0]) ? updatedRows[0][0] : updatedRows?.[0];
            return {
                id: String(updated.id),
                publicCode: String(updated.public_code || ''),
                userPhone: String(updated.user_phone || '').trim() || null,
                customerInstagram: String(updated.customer_instagram || '').trim() || null,
                tableId: String(updated.table_id || '').trim() || null,
                status: String(updated.status || 'OPEN'),
            };
        } catch (error) {
            await queryRunner.rollbackTransaction();
            throw error;
        } finally {
            await queryRunner.release();
        }
    }

    async updateTabTable(
        tenantId: string,
        tabId: string,
        data: { table_id?: string | null },
        actor: TabActorContext,
    ) {
        const nextTableId = String(data?.table_id || '').trim() || null;
        const queryRunner = this.dataSource.createQueryRunner();
        await queryRunner.connect();
        await queryRunner.startTransaction();

        try {
            const tabRows = await queryRunner.query(
                `SELECT id, public_code, table_id, status
                   FROM tabs
                  WHERE id = $1
                    AND tenant_id = $2
                  LIMIT 1
                  FOR UPDATE`,
                [tabId, tenantId],
            );
            const tab = tabRows?.[0];
            if (!tab) {
                throw new NotFoundException('Comanda não encontrada para este restaurante.');
            }
            if (String(tab.status || '').toUpperCase() !== 'OPEN') {
                throw new BadRequestException('A mesa só pode ser alterada em comandas abertas.');
            }

            const previousTableId = String(tab.table_id || '').trim() || null;
            if (previousTableId === nextTableId) {
                await queryRunner.commitTransaction();
                return {
                    id: String(tab.id),
                    publicCode: String(tab.public_code || ''),
                    tableId: previousTableId,
                    status: 'OPEN',
                };
            }

            const relatedTableIds = Array.from(new Set([previousTableId, nextTableId].filter(Boolean)));
            const tableRows = relatedTableIds.length
                ? await queryRunner.query(
                    `SELECT id, number
                       FROM tables
                      WHERE tenant_id = $1
                        AND id = ANY($2::uuid[])
                      ORDER BY id
                      FOR UPDATE`,
                    [tenantId, relatedTableIds],
                )
                : [];
            const tableById = new Map<string, any>((tableRows || []).map((table: any) => [String(table.id), table]));

            if (nextTableId && !tableById.has(nextTableId)) {
                throw new NotFoundException('Mesa não encontrada para este restaurante.');
            }

            const updatedRows = await queryRunner.query(
                `UPDATE tabs
                    SET table_id = $1::uuid,
                        service_mode = CASE WHEN $1::uuid IS NULL THEN 'SEM_MESA' ELSE 'COM_MESA' END
                  WHERE id = $2
                    AND tenant_id = $3
              RETURNING id, public_code, table_id, status`,
                [nextTableId, tabId, tenantId],
            );

            if (nextTableId) {
                await queryRunner.query(
                    `UPDATE tables
                        SET status = 'OCCUPIED'
                      WHERE id = $1
                        AND tenant_id = $2`,
                    [nextTableId, tenantId],
                );
            }

            if (previousTableId) {
                const otherOpenRows = await queryRunner.query(
                    `SELECT COUNT(*)::int AS total
                       FROM tabs
                      WHERE tenant_id = $1
                        AND table_id = $2
                        AND status = 'OPEN'
                        AND id <> $3`,
                    [tenantId, previousTableId, tabId],
                );
                if (Number(otherOpenRows?.[0]?.total || 0) === 0) {
                    await queryRunner.query(
                        `UPDATE tables
                            SET status = 'AVAILABLE'
                          WHERE id = $1
                            AND tenant_id = $2`,
                        [previousTableId, tenantId],
                    );
                }
            }

            await this.recordTabEvent(queryRunner, tenantId, tabId, 'TAB_TABLE_UPDATED', {
                actorUserId: actor.userId,
                actorName: actor.userName,
                details: {
                    previous_table_id: previousTableId,
                    previous_table_number: previousTableId ? String(tableById.get(previousTableId)?.number || '') || null : null,
                    table_id: nextTableId,
                    table_number: nextTableId ? String(tableById.get(nextTableId)?.number || '') || null : null,
                },
            });

            await queryRunner.commitTransaction();
            const updated = updatedRows?.[0];
            return {
                id: String(updated.id),
                publicCode: String(updated.public_code || ''),
                tableId: updated.table_id ? String(updated.table_id) : null,
                tableNumber: nextTableId ? String(tableById.get(nextTableId)?.number || '') || null : null,
                status: String(updated.status || 'OPEN'),
            };
        } catch (error) {
            await queryRunner.rollbackTransaction();
            throw error;
        } finally {
            await queryRunner.release();
        }
    }

    private async generateTabPublicCode(tenantId: string) {
        for (let attempt = 0; attempt < 12; attempt += 1) {
            const publicCode = randomInt(0, 0x100000).toString(16).toUpperCase().padStart(5, '0');
            const existing = await this.tabRepo.findOne({ where: { tenantId, publicCode } });
            if (!existing) return publicCode;
        }
        throw new BadRequestException('Não foi possível reservar um código de comanda.');
    }

    private normalizePhone(value?: string) {
        const digits = String(value || '').replace(/\D/g, '');
        if (!digits) return '';
        if (digits.length < 10 || digits.length > 15) {
            throw new BadRequestException('Telefone inválido. Use DDD e número com 10 a 15 dígitos.');
        }
        return digits;
    }

    private normalizeInstagram(value?: string) {
        const normalized = String(value || '').trim().replace(/^@+/, '').toLowerCase();
        if (!normalized) return '';
        if (!/^[a-z0-9._]{1,80}$/.test(normalized)) {
            throw new BadRequestException('Instagram inválido.');
        }
        return `@${normalized}`;
    }

    private isUniqueViolation(error: any) {
        return String(error?.code || error?.driverError?.code || '') === '23505';
    }

    async getPaymentsOverview(tenantId: string, query: Record<string, string>) {
        const range = this.resolvePaymentsOverviewRange(query);
        const [paymentRows, tabRows] = await Promise.all([
            this.dataSource.query(
                `SELECT p.id,
                        p.tab_id,
                        p.payment_type,
                        p.amount,
                        p.status,
                        p.pix_txid,
                        p.method,
                        p.external_reference,
                        p.created_at,
                        p.paid_at,
                        p.expired_at,
                        p.updated_at,
                        p.metadata,
                        tb.status AS tab_status,
                        tb.total AS tab_total,
                        tb.paid_amount AS tab_paid_amount,
                        tb.user_phone,
                        t.number AS table_number,
                        la.status AS latest_attempt_status,
                        la.payment_method AS latest_attempt_method,
                        la.provider_payment_id AS latest_attempt_provider_payment_id,
                        la.provider_status AS latest_attempt_provider_status,
                        la.provider_status_detail AS latest_attempt_provider_detail,
                        la.requested_amount AS latest_attempt_requested_amount,
                        la.settled_at AS latest_attempt_settled_at,
                        la.created_at AS latest_attempt_created_at
                   FROM payments p
                   LEFT JOIN tabs tb
                     ON tb.id = p.tab_id
                   LEFT JOIN tables t
                     ON t.id = tb.table_id
                   LEFT JOIN LATERAL (
                        SELECT pa.status,
                               pa.payment_method,
                               pa.provider_payment_id,
                               pa.provider_status,
                               pa.provider_status_detail,
                               pa.requested_amount,
                               pa.settled_at,
                               pa.created_at
                          FROM payment_attempts pa
                         WHERE pa.payment_id = p.id
                         ORDER BY pa.created_at DESC
                         LIMIT 1
                   ) la ON TRUE
                  WHERE p.tenant_id = $1
                    AND p.tab_id IS NOT NULL
                    AND p.created_at >= $2
                    AND p.created_at < $3
                  ORDER BY p.created_at DESC
                  LIMIT 300`,
                [tenantId, range.startDate.toISOString(), range.endDate.toISOString()],
            ),
            this.dataSource.query(
                `WITH scoped_tabs AS (
                    SELECT DISTINCT p.tab_id
                      FROM payments p
                     WHERE p.tenant_id = $1
                       AND p.tab_id IS NOT NULL
                       AND p.created_at >= $2
                       AND p.created_at < $3
                ),
                latest_attempts AS (
                    SELECT DISTINCT ON (pa.payment_id)
                           pa.payment_id,
                           pa.status,
                           pa.requested_amount
                      FROM payment_attempts pa
                      JOIN payments p
                        ON p.id = pa.payment_id
                     WHERE p.tenant_id = $1
                     ORDER BY pa.payment_id, pa.created_at DESC
                ),
                payment_totals AS (
                    SELECT
                        p.tab_id,
                        COUNT(*)::int AS payments_count,
                        COALESCE(SUM(CASE WHEN p.status = 'CONFIRMED' THEN p.amount ELSE 0 END), 0) AS confirmed_total,
                        COALESCE(SUM(CASE WHEN p.status = 'PENDING' THEN p.amount ELSE 0 END), 0) AS pending_total,
                        COALESCE(SUM(CASE WHEN la.status = 'APPROVED' THEN COALESCE(la.requested_amount, p.amount) ELSE 0 END), 0) AS approved_attempt_total,
                        COALESCE(SUM(CASE WHEN la.status = 'REJECTED' THEN COALESCE(la.requested_amount, p.amount) ELSE 0 END), 0) AS rejected_attempt_total
                      FROM payments p
                      LEFT JOIN latest_attempts la
                        ON la.payment_id = p.id
                     WHERE p.tenant_id = $1
                       AND p.tab_id IS NOT NULL
                     GROUP BY p.tab_id
                )
                SELECT tb.id AS tab_id,
                        tb.status,
                        tb.total,
                        tb.paid_amount,
                        tb.user_phone,
                        t.number AS table_number,
                        COALESCE(pt.payments_count, 0)::int AS payments_count,
                        COALESCE(pt.confirmed_total, 0) AS confirmed_total,
                        COALESCE(pt.pending_total, 0) AS pending_total,
                        COALESCE(pt.approved_attempt_total, 0) AS approved_attempt_total,
                        COALESCE(pt.rejected_attempt_total, 0) AS rejected_attempt_total
                   FROM scoped_tabs st
                   JOIN tabs tb
                     ON tb.id = st.tab_id
                   LEFT JOIN tables t
                     ON t.id = tb.table_id
                   LEFT JOIN payment_totals pt
                     ON pt.tab_id = tb.id`,
                [tenantId, range.startDate.toISOString(), range.endDate.toISOString()],
            ),
        ]);

        const tabSummaryMap = new Map();
        const tabSummaries = (tabRows || []).map((row: any) => {
            const financial = this.buildTabFinancialSummary({
                subtotal: 0,
                serviceFee: 0,
                total: Number.parseFloat(String(row.total ?? '0')) || 0,
                paidAmount: Number.parseFloat(String(row.paid_amount ?? '0')) || 0,
                status: String(row.status || 'OPEN'),
                approvedPaymentsAmount: Number.parseFloat(String(row.confirmed_total ?? '0')) || 0,
                pendingPaymentsAmount: Number.parseFloat(String(row.pending_total ?? '0')) || 0,
                approvedAttemptAmount: Number.parseFloat(String(row.approved_attempt_total ?? '0')) || 0,
            });

            const summary = {
                tabId: String(row.tab_id),
                tableNumber: row.table_number ? String(row.table_number) : null,
                userPhone: String(row.user_phone || '').trim() || null,
                status: String(row.status || 'OPEN'),
                total: this.roundMoney(Number.parseFloat(String(row.total ?? '0')) || 0),
                paidAmount: this.roundMoney(Number.parseFloat(String(row.paid_amount ?? '0')) || 0),
                paymentsCount: Number(row.payments_count || 0),
                rejectedAttemptAmount: this.roundMoney(Number.parseFloat(String(row.rejected_attempt_total ?? '0')) || 0),
                financial,
            };

            tabSummaryMap.set(summary.tabId, summary);
            return summary;
        });

        const basePayments = (paymentRows || []).map((row: any) => {
            const tabId = String(row.tab_id || '');
            const tabSummary = tabSummaryMap.get(tabId) || null;
            const localStatus = String(row.status || 'PENDING').trim().toUpperCase();
            const latestAttemptStatus = String(row.latest_attempt_status || '').trim().toUpperCase() || null;
            const providerApprovedPending = latestAttemptStatus === 'APPROVED' && localStatus !== 'CONFIRMED';
            const refundPreparation = this.parseRefundPreparation(row.metadata);

            return {
                id: String(row.id),
                tabId,
                tableNumber: row.table_number ? String(row.table_number) : null,
                userPhone: String(row.user_phone || '').trim() || null,
                paymentType: String(row.payment_type || 'FULL'),
                amount: this.roundMoney(Number.parseFloat(String(row.amount ?? '0')) || 0),
                localStatus,
                pixTxid: String(row.pix_txid || '').trim() || null,
                method: String(row.method || row.latest_attempt_method || '').trim() || null,
                externalReference: String(row.external_reference || '').trim() || null,
                createdAt: row.created_at,
                paidAt: row.paid_at || null,
                expiredAt: row.expired_at || null,
                updatedAt: row.updated_at || null,
                latestAttemptStatus,
                latestAttemptMethod: String(row.latest_attempt_method || '').trim() || null,
                latestAttemptProviderPaymentId: String(row.latest_attempt_provider_payment_id || '').trim() || null,
                latestAttemptProviderStatus: String(row.latest_attempt_provider_status || '').trim() || null,
                latestAttemptProviderDetail: String(row.latest_attempt_provider_detail || '').trim() || null,
                latestAttemptRequestedAmount: this.roundMoney(Number.parseFloat(String(row.latest_attempt_requested_amount ?? '0')) || 0),
                latestAttemptSettledAt: row.latest_attempt_settled_at || null,
                latestAttemptCreatedAt: row.latest_attempt_created_at || null,
                providerApprovedPending,
                rejectedByProvider: latestAttemptStatus === 'REJECTED',
                tab: tabSummary,
                reconciliationStatus: tabSummary?.financial?.settlementStatus || (providerApprovedPending ? 'provider_pending' : 'awaiting_payment'),
                amountDue: Number(tabSummary?.financial?.amountDue || 0),
                reconciliationGap: Number(tabSummary?.financial?.reconciliationGap || 0),
                refundPreparation,
                refundEligibility: this.buildRefundEligibility({
                    paymentAmount: Number.parseFloat(String(row.amount ?? '0')) || 0,
                    localStatus,
                    latestAttemptStatus,
                    latestAttemptProviderPaymentId: String(row.latest_attempt_provider_payment_id || '').trim() || null,
                    paymentType: String(row.payment_type || 'FULL'),
                    tabStatus: String(tabSummary?.status || ''),
                    reconciliationGap: Number(tabSummary?.financial?.reconciliationGap || 0),
                    amountDue: Number(tabSummary?.financial?.amountDue || 0),
                    overpaymentAmount: Number(tabSummary?.financial?.overpaymentAmount || 0),
                    refundPreparation,
                }),
            };
        });

        const search = String(query?.search || '').trim().toLowerCase();
        const statusFilter = String(query?.status || 'ALL').trim().toUpperCase();
        const reconciliationFilter = String(query?.reconciliation || 'ALL').trim().toUpperCase();
        const payments = basePayments.filter((payment) =>
            this.matchesPaymentsOverviewFilters(payment, search, statusFilter, reconciliationFilter),
        );

        const visibleTabIds = new Set(payments.map((payment) => payment.tabId).filter(Boolean));
        const tabsWithDivergence = tabSummaries
            .filter((tab) => !visibleTabIds.size || visibleTabIds.has(tab.tabId))
            .filter((tab) =>
                Math.abs(Number(tab.financial?.reconciliationGap || 0)) >= 0.01
                || Number(tab.financial?.amountDue || 0) > 0
                || Number(tab.financial?.approvedAttemptAmount || 0) > Number(tab.financial?.approvedPaymentsAmount || 0),
            )
            .sort((left, right) => {
                const rightExposure = Math.abs(Number(right.financial?.reconciliationGap || 0)) + Number(right.financial?.amountDue || 0);
                const leftExposure = Math.abs(Number(left.financial?.reconciliationGap || 0)) + Number(left.financial?.amountDue || 0);
                return rightExposure - leftExposure;
            })
            .slice(0, 12);

        const summary = payments.reduce((acc, payment) => {
            acc.totalPayments += 1;
            acc.totalAmount += Number(payment.amount || 0);

            if (payment.localStatus === 'CONFIRMED') {
                acc.confirmedCount += 1;
                acc.confirmedAmount += Number(payment.amount || 0);
            } else {
                acc.pendingCount += 1;
                acc.pendingAmount += Number(payment.amount || 0);
            }

            if (payment.providerApprovedPending) {
                acc.providerApprovedPendingCount += 1;
                acc.providerApprovedPendingAmount += Number(payment.latestAttemptRequestedAmount || payment.amount || 0);
            }

            if (payment.rejectedByProvider) {
                acc.rejectedCount += 1;
                acc.rejectedAmount += Number(payment.latestAttemptRequestedAmount || payment.amount || 0);
            }

            if (payment.refundPreparation?.status === 'prepared') {
                acc.refundPreparedCount += 1;
                acc.refundPreparedAmount += Number(payment.refundPreparation.requestedAmount || payment.amount || 0);
            }

            return acc;
        }, {
            totalPayments: 0,
            totalAmount: 0,
            confirmedCount: 0,
            confirmedAmount: 0,
            pendingCount: 0,
            pendingAmount: 0,
            providerApprovedPendingCount: 0,
            providerApprovedPendingAmount: 0,
            rejectedCount: 0,
            rejectedAmount: 0,
            refundPreparedCount: 0,
            refundPreparedAmount: 0,
        });

        return {
            period: {
                start_date: this.toDateString(range.startDate),
                end_date: this.toDateString(new Date(range.endDate.getTime() - 1)),
                label: `${this.formatDateLabel(this.toDateString(range.startDate))} a ${this.formatDateLabel(this.toDateString(new Date(range.endDate.getTime() - 1)))}`,
            },
            filters_applied: {
                status: statusFilter,
                reconciliation: reconciliationFilter,
                search,
            },
            summary: {
                total_payments: summary.totalPayments,
                total_amount: this.roundMoney(summary.totalAmount),
                confirmed_count: summary.confirmedCount,
                confirmed_amount: this.roundMoney(summary.confirmedAmount),
                pending_count: summary.pendingCount,
                pending_amount: this.roundMoney(summary.pendingAmount),
                provider_approved_pending_count: summary.providerApprovedPendingCount,
                provider_approved_pending_amount: this.roundMoney(summary.providerApprovedPendingAmount),
                rejected_count: summary.rejectedCount,
                rejected_amount: this.roundMoney(summary.rejectedAmount),
                refund_prepared_count: summary.refundPreparedCount,
                refund_prepared_amount: this.roundMoney(summary.refundPreparedAmount),
                divergence_tabs_count: tabsWithDivergence.length,
                divergence_amount: this.roundMoney(
                    tabsWithDivergence.reduce((sum, tab) => sum + Math.abs(Number(tab.financial?.reconciliationGap || 0)) + Number(tab.financial?.amountDue || 0), 0),
                ),
            },
            tabs_with_divergence: tabsWithDivergence,
            payments,
        };
    }

    async refreshPaymentStatus(tenantId: string, paymentId: string) {
        const rows = await this.dataSource.query(
            `SELECT id, tab_id
               FROM payments
              WHERE id = $1
                AND tenant_id = $2
              LIMIT 1`,
            [paymentId, tenantId],
        );

        const payment = rows?.[0];
        if (!payment) {
            throw new NotFoundException('Pagamento não encontrado');
        }

        const status = await this.walletService.getPaymentStatus(tenantId, paymentId);
        const tabId = payment.tab_id ? String(payment.tab_id) : null;
        const detail = tabId ? await this.getTabDetails(tabId, tenantId) : null;

        return {
            payment_id: paymentId,
            status,
            tab_detail: detail
                ? {
                    id: detail.id,
                    tableNumber: detail.tableNumber,
                    status: detail.status,
                    financial: detail.financial,
                  }
                : null,
        };
    }

    async retryPaymentAsPix(tenantId: string, paymentId: string, actor: Pick<TabActorContext, 'userId' | 'userName'>) {
        const paymentRows = await this.dataSource.query(
            `SELECT p.id,
                    p.tab_id,
                    p.status,
                    p.method,
                    p.expired_at,
                    la.status AS latest_attempt_status
               FROM payments p
               LEFT JOIN LATERAL (
                    SELECT pa.status
                      FROM payment_attempts pa
                     WHERE pa.payment_id = p.id
                     ORDER BY pa.created_at DESC
                     LIMIT 1
               ) la ON TRUE
              WHERE p.id = $1
                AND p.tenant_id = $2
              LIMIT 1`,
            [paymentId, tenantId],
        );

        const payment = paymentRows?.[0];
        if (!payment) {
            throw new NotFoundException('Pagamento não encontrado');
        }

        const tabId = String(payment.tab_id || '').trim();
        if (!tabId) {
            throw new BadRequestException('Este pagamento não está vinculado a uma comanda');
        }

        if (String(payment.status || '').trim().toUpperCase() === 'CONFIRMED') {
            throw new BadRequestException('Pagamento já confirmado. Não é necessário gerar nova cobrança');
        }

        const latestAttemptStatus = String(payment.latest_attempt_status || '').trim().toUpperCase();
        const expiredAt = payment.expired_at ? new Date(payment.expired_at) : null;
        const activeSelectedPayment = this.isPendingPaymentStillActive({
            status: payment.status,
            latestAttemptStatus,
            expiredAt,
        });

        if (activeSelectedPayment) {
            throw new BadRequestException('Este pagamento ainda está ativo. Atualize o status antes de gerar uma nova cobrança PIX');
        }

        const tab = await this.loadTenantTabContext(tabId, tenantId);
        if (!tab) {
            throw new NotFoundException('Comanda não encontrada');
        }

        const amountDue = this.getAmountDue(tab.total, tab.paidAmount, tab.status);
        if (amountDue <= 0) {
            return {
                payment_id: paymentId,
                approved: true,
                amount_due: 0,
                message: 'A comanda já está quitada',
            };
        }

        const activePendingRows = await this.dataSource.query(
            `SELECT p.id,
                    p.status,
                    p.expired_at,
                    la.status AS latest_attempt_status
               FROM payments p
               LEFT JOIN LATERAL (
                    SELECT pa.status
                      FROM payment_attempts pa
                     WHERE pa.payment_id = p.id
                     ORDER BY pa.created_at DESC
                     LIMIT 1
               ) la ON TRUE
              WHERE p.tenant_id = $1
                AND p.tab_id = $2
                AND p.id <> $3`,
            [tenantId, tabId, paymentId],
        );

        const hasOtherActivePending = (activePendingRows || []).some((row: any) =>
            this.isPendingPaymentStillActive({
                status: row?.status,
                latestAttemptStatus: row?.latest_attempt_status,
                expiredAt: row?.expired_at ? new Date(row.expired_at) : null,
            }),
        );

        if (hasOtherActivePending) {
            throw new BadRequestException('Já existe outra cobrança pendente ativa para esta comanda. Atualize o status antes de gerar um novo PIX');
        }

        const orderId = await this.resolveAnchorOrderId(tabId, tenantId);
        const retry = await this.walletService.createPixPayment(tenantId, {
            order_id: orderId,
            amount: amountDue,
            description: this.buildCheckoutDescription(tab),
            payer_email: 'cliente@email.com',
            payer_name: 'Cliente',
            payer_cpf: '19119119100',
        });

        await this.dataSource.query(
            `INSERT INTO tab_events
                (id, tenant_id, tab_id, event_type, actor_user_id, actor_name, details, created_at)
             VALUES (gen_random_uuid(), $1, $2, $3, $4::uuid, $5, $6::jsonb, NOW())`,
            [
                tenantId,
                tabId,
                'PAYMENT_RETRY_CREATED',
                this.normalizeUuidOrNull(actor.userId),
                this.normalizeTextOrNull(actor.userName),
                JSON.stringify({
                    source_payment_id: paymentId,
                    new_payment_id: retry?.payment_id || null,
                    amount_due: amountDue,
                    method: 'PIX',
                }),
            ],
        );

        return {
            source_payment_id: paymentId,
            tab_id: tabId,
            amount_due: amountDue,
            retry,
        };
    }

    async preparePaymentRefund(tenantId: string, paymentId: string, actor: Pick<TabActorContext, 'userId' | 'userName' | 'reason' | 'requestedAmount'>) {
        const rows = await this.dataSource.query(
            `SELECT p.id,
                    p.tab_id,
                    p.payment_type,
                    p.amount,
                    p.status,
                    p.metadata,
                    tb.status AS tab_status,
                    tb.total AS tab_total,
                    tb.paid_amount AS tab_paid_amount,
                    la.status AS latest_attempt_status,
                    la.provider_payment_id AS latest_attempt_provider_payment_id
               FROM payments p
               LEFT JOIN tabs tb
                 ON tb.id = p.tab_id
               LEFT JOIN LATERAL (
                    SELECT pa.status,
                           pa.provider_payment_id
                      FROM payment_attempts pa
                     WHERE pa.payment_id = p.id
                     ORDER BY pa.created_at DESC
                     LIMIT 1
               ) la ON TRUE
              WHERE p.id = $1
                AND p.tenant_id = $2
              LIMIT 1`,
            [paymentId, tenantId],
        );

        const payment = rows?.[0];
        if (!payment) {
            throw new NotFoundException('Pagamento não encontrado');
        }

        const tabId = String(payment.tab_id || '').trim();
        if (!tabId) {
            throw new BadRequestException('Este pagamento não está vinculado a uma comanda');
        }

        const detail = await this.getTabDetails(tabId, tenantId);
        const reconciliationGap = Number(detail?.financial?.reconciliationGap || 0);
        const amountDue = Number(detail?.financial?.amountDue || 0);
        const overpaymentAmount = Number(detail?.financial?.overpaymentAmount || 0);
        const refundPreparation = this.parseRefundPreparation(payment.metadata);
        const eligibility = this.buildRefundEligibility({
            paymentAmount: Number.parseFloat(String(payment.amount ?? '0')) || 0,
            localStatus: String(payment.status || '').trim().toUpperCase(),
            latestAttemptStatus: String(payment.latest_attempt_status || '').trim().toUpperCase(),
            latestAttemptProviderPaymentId: String(payment.latest_attempt_provider_payment_id || '').trim() || null,
            paymentType: String(payment.payment_type || 'FULL'),
            tabStatus: String(payment.tab_status || '').trim().toUpperCase(),
            reconciliationGap,
            amountDue,
            overpaymentAmount,
            refundPreparation,
        });

        if (!eligibility.canPrepare) {
            throw new BadRequestException(eligibility.reason || 'Pagamento não está elegível para preparação de estorno');
        }

        const requestedAmount = actor.requestedAmount === undefined || actor.requestedAmount === null
            ? eligibility.recommendedAmount
            : this.roundMoney(Number(actor.requestedAmount || 0));

        if (requestedAmount <= 0 || requestedAmount > Number(payment.amount || 0)) {
            throw new BadRequestException('O valor de estorno deve ser maior que zero e menor ou igual ao valor do pagamento');
        }

        const reason = String(actor.reason || '').trim();
        if (!reason) {
            throw new BadRequestException('Informe o motivo operacional do estorno');
        }

        const nextMetadata = this.parseJsonObject(payment.metadata);
        const refundPreparedAt = new Date().toISOString();
        const refundPreparationPayload = {
            status: 'prepared',
            preparedAt: refundPreparedAt,
            prepared_by_user_id: this.normalizeUuidOrNull(actor.userId),
            prepared_by_user_name: this.normalizeTextOrNull(actor.userName),
            preparedByUserId: this.normalizeUuidOrNull(actor.userId),
            preparedByUserName: this.normalizeTextOrNull(actor.userName),
            reason,
            requested_amount: requestedAmount,
            requestedAmount,
            provider_payment_id: eligibility.providerPaymentId,
            providerPaymentId: eligibility.providerPaymentId,
            local_status: eligibility.localStatus,
            provider_status: eligibility.providerStatus,
            payment_amount: this.roundMoney(Number(payment.amount || 0)),
            risk_level: eligibility.riskLevel,
            notes: eligibility.notes,
        };

        nextMetadata.refund_preparation = refundPreparationPayload;

        await this.dataSource.query(
            `UPDATE payments
                SET metadata = $3::jsonb,
                    updated_at = NOW()
              WHERE id = $1
                AND tenant_id = $2`,
            [paymentId, tenantId, JSON.stringify(nextMetadata)],
        );

        await this.dataSource.query(
            `INSERT INTO tab_events
                (id, tenant_id, tab_id, event_type, actor_user_id, actor_name, details, created_at)
             VALUES (gen_random_uuid(), $1, $2, $3, $4::uuid, $5, $6::jsonb, NOW())`,
            [
                tenantId,
                tabId,
                'PAYMENT_REFUND_PREPARED',
                this.normalizeUuidOrNull(actor.userId),
                this.normalizeTextOrNull(actor.userName),
                JSON.stringify({
                    payment_id: paymentId,
                    requested_amount: requestedAmount,
                    reason,
                    risk_level: eligibility.riskLevel,
                    provider_payment_id: eligibility.providerPaymentId,
                }),
            ],
        );

        return {
            payment_id: paymentId,
            tab_id: tabId,
            refund_preparation: refundPreparationPayload,
            refund_eligibility: eligibility,
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

    async approveRequest(requestId: string, tenantId: string, tableId?: string, approvedByUserId?: string, approvedByUserName?: string) {
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
        req.approvedByUserId = this.normalizeUuidOrNull(approvedByUserId);
        req.approvedByUserName = this.normalizeTextOrNull(approvedByUserName);
        await this.tableRequestRepo.save(req);

        // Note: The actual Go-Core updates are triggered by the event
        await this.amqpService.publishTableEvent(req.id, 'APPROVE');

        return req;
    }

    async rejectRequest(requestId: string, tenantId: string) {
        const req = await this.tableRequestRepo.findOne({ where: { id: requestId, tenantId } });
        if (!req) throw new Error('Request not found');

        if (req.status === RequestStatus.APPROVED) {
            throw new Error('Approved requests cannot be rejected');
        }
        if (req.status === RequestStatus.REJECTED) {
            return req;
        }

        // Core owns the final transition and the WhatsApp notification. Keeping
        // this pending until the event is consumed prevents a lost rejection.
        await this.tableRequestRepo.save(req);
        await this.amqpService.publishTableEvent(req.id, 'REJECT');

        return req;
    }

    async createManualRequest(tenantId: string, data: { tableId: string, userPhone: string, paxCount: number }, approvedByUserId?: string, approvedByUserName?: string) {
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
        await this.approveRequest(req.id, tenantId, undefined, approvedByUserId, approvedByUserName);

        return req;
    }

    async finalizeCloseRequest(requestId: string, tenantId: string, staffUserId?: string, staffUserName?: string) {
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
            resolvedByUserName: staffUserName,
            requestId,
            closureSource: 'CLOSE_REQUEST',
        });

        return {
            ok: true,
            requestId,
            alreadyClosed: result.alreadyClosed,
            tab: result.tab,
        };
    }

    async finalizeTab(
        tabId: string,
        tenantId: string,
        staffUserId?: string,
        staffUserName?: string,
        manualPaymentMethod?: string,
    ) {
        const result = await this.finalizeTabInternal(tabId, tenantId, {
            resolvedByUserId: staffUserId,
            resolvedByUserName: staffUserName,
            closureSource: 'MANUAL_SETTLEMENT',
            manualPaymentMethod,
        });

        return {
            ok: true,
            alreadyClosed: result.alreadyClosed,
            tab: result.tab,
        };
    }

    async confirmApprovedPaymentSettlement(tenantId: string, tabId: string) {
        const result = await this.finalizeTabInternal(tabId, tenantId, {
            closureSource: 'PAYMENT_APPROVED',
        });
        return {
            ok: true,
            alreadyClosed: result.alreadyClosed,
            tab: result.tab,
        };
    }

    async getTabDetails(tabId: string, tenantId: string, currentUserRole?: string) {
        const [tabRows, paymentRows, closeRequestRows, eventRows, allocationRows, itemRows] = await Promise.all([
            this.dataSource.query(
                `SELECT tb.id,
                        tb.tenant_id,
                        tb.table_id,
                        tb.user_phone,
                        tb.customer_instagram,
                        tb.payment_notifier_phone,
                        tb.public_code,
                        tb.service_mode,
                        tb.opening_channel,
                        tb.exit_validated_at,
                        tb.exit_validation_method,
                        tb.subtotal,
                        tb.service_fee,
                        tb.total,
                        tb.paid_amount,
                        tb.status,
                        tb.opened_at,
                        tb.opened_by_user_id,
                        tb.opened_by_user_name,
                        tb.closed_at,
                        tb.closed_by_user_id,
                        tb.closed_by_user_name,
                        tb.reopened_at,
                        tb.reopened_by_user_id,
                        tb.reopened_by_user_name,
                        t.number AS table_number,
                        tn.settings AS tenant_settings
                   FROM tabs tb
                   LEFT JOIN tables t
                     ON t.id = tb.table_id
                   LEFT JOIN tenants tn
                     ON tn.id = tb.tenant_id
                  WHERE tb.id = $1
                    AND tb.tenant_id = $2
                  LIMIT 1`,
                [tabId, tenantId],
            ),
            this.dataSource.query(
                `SELECT p.id,
                        p.payment_type,
                        p.amount,
                        p.status,
                        p.pix_txid,
                        p.method,
                        p.external_reference,
                        p.created_at,
                        p.paid_at,
                        p.expired_at,
                        p.updated_at,
                        p.metadata,
                        la.status AS latest_attempt_status,
                        la.payment_method AS latest_attempt_method,
                        la.provider_payment_id AS latest_attempt_provider_payment_id,
                        la.provider_status AS latest_attempt_provider_status,
                        la.provider_status_detail AS latest_attempt_provider_detail,
                        la.requested_amount AS latest_attempt_requested_amount,
                        la.settled_at AS latest_attempt_settled_at,
                        la.created_at AS latest_attempt_created_at
                   FROM payments p
                   LEFT JOIN LATERAL (
                        SELECT pa.status,
                               pa.payment_method,
                               pa.provider_payment_id,
                               pa.provider_status,
                               pa.provider_status_detail,
                               pa.requested_amount,
                               pa.settled_at,
                               pa.created_at
                          FROM payment_attempts pa
                         WHERE pa.payment_id = p.id
                         ORDER BY pa.created_at DESC
                         LIMIT 1
                   ) la ON TRUE
                  WHERE p.tenant_id = $1
                    AND p.tab_id = $2
                  ORDER BY p.created_at DESC`,
                [tenantId, tabId],
            ),
            this.dataSource.query(
                `SELECT id,
                        status,
                        description,
                        created_at,
                        resolved_at,
                        resolved_by
                   FROM service_requests
                  WHERE tenant_id = $1
                    AND tab_id = $2
                    AND request_type = 'CLOSE_BILL'
                  ORDER BY created_at DESC`,
                [tenantId, tabId],
            ),
            this.dataSource.query(
                `SELECT id,
                        event_type,
                        actor_user_id,
                        actor_name,
                        details,
                        created_at
                   FROM tab_events
                  WHERE tenant_id = $1
                    AND tab_id = $2
                  ORDER BY created_at DESC
                  LIMIT 200`,
                [tenantId, tabId],
            ).catch(() => []),
            this.dataSource.query(
                `SELECT COUNT(*)::int AS allocation_count
                   FROM payment_item_allocations pia
                   JOIN payments p
                     ON p.id = pia.payment_id
                  WHERE p.tenant_id = $1
                    AND p.tab_id = $2`,
                [tenantId, tabId],
            ).catch(() => [{ allocation_count: 0 }]),
            this.dataSource.query(
                `SELECT oi.id,
                        oi.order_id,
                        oi.menu_item_id,
                        oi.quantity,
                        oi.unit_price,
                        oi.observations,
                        oi.selected_options,
                        oi.created_at,
                        o.created_at AS order_created_at,
                        o.status AS order_status,
                        mi.name AS menu_item_name,
                        COALESCE(SUM(pia.allocated_quantity), 0)::int AS allocated_quantity
                   FROM orders o
                   JOIN order_items oi
                     ON oi.order_id = o.id
                   LEFT JOIN menu_items mi
                     ON mi.id = oi.menu_item_id
                   LEFT JOIN payment_item_allocations pia
                     ON pia.order_item_id = oi.id
                  WHERE o.tenant_id = $1
                    AND o.tab_id = $2
                    AND o.status <> 'CANCELED'
                  GROUP BY oi.id, oi.order_id, oi.menu_item_id, oi.quantity, oi.unit_price, oi.observations, oi.selected_options, oi.created_at, o.created_at, o.status, mi.name
                  ORDER BY o.created_at ASC, oi.created_at ASC`,
                [tenantId, tabId],
            ).catch(() => []),
        ]);

        const tab = tabRows?.[0];
        if (!tab) {
            throw new NotFoundException('Comanda não encontrada');
        }

        const payments = (paymentRows || []).map((row: any) => {
            const metadata = this.parseJsonObject(row.metadata);
            const manualPayment = String(metadata.source || '').trim().toUpperCase() === 'MANUAL_SETTLEMENT';
            const method = String(row.method || row.latest_attempt_method || '').trim() || null;
            return {
                id: String(row.id),
                paymentType: String(row.payment_type || 'FULL'),
                amount: this.roundMoney(Number.parseFloat(String(row.amount ?? '0')) || 0),
                status: String(row.status || 'PENDING'),
                pixTxid: String(row.pix_txid || ''),
                method,
                methodLabel: this.formatPaymentMethodLabel(method),
                channel: manualPayment ? 'MANUAL' : (metadata.provider ? 'ONLINE' : 'UNKNOWN'),
                recordedByUserName: manualPayment ? String(metadata.recorded_by_user_name || '').trim() || null : null,
                externalReference: String(row.external_reference || '').trim() || null,
                createdAt: row.created_at,
                paidAt: row.paid_at,
                expiredAt: row.expired_at,
                updatedAt: row.updated_at,
                latestAttemptStatus: String(row.latest_attempt_status || '').trim() || null,
                latestAttemptMethod: String(row.latest_attempt_method || '').trim() || null,
                latestAttemptProviderPaymentId: String(row.latest_attempt_provider_payment_id || '').trim() || null,
                latestAttemptProviderStatus: String(row.latest_attempt_provider_status || '').trim() || null,
                latestAttemptProviderDetail: String(row.latest_attempt_provider_detail || '').trim() || null,
                latestAttemptRequestedAmount: this.roundMoney(Number.parseFloat(String(row.latest_attempt_requested_amount ?? '0')) || 0),
                latestAttemptSettledAt: row.latest_attempt_settled_at || null,
                latestAttemptCreatedAt: row.latest_attempt_created_at || null,
                refundPreparation: this.parseRefundPreparation(row.metadata),
            };
        });

        const closeRequests = (closeRequestRows || []).map((row: any) => ({
            id: String(row.id),
            status: String(row.status || 'PENDING'),
            description: String(row.description || '').trim() || null,
            createdAt: row.created_at,
            resolvedAt: row.resolved_at || null,
            resolvedBy: row.resolved_by || null,
        }));

        const approvedPaymentsAmount = this.roundMoney(
            payments
                .filter((payment) => payment.status === 'CONFIRMED')
                .reduce((sum, payment) => sum + payment.amount, 0),
        );
        const pendingPaymentsAmount = this.roundMoney(
            payments
                .filter((payment) => payment.status === 'PENDING')
                .reduce((sum, payment) => sum + payment.amount, 0),
        );
        const approvedAttemptAmount = this.roundMoney(
            payments
                .filter((payment) => payment.latestAttemptStatus === 'APPROVED')
                .reduce((sum, payment) => sum + (payment.latestAttemptRequestedAmount || payment.amount), 0),
        );

        const financial = this.buildTabFinancialSummary({
            subtotal: Number.parseFloat(String(tab.subtotal ?? '0')) || 0,
            serviceFee: Number.parseFloat(String(tab.service_fee ?? '0')) || 0,
            total: Number.parseFloat(String(tab.total ?? '0')) || 0,
            paidAmount: Number.parseFloat(String(tab.paid_amount ?? '0')) || 0,
            status: String(tab.status || 'OPEN'),
            approvedPaymentsAmount,
            pendingPaymentsAmount,
            approvedAttemptAmount,
        });

        const enrichedPayments = payments.map((payment) => ({
            ...payment,
            refundEligibility: this.buildRefundEligibility({
                paymentAmount: Number(payment.amount || 0),
                localStatus: String(payment.status || '').trim().toUpperCase(),
                latestAttemptStatus: String(payment.latestAttemptStatus || '').trim().toUpperCase(),
                latestAttemptProviderPaymentId: String(payment.latestAttemptProviderPaymentId || '').trim() || null,
                paymentType: String(payment.paymentType || 'FULL'),
                tabStatus: String(tab.status || '').trim().toUpperCase(),
                reconciliationGap: Number(financial.reconciliationGap || 0),
                amountDue: Number(financial.amountDue || 0),
                overpaymentAmount: Number(financial.overpaymentAmount || 0),
                refundPreparation: payment.refundPreparation,
            }),
        }));

        const allocationCount = Number(allocationRows?.[0]?.allocation_count || 0);
        const tenantSettings = this.parseTenantSettings(tab.tenant_settings);
        const items = (itemRows || []).map((row: any) => {
            const quantity = Number(row.quantity || 0);
            const allocatedQuantity = Math.max(0, Math.min(quantity, Number(row.allocated_quantity || 0)));
            const unitPrice = this.roundMoney(Number.parseFloat(String(row.unit_price ?? '0')) || 0);
            return {
                id: String(row.id),
                orderId: String(row.order_id),
                menuItemId: row.menu_item_id ? String(row.menu_item_id) : null,
                name: String(row.menu_item_name || 'Item sem nome'),
                quantity,
                unitPrice,
                lineSubtotal: this.roundMoney(quantity * unitPrice),
                allocatedQuantity,
                remainingQuantity: Math.max(0, quantity - allocatedQuantity),
                observations: String(row.observations || '').trim() || null,
                selectedOptions: Array.isArray(row.selected_options) ? row.selected_options : [],
                createdAt: row.created_at,
                orderCreatedAt: row.order_created_at,
                orderStatus: String(row.order_status || 'PENDING'),
            };
        });

        return {
            id: String(tab.id),
            tenantId: String(tab.tenant_id),
            tableId: tab.table_id ? String(tab.table_id) : null,
            tableNumber: tab.table_number || null,
            publicCode: String(tab.public_code || '').trim() || null,
            serviceMode: String(tab.service_mode || 'COM_MESA').trim() || 'COM_MESA',
            exitValidatedAt: tab.exit_validated_at || null,
            exitValidationMethod: String(tab.exit_validation_method || '').trim() || null,
            userPhone: String(tab.user_phone || '').trim() || null,
            customerInstagram: String(tab.customer_instagram || '').trim() || null,
            paymentNotifierPhone: String(tab.payment_notifier_phone || '').trim() || null,
            openingChannel: String(tab.opening_channel || 'LEGACY').trim() || 'LEGACY',
            status: String(tab.status || 'OPEN'),
            openedAt: tab.opened_at,
            openedByUserId: tab.opened_by_user_id || null,
            openedByUserName: String(tab.opened_by_user_name || '').trim() || null,
            closedAt: tab.closed_at || null,
            closedByUserId: tab.closed_by_user_id || null,
            closedByUserName: String(tab.closed_by_user_name || '').trim() || null,
            reopenedAt: tab.reopened_at || null,
            reopenedByUserId: tab.reopened_by_user_id || null,
            reopenedByUserName: String(tab.reopened_by_user_name || '').trim() || null,
            financial,
            split: this.buildTabSplitSummary(enrichedPayments, allocationCount, tenantSettings),
            items,
            closeRequests,
            payments: enrichedPayments,
            history: this.buildTabHistory({
                tab,
                closeRequests,
                payments: enrichedPayments,
                eventRows: eventRows || [],
            }),
            permissions: {
                ...this.buildTabReopenPolicy(
                    {
                        status: String(tab.status || 'OPEN'),
                        total: Number.parseFloat(String(tab.total ?? '0')) || 0,
                        paidAmount: Number.parseFloat(String(tab.paid_amount ?? '0')) || 0,
                        approvedPaymentsAmount,
                        approvedAttemptAmount,
                    },
                    currentUserRole,
                ),
            },
        };
    }

    async lookupTabForStaff(tenantId: string, rawValue?: string, currentUserRole?: string) {
        const lookup = this.normalizeStaffTabLookup(rawValue);
        if (!lookup.value) {
            throw new BadRequestException('Informe o número da comanda ou escaneie um QR Code.');
        }

        const rows = await this.dataSource.query(
            `SELECT id, public_code
               FROM tabs
              WHERE tenant_id = $1
                AND (
                    UPPER(TRIM(COALESCE(public_code, ''))) = UPPER($2)
                    OR LOWER(id::text) = LOWER($2)
                )
              ORDER BY opened_at DESC
              LIMIT 1`,
            [tenantId, lookup.value],
        );
        const tab = rows?.[0];
        if (!tab) {
            throw new NotFoundException(`Não encontrei a comanda ${lookup.value}.`);
        }

        const details = await this.getTabDetails(String(tab.id), tenantId, currentUserRole);
        return {
            ...details,
            lookup: {
                value: lookup.value,
                source: lookup.source,
                matchedBy: String(tab.public_code || '').toUpperCase() === lookup.value.toUpperCase() ? 'PUBLIC_CODE' : 'TAB_ID',
            },
        };
    }

    private normalizeStaffTabLookup(rawValue?: string) {
        const original = String(rawValue || '').trim();
        if (!original) return { value: '', source: 'manual' };

        try {
            const url = new URL(original);
            const query = new URLSearchParams(url.search);
            const hash = new URLSearchParams(url.hash.replace(/^#/, ''));
            const tabId = query.get('tab_id') || hash.get('tab_id');
            if (tabId) return { value: tabId.trim(), source: 'qr' };
        } catch (_error) {
            // Manual input is not required to be a URL.
        }

        const value = original
            .replace(/^\s*#\s*/, '')
            .replace(/^\s*(comanda|cmd)\s*[:#.-]?\s*/i, '')
            .trim()
            .toUpperCase();
        return { value, source: 'manual' };
    }

    async reopenTab(tabId: string, tenantId: string, actor: TabActorContext) {
        const queryRunner = this.dataSource.createQueryRunner();
        await queryRunner.connect();
        await queryRunner.startTransaction();

        try {
            const actorRole = String(actor.userRole || '').trim().toUpperCase();
            const reason = this.normalizeTextOrNull(actor.reason);
            if (!this.isManagerRole(actorRole)) {
                throw new BadRequestException('Somente administrador ou gerente pode alterar comandas fechadas');
            }
            if (!reason) {
                throw new BadRequestException('Informe o motivo da alteração para reabrir a comanda');
            }

            const tabRows = await queryRunner.query(
                `SELECT id,
                        tenant_id,
                        table_id,
                        total,
                        paid_amount,
                        status,
                        closed_at,
                        reopened_at
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

            if (String(tab.status || '').trim().toUpperCase() !== 'CLOSED') {
                throw new BadRequestException('Apenas comandas fechadas podem ser reabertas');
            }

            const paymentSummaryRows = await queryRunner.query(
                `SELECT COALESCE(SUM(CASE WHEN status = 'CONFIRMED' THEN amount ELSE 0 END), 0) AS confirmed_total
                   FROM payments
                  WHERE tenant_id = $1
                    AND tab_id = $2`,
                [tenantId, tabId],
            );
            const approvedAttemptRows = await queryRunner.query(
                `SELECT COUNT(*)::int AS approved_attempts
                   FROM payment_attempts
                  WHERE tenant_id = $1
                    AND tab_id = $2
                    AND status = 'APPROVED'`,
                [tenantId, tabId],
            );

            const confirmedTotal = this.roundMoney(Number.parseFloat(String(paymentSummaryRows?.[0]?.confirmed_total ?? '0')) || 0);
            const approvedAttempts = Number(approvedAttemptRows?.[0]?.approved_attempts || 0);
            const reopenPolicy = this.buildTabReopenPolicy(
                {
                    status: 'CLOSED',
                    total: Number.parseFloat(String(tab.total ?? '0')) || 0,
                    paidAmount: Number.parseFloat(String(tab.paid_amount ?? '0')) || 0,
                    approvedPaymentsAmount: confirmedTotal,
                    approvedAttemptAmount: approvedAttempts > 0 ? confirmedTotal : 0,
                },
                actorRole,
            );

            if (!reopenPolicy.canReopen) {
                throw new BadRequestException(reopenPolicy.reason || 'Reabertura não permitida para esta comanda');
            }

            const reopenedAt = new Date();
            const changeAudit = this.buildTabMutationAudit({
                before: {
                    status: String(tab.status || 'CLOSED'),
                    closed_at: tab.closed_at || null,
                    reopened_at: tab.reopened_at || null,
                    total: this.roundMoney(Number.parseFloat(String(tab.total ?? '0')) || 0),
                    paid_amount: this.roundMoney(Number.parseFloat(String(tab.paid_amount ?? '0')) || 0),
                },
                after: {
                    status: 'OPEN',
                    closed_at: null,
                    reopened_at: reopenedAt.toISOString(),
                    total: this.roundMoney(Number.parseFloat(String(tab.total ?? '0')) || 0),
                    paid_amount: this.roundMoney(Number.parseFloat(String(tab.paid_amount ?? '0')) || 0),
                },
            });

            await queryRunner.query(
                `UPDATE tabs
                    SET status = 'OPEN',
                        closed_at = NULL,
                        reopened_at = $5,
                        reopened_by_user_id = COALESCE($3::uuid, reopened_by_user_id),
                        reopened_by_user_name = COALESCE($4, reopened_by_user_name)
                  WHERE id = $1
                    AND tenant_id = $2`,
                [
                    tabId,
                    tenantId,
                    this.normalizeUuidOrNull(actor.userId),
                    this.normalizeTextOrNull(actor.userName),
                    reopenedAt,
                ],
            );

            if (tab.table_id) {
                await queryRunner.query(
                    `UPDATE tables
                        SET status = 'OCCUPIED'
                      WHERE id = $1
                        AND tenant_id = $2`,
                    [tab.table_id, tenantId],
                );
            }

            await this.recordTabEvent(queryRunner, tenantId, tabId, 'TAB_REOPENED', {
                actorUserId: actor.userId,
                actorName: actor.userName,
                details: {
                    reason,
                    actor_role: actorRole || null,
                    confirmed_payments_amount: confirmedTotal,
                    approved_attempts: approvedAttempts,
                    fields_changed: changeAudit.fieldsChanged,
                    before: changeAudit.before,
                    after: changeAudit.after,
                },
            });

            const updatedRows = await queryRunner.query(
                `SELECT id, tenant_id, table_id, total, paid_amount, status, opened_at, closed_at, reopened_at
                   FROM tabs
                  WHERE id = $1
                    AND tenant_id = $2
                  LIMIT 1`,
                [tabId, tenantId],
            );

            await queryRunner.commitTransaction();

            return {
                ok: true,
                tab: updatedRows?.[0] || tab,
            };
        } catch (error) {
            await queryRunner.rollbackTransaction();
            throw error;
        } finally {
            await queryRunner.release();
        }
    }

    async getPublicTabById(tabId: string, accessToken?: string) {
        const tab = await this.loadPublicTabContext(tabId, accessToken);
        if (!tab) {
            throw new NotFoundException('Comanda não encontrada');
        }

        return this.buildPublicTabPayload(tab);
    }

    async validatePublicExit(tabId: string, accessToken?: string) {
        const tab = await this.loadPublicTabContext(tabId, accessToken);
        if (!tab) {
            throw new NotFoundException('Comanda não encontrada');
        }

        const [orderRows, paymentRows, tabRows] = await Promise.all([
            this.dataSource.query(
                `SELECT COUNT(*)::int AS active_orders
                   FROM orders
                  WHERE tenant_id = $1
                    AND tab_id = $2
                    AND status NOT IN ('DELIVERED', 'CANCELED')`,
                [tab.tenantId, tabId],
            ),
            this.dataSource.query(
                `SELECT COUNT(*)::int AS open_payments
                   FROM payments p
                  WHERE p.tenant_id = $1
                    AND p.tab_id = $2
                    AND (
                        p.status = 'PENDING'
                        OR EXISTS (
                            SELECT 1
                              FROM payment_attempts pa
                             WHERE pa.payment_id = p.id
                               AND pa.status IN ('PENDING', 'IN_PROCESS')
                        )
                    )`,
                [tab.tenantId, tabId],
            ),
            this.dataSource.query(
                `SELECT exit_validated_at, public_code
                   FROM tabs
                  WHERE id = $1
                    AND tenant_id = $2
                  LIMIT 1`,
                [tabId, tab.tenantId],
            ),
        ]);

        const activeOrders = Number(orderRows?.[0]?.active_orders || 0);
        const openPayments = Number(paymentRows?.[0]?.open_payments || 0);
        const alreadyValidatedAt = tabRows?.[0]?.exit_validated_at || null;

        if (alreadyValidatedAt) {
            return {
                ok: true,
                allowed: true,
                alreadyValidated: true,
                tabId,
                publicCode: String(tabRows?.[0]?.public_code || ''),
                validatedAt: alreadyValidatedAt,
            };
        }

        if (activeOrders > 0) {
            throw new BadRequestException('Ainda existem pedidos em preparo ou aguardando entrega.');
        }
        if (openPayments > 0) {
            throw new BadRequestException('Existe um pagamento em aberto ou em processamento.');
        }
        if (tab.amountDue > 0) {
            throw new BadRequestException(`Existe saldo pendente de R$ ${tab.amountDue.toFixed(2).replace('.', ',')}.`);
        }

        if (String(tab.status || '').toUpperCase() !== 'CLOSED') {
            await this.finalizeTabInternal(tabId, tab.tenantId, { closureSource: 'EXIT_QR' });
        }

        const validatedAt = new Date();
        await this.dataSource.query(
            `UPDATE tabs
                SET exit_validated_at = $1,
                    exit_validation_method = 'PUBLIC_QR'
              WHERE id = $2
                AND tenant_id = $3
                AND exit_validated_at IS NULL`,
            [validatedAt, tabId, tab.tenantId],
        );

        return {
            ok: true,
            allowed: true,
            alreadyValidated: false,
            tabId,
            publicCode: String(tabRows?.[0]?.public_code || ''),
            validatedAt,
        };
    }

    async createPublicPixPayment(tabId: string, accessToken: string | undefined, payload: Record<string, unknown>) {
        const tab = await this.loadPublicTabContext(tabId, accessToken);
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

    async createPublicCardPayment(tabId: string, accessToken: string | undefined, payload: Record<string, unknown>) {
        const tab = await this.loadPublicTabContext(tabId, accessToken);
        if (!tab) {
            throw new NotFoundException('Comanda não encontrada');
        }

        const cardCheckoutConfig = this.resolvePublicCardCheckoutConfig(tab.tenantSettings);
        if (!cardCheckoutConfig.enabled) {
            throw new BadRequestException(cardCheckoutConfig.reason);
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
        const paymentMethodId = String(payload['payment_method_id'] || '').trim();
        if (!paymentMethodId) {
            throw new BadRequestException('Não foi possível identificar a bandeira do cartão');
        }

        const issuerId = String(payload['issuer_id'] || '').trim();
        const cardPayload: Record<string, unknown> = {
            order_id: orderId,
            amount: amountDue,
            token: String(payload['token'] || '').trim(),
            description: this.buildCheckoutDescription(tab),
            installments: Math.max(1, Number(payload['installments'] || 1) || 1),
            payment_method_id: paymentMethodId,
            payer_email: this.resolvePayerField(payload['payer_email'], 'cliente@email.com'),
            payer_cpf: this.resolveCpf(payload['payer_cpf']),
        };
        if (issuerId) {
            cardPayload.issuer_id = issuerId;
        }

        const response = await this.walletService.createCardPayment(tab.tenantId, cardPayload);

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

    async getPublicPaymentStatus(tabId: string, paymentId: string, accessToken?: string) {
        const tab = await this.loadPublicTabContext(tabId, accessToken);
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
                    tb.public_code AS tab_public_code,
                    lm.message AS last_message,
                    lm.sender_type AS last_sender_type,
                    lm.created_at AS last_message_created_at
               FROM waiter_chats wc
               LEFT JOIN tables t
                 ON t.id = wc.table_id
              LEFT JOIN tabs tb
                 ON tb.id = wc.tab_id
                AND tb.tenant_id = wc.tenant_id
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
            userPhone: String(row.user_phone || '').startsWith('portal:')
                ? `Portal · comanda ${String(row.tab_public_code || '').trim() || '--'}`
                : String(row.user_phone || ''),
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

        const rows = await this.dataSource.query(
            `SELECT id, user_phone, status, tab_id
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

        const portalOnly = String(chat.user_phone || '').startsWith('portal:');
        if (!portalOnly) {
            await this.assertTenantCanSendWhatsApp(tenantId);
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

        if (!portalOnly) {
            await this.dataSource.query(
                `INSERT INTO outbox_messages
                    (tenant_id, destination, recipient, payload, sent, attempts, max_attempts, created_at)
                 VALUES ($1, 'whatsapp', $2, $3, false, 0, 3, NOW())`,
                [tenantId, String(chat.user_phone || ''), text],
            );
        }

        if (chat.tab_id) {
            void this.notifyPortalEvent(tenantId, String(chat.tab_id), 'chat.updated');
        }
        return { ok: true, deliveryChannel: portalOnly ? 'PORTAL' : 'WHATSAPP' };
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
        options: {
            resolvedByUserId?: string;
            resolvedByUserName?: string;
            requestId?: string;
            closureSource?: string;
            manualPaymentMethod?: string;
        },
    ) {
        const queryRunner = this.dataSource.createQueryRunner();
        await queryRunner.connect();
        await queryRunner.startTransaction();

        try {
            const tabRows = await queryRunner.query(
                `SELECT id,
                        tenant_id,
                        table_id,
                        user_phone,
                        total,
                        paid_amount,
                        status,
                        opened_at,
                        closed_at,
                        closed_notified_at,
                        closed_by_user_id,
                        closed_by_user_name
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

            const financialSnapshot = await this.reconcileTabFinancialSnapshot(tabId, tenantId, queryRunner);
            const total = financialSnapshot.total;
            const paidAmount = financialSnapshot.paidAmount;
            const confirmedPaymentsAmount = financialSnapshot.confirmedPaymentsAmount;
            const alreadyClosed = String(tab.status || '').trim().toUpperCase() === 'CLOSED';
            const nextPaidAmount = this.roundMoney(Math.max(total, paidAmount));

            if (!alreadyClosed) {
                const manualPaymentAmount = this.roundMoney(Math.max(0, total - confirmedPaymentsAmount));
                const closureSource = String(options.closureSource || 'MANUAL_SETTLEMENT');
                const manualPaymentMethod = this.normalizeManualPaymentMethod(options.manualPaymentMethod);

                if (manualPaymentAmount > 0 && closureSource !== 'PAYMENT_APPROVED') {
                    await queryRunner.query(
                        `INSERT INTO payments
                            (id, tenant_id, tab_id, payment_type, amount, status, method, metadata, created_at, paid_at, updated_at)
                         VALUES
                            (gen_random_uuid(), $1, $2, 'FULL', $3, 'CONFIRMED', $4, $5::jsonb, NOW(), NOW(), NOW())`,
                        [
                            tenantId,
                            tabId,
                            manualPaymentAmount,
                            manualPaymentMethod,
                            JSON.stringify({
                                source: 'MANUAL_SETTLEMENT',
                                closure_source: closureSource,
                                recorded_by_user_id: this.normalizeUuidOrNull(options.resolvedByUserId),
                                recorded_by_user_name: this.normalizeTextOrNull(options.resolvedByUserName),
                            }),
                        ],
                    );
                }

                await queryRunner.query(
                    `UPDATE tabs
                        SET status = 'CLOSED',
                            paid_amount = $1,
                            closed_at = COALESCE(closed_at, NOW()),
                            closed_by_user_id = COALESCE($4::uuid, closed_by_user_id),
                            closed_by_user_name = COALESCE($5, closed_by_user_name)
                      WHERE id = $2
                        AND tenant_id = $3`,
                    [
                        nextPaidAmount,
                        tabId,
                        tenantId,
                        this.normalizeUuidOrNull(options.resolvedByUserId),
                        this.normalizeTextOrNull(options.resolvedByUserName),
                    ],
                );

                await this.recordTabEvent(queryRunner, tenantId, tabId, 'TAB_CLOSED', {
                    actorUserId: options.resolvedByUserId,
                    actorName: options.resolvedByUserName,
                    details: {
                        source: closureSource,
                        request_id: options.requestId || null,
                        total: this.roundMoney(total),
                        paid_amount: nextPaidAmount,
                        manual_payment_method: manualPaymentAmount > 0 && closureSource !== 'PAYMENT_APPROVED'
                            ? manualPaymentMethod
                            : null,
                    },
                });
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

            // A comanda fechada não pode continuar acessível pelo QR ou por sessões já abertas.
            await queryRunner.query(
                `UPDATE tab_portal_access_credentials
                    SET revoked_at = COALESCE(revoked_at, NOW()),
                        revoked_by_user_id = COALESCE(revoked_by_user_id, $3::uuid)
                  WHERE tenant_id = $1
                    AND tab_id = $2
                    AND revoked_at IS NULL`,
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
                `SELECT id,
                        tenant_id,
                        table_id,
                        total,
                        paid_amount,
                        status,
                        opened_at,
                        closed_at,
                        closed_by_user_id,
                        closed_by_user_name,
                        reopened_at,
                        reopened_by_user_id,
                        reopened_by_user_name
                   FROM tabs
                  WHERE id = $1
                    AND tenant_id = $2
                  LIMIT 1`,
                [tabId, tenantId],
            );

            await queryRunner.commitTransaction();

            try {
                await this.releaseGoCoreSessions(tenantId, tabId, String(tab.user_phone || ''));
            } catch (error) {
                this.logger.warn(`Failed to release WhatsApp session for ${tabId}: ${(error as Error).message}`);
            }

            try {
                await this.notifyTabClosed(tabId, tenantId);
            } catch (error) {
                this.logger.warn(`Failed to queue tab closed notification for ${tabId}: ${(error as Error).message}`);
            }

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

    private buildTabFinancialSummary(input: {
        subtotal: number;
        serviceFee: number;
        total: number;
        paidAmount: number;
        status: string;
        approvedPaymentsAmount: number;
        pendingPaymentsAmount: number;
        approvedAttemptAmount: number;
    }) {
        const subtotal = this.roundMoney(input.subtotal);
        const serviceFee = this.roundMoney(input.serviceFee);
        const total = this.roundMoney(input.total);
        const paidAmount = this.roundMoney(input.paidAmount);
        const amountDue = this.getAmountDue(total, paidAmount, input.status);
        const reconciliationGap = this.roundMoney(paidAmount - input.approvedPaymentsAmount);
        const overpaymentAmount = this.roundMoney(Math.max(0, paidAmount - total));
        const manualAdjustmentAmount = reconciliationGap > 0 ? reconciliationGap : 0;

        return {
            subtotal,
            serviceFee,
            total,
            paidAmount,
            approvedPaymentsAmount: this.roundMoney(input.approvedPaymentsAmount),
            pendingPaymentsAmount: this.roundMoney(input.pendingPaymentsAmount),
            approvedAttemptAmount: this.roundMoney(input.approvedAttemptAmount),
            amountDue,
            reconciliationGap,
            overpaymentAmount,
            manualAdjustmentAmount,
            settlementStatus: Math.abs(reconciliationGap) < 0.01
                ? 'reconciled'
                : reconciliationGap > 0
                    ? 'manual_adjustment'
                    : 'provider_pending',
        };
    }

    private buildTabSplitSummary(payments: any[], allocationCount: number, tenantSettings: Record<string, unknown>) {
        const counters = {
            full: { count: 0, amount: 0 },
            splitEqual: { count: 0, amount: 0 },
            splitItems: { count: 0, amount: 0 },
        };

        (payments || []).forEach((payment) => {
            if (payment.paymentType === 'SPLIT_EQUAL') {
                counters.splitEqual.count += 1;
                counters.splitEqual.amount += Number(payment.amount || 0);
                return;
            }
            if (payment.paymentType === 'SPLIT_ITEMS') {
                counters.splitItems.count += 1;
                counters.splitItems.amount += Number(payment.amount || 0);
                return;
            }
            counters.full.count += 1;
            counters.full.amount += Number(payment.amount || 0);
        });

        return {
            splitEnabled: !!tenantSettings?.split_enabled,
            allocationCount: Number(allocationCount || 0),
            full: {
                count: counters.full.count,
                amount: this.roundMoney(counters.full.amount),
            },
            splitEqual: {
                count: counters.splitEqual.count,
                amount: this.roundMoney(counters.splitEqual.amount),
            },
            splitItems: {
                count: counters.splitItems.count,
                amount: this.roundMoney(counters.splitItems.amount),
            },
        };
    }

    private buildTabHistory(input: {
        tab: any;
        closeRequests: any[];
        payments: any[];
        eventRows: any[];
    }) {
        const events: any[] = [];

        events.push({
            key: `opened-${input.tab.id}`,
            type: 'TAB_OPENED',
            label: 'Comanda aberta',
            description: input.tab.table_number
                ? `Mesa ${String(input.tab.table_number).trim()} iniciou atendimento`
                : 'Comanda iniciada',
            actorName: String(input.tab.opened_by_user_name || '').trim() || null,
            createdAt: input.tab.opened_at,
        });

        (input.closeRequests || []).forEach((request) => {
            events.push({
                key: `close-request-${request.id}`,
                type: 'CLOSE_REQUEST_CREATED',
                label: 'Pedido de fechamento',
                description: request.description || 'Cliente solicitou fechamento da conta',
                actorName: null,
                createdAt: request.createdAt,
            });

            if (request.resolvedAt) {
                events.push({
                    key: `close-request-resolved-${request.id}`,
                    type: 'CLOSE_REQUEST_RESOLVED',
                    label: 'Fechamento atendido',
                    description: 'Solicitação de fechamento foi resolvida pela equipe',
                    actorName: request.resolvedBy || null,
                    createdAt: request.resolvedAt,
                });
            }
        });

        (input.payments || []).forEach((payment) => {
            const manualPayment = String(payment.channel || '').toUpperCase() === 'MANUAL';
            const methodLabel = payment.methodLabel || this.formatPaymentMethodLabel(payment.method || payment.latestAttemptMethod);
            events.push({
                key: `payment-${payment.id}`,
                type: 'PAYMENT_CREATED',
                label: manualPayment ? 'Baixa manual registrada' : `Pagamento ${this.mapPaymentTypeLabel(payment.paymentType)}`,
                description: `${methodLabel} · ${this.roundMoney(payment.amount).toFixed(2)}`,
                actorName: manualPayment ? payment.recordedByUserName || null : null,
                createdAt: payment.createdAt,
            });

            if (payment.paidAt || payment.latestAttemptStatus === 'APPROVED') {
                events.push({
                    key: `payment-approved-${payment.id}`,
                    type: 'PAYMENT_APPROVED',
                    label: manualPayment ? 'Baixa manual confirmada' : 'Pagamento aprovado',
                    description: `${methodLabel} confirmado`,
                    actorName: manualPayment ? payment.recordedByUserName || null : null,
                    createdAt: payment.paidAt || payment.latestAttemptSettledAt || payment.updatedAt || payment.createdAt,
                });
            } else if (payment.latestAttemptStatus === 'REJECTED') {
                events.push({
                    key: `payment-rejected-${payment.id}`,
                    type: 'PAYMENT_REJECTED',
                    label: 'Pagamento recusado',
                    description: payment.latestAttemptProviderDetail || 'Tentativa recusada pelo provedor',
                    actorName: null,
                    createdAt: payment.latestAttemptCreatedAt || payment.updatedAt || payment.createdAt,
                });
            }
        });

        (input.eventRows || []).forEach((row) => {
            const details = this.parseJsonObject(row?.details);
            events.push({
                key: `event-${row.id}`,
                type: String(row.event_type || 'TAB_EVENT'),
                label: this.mapTabEventLabel(String(row.event_type || 'TAB_EVENT')),
                description: this.buildTabEventDescription(String(row.event_type || 'TAB_EVENT'), details),
                actorName: String(row.actor_name || '').trim() || null,
                createdAt: row.created_at,
            });
        });

        return events
            .filter((event) => event.createdAt)
            .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime());
    }

    private buildTabReopenPolicy(
        input: { status: string; total: number; paidAmount: number; approvedPaymentsAmount: number; approvedAttemptAmount: number },
        currentUserRole?: string,
    ) {
        const closed = String(input.status || '').trim().toUpperCase() === 'CLOSED';
        if (!closed) {
            return {
                canReopen: false,
                requiresManagerApproval: false,
                reason: 'A comanda ainda está aberta',
            };
        }

        const privileged = this.isManagerRole(currentUserRole);
        if (!privileged) {
            return {
                canReopen: false,
                requiresManagerApproval: false,
                reason: 'Somente administrador ou gerente pode alterar uma comanda fechada',
            };
        }

        const total = this.roundMoney(Number(input.total || 0));
        const paidAmount = this.roundMoney(Number(input.paidAmount || 0));
        const approvedPaymentsAmount = this.roundMoney(Number(input.approvedPaymentsAmount || 0));
        const approvedAttemptAmount = this.roundMoney(Number(input.approvedAttemptAmount || 0));
        const liquidatedAmount = Math.max(paidAmount, approvedPaymentsAmount, approvedAttemptAmount);
        const fullyLiquidated = total > 0 && liquidatedAmount >= total;

        if (fullyLiquidated) {
            return {
                canReopen: false,
                requiresManagerApproval: false,
                reason: 'Comanda fechada e liquidada não pode ser reaberta. Será necessário abrir uma nova comanda',
            };
        }

        return {
            canReopen: true,
            requiresManagerApproval: false,
            reason: '',
        };
    }

    private isManagerRole(role?: string) {
        return [TenantUserRole.Admin, TenantUserRole.Manager].includes(String(role || '').trim().toUpperCase() as TenantUserRole);
    }

    private async recordTabEvent(
        queryRunner: any,
        tenantId: string,
        tabId: string,
        eventType: string,
        options: { actorUserId?: string; actorName?: string; details?: Record<string, unknown> },
    ) {
        await queryRunner.query(
            `INSERT INTO tab_events
                (id, tenant_id, tab_id, event_type, actor_user_id, actor_name, details, created_at)
             VALUES (gen_random_uuid(), $1, $2, $3, $4::uuid, $5, $6::jsonb, NOW())`,
            [
                tenantId,
                tabId,
                eventType,
                this.normalizeUuidOrNull(options.actorUserId),
                this.normalizeTextOrNull(options.actorName),
                JSON.stringify(options.details || {}),
            ],
        );
    }

    private mapTabEventLabel(eventType: string) {
        if (eventType === 'TAB_CLOSED') return 'Comanda fechada';
        if (eventType === 'TAB_REOPENED') return 'Comanda reaberta';
        if (eventType === 'TAB_CUSTOMER_UPDATED') return 'Cliente atualizado';
        if (eventType === 'TAB_TABLE_UPDATED') return 'Mesa da comanda alterada';
        if (eventType === 'PAYMENT_RETRY_CREATED') return 'Nova cobrança PIX gerada';
        if (eventType === 'PAYMENT_REFUND_PREPARED') return 'Estorno preparado';
        return 'Evento da comanda';
    }

    private buildTabEventDescription(eventType: string, details: Record<string, any>) {
        if (eventType === 'TAB_CLOSED') {
            const source = String(details?.source || 'MANUAL_SETTLEMENT').trim();
            if (source === 'PAYMENT_APPROVED') {
                return 'Fechamento automático após pagamento aprovado';
            }
            if (source === 'CLOSE_REQUEST') {
                return 'Fechamento concluído a partir de uma solicitação do salão';
            }
            if (source === 'SHIFT_CLOSE_AUTO_SETTLEMENT') {
                return 'Comanda encerrada automaticamente no fechamento do expediente por estar sem saldo pendente';
            }
            const manualPaymentMethod = String(details?.manual_payment_method || '').trim();
            return manualPaymentMethod
                ? `Fechamento manual registrado pela equipe · ${this.formatPaymentMethodLabel(manualPaymentMethod)}`
                : 'Fechamento manual registrado pela equipe';
        }
        if (eventType === 'TAB_REOPENED') {
            const reason = String(details?.reason || '').trim();
            const summary = this.buildTabMutationSummary(details);
            if (reason && summary) {
                return `Reabertura registrada: ${reason}. Alterações: ${summary}`;
            }
            if (reason) {
                return `Reabertura registrada: ${reason}`;
            }
            return summary ? `Comanda reaberta com auditoria: ${summary}` : 'Comanda reaberta para continuar o atendimento';
        }
        if (eventType === 'TAB_CUSTOMER_UPDATED') {
            return 'Telefone e Instagram da comanda foram atualizados pela equipe';
        }
        if (eventType === 'TAB_TABLE_UPDATED') {
            const previousTableNumber = String(details?.previous_table_number || '').trim();
            const tableNumber = String(details?.table_number || '').trim();
            if (previousTableNumber && tableNumber) {
                return `Comanda movida da mesa ${previousTableNumber} para a mesa ${tableNumber}`;
            }
            if (tableNumber) {
                return `Comanda vinculada à mesa ${tableNumber}`;
            }
            if (previousTableNumber) {
                return `Comanda desvinculada da mesa ${previousTableNumber}`;
            }
            return 'Mesa da comanda atualizada pela equipe';
        }
        if (eventType === 'PAYMENT_RETRY_CREATED') {
            const amountDue = this.roundMoney(Number(details?.amount_due || 0));
            return `Equipe gerou uma nova cobrança PIX de ${amountDue.toFixed(2)}`;
        }
        if (eventType === 'PAYMENT_REFUND_PREPARED') {
            const requestedAmount = this.roundMoney(Number(details?.requested_amount || 0));
            const reason = String(details?.reason || '').trim();
            return reason
                ? `Preparação de estorno de ${requestedAmount.toFixed(2)} registrada: ${reason}`
                : `Preparação de estorno de ${requestedAmount.toFixed(2)} registrada`;
        }
        return 'Evento registrado na trilha de auditoria';
    }

    private buildTabMutationAudit(input: { before: Record<string, unknown>; after: Record<string, unknown> }) {
        const before = this.normalizeAuditSnapshot(input.before);
        const after = this.normalizeAuditSnapshot(input.after);
        const keys = Array.from(new Set([...Object.keys(before), ...Object.keys(after)]));
        const fieldsChanged = keys
            .filter((key) => JSON.stringify(before[key] ?? null) !== JSON.stringify(after[key] ?? null))
            .map((field) => ({
                field,
                before: before[field] ?? null,
                after: after[field] ?? null,
            }));

        return {
            before,
            after,
            fieldsChanged,
        };
    }

    private normalizeAuditSnapshot(snapshot: Record<string, unknown>) {
        return Object.entries(snapshot || {}).reduce<Record<string, unknown>>((acc, [key, value]) => {
            acc[key] = value ?? null;
            return acc;
        }, {});
    }

    private buildTabMutationSummary(details: Record<string, any>) {
        const fields = Array.isArray(details?.fields_changed) ? details.fields_changed : [];
        const labels: Record<string, string> = {
            status: 'status',
            closed_at: 'fechamento',
            reopened_at: 'reabertura',
            total: 'total',
            paid_amount: 'valor pago',
        };

        const fragments = fields
            .map((item: any) => {
                const field = String(item?.field || '').trim();
                if (!field) return '';
                return `${labels[field] || field}: ${this.formatAuditValue(item?.before)} -> ${this.formatAuditValue(item?.after)}`;
            })
            .filter(Boolean);

        return fragments.join('; ');
    }

    private formatAuditValue(value: unknown) {
        if (value === null || value === undefined || value === '') {
            return 'vazio';
        }
        if (typeof value === 'number') {
            return this.roundMoney(value).toFixed(2);
        }
        return String(value).trim() || 'vazio';
    }

    private parseRefundPreparation(metadata: unknown) {
        const parsed = this.parseJsonObject(metadata);
        const raw = this.parseJsonObject(parsed?.refund_preparation);
        const status = String(raw?.status || '').trim().toLowerCase();
        if (!status) {
            return null;
        }

        return {
            status,
            preparedAt: raw?.preparedAt || raw?.prepared_at || null,
            preparedByUserId: raw?.preparedByUserId || raw?.prepared_by_user_id || null,
            preparedByUserName: raw?.preparedByUserName || raw?.prepared_by_user_name || null,
            reason: String(raw?.reason || '').trim() || null,
            requestedAmount: this.roundMoney(Number(raw?.requestedAmount ?? raw?.requested_amount ?? 0)),
            providerPaymentId: String(raw?.providerPaymentId || raw?.provider_payment_id || '').trim() || null,
            localStatus: String(raw?.localStatus || raw?.local_status || '').trim() || null,
            providerStatus: String(raw?.providerStatus || raw?.provider_status || '').trim() || null,
            riskLevel: String(raw?.riskLevel || raw?.risk_level || '').trim() || null,
            notes: Array.isArray(raw?.notes) ? raw.notes.map((item) => String(item || '').trim()).filter(Boolean) : [],
        };
    }

    private buildRefundEligibility(input: {
        paymentAmount: number;
        localStatus?: string;
        latestAttemptStatus?: string;
        latestAttemptProviderPaymentId?: string | null;
        paymentType?: string;
        tabStatus?: string;
        reconciliationGap?: number;
        amountDue?: number;
        overpaymentAmount?: number;
        refundPreparation?: any;
    }) {
        const paymentAmount = this.roundMoney(Number(input.paymentAmount || 0));
        const localStatus = String(input.localStatus || '').trim().toUpperCase();
        const providerStatus = String(input.latestAttemptStatus || '').trim().toUpperCase();
        const paymentType = String(input.paymentType || 'FULL').trim().toUpperCase();
        const tabStatus = String(input.tabStatus || '').trim().toUpperCase();
        const reconciliationGap = this.roundMoney(Number(input.reconciliationGap || 0));
        const amountDue = this.roundMoney(Number(input.amountDue || 0));
        const overpaymentAmount = this.roundMoney(Number(input.overpaymentAmount || 0));
        const providerPaymentId = String(input.latestAttemptProviderPaymentId || '').trim() || null;
        const refundPrepared = String(input.refundPreparation?.status || '').trim().toLowerCase() === 'prepared';

        const notes = [];

        if (localStatus !== 'CONFIRMED' && providerStatus !== 'APPROVED') {
            notes.push('O pagamento ainda não foi confirmado pelo sistema nem aprovado pelo provedor.');
        }
        if (!providerPaymentId) {
            notes.push('Não existe provider_payment_id salvo; o estorno terá conferência manual no provedor.');
        }
        if (tabStatus === 'OPEN') {
            notes.push('A comanda ainda está aberta; valide se o estorno não deve virar apenas ajuste interno.');
        }
        if (Math.abs(reconciliationGap) >= 0.01) {
            notes.push(`Existe gap de conciliação de ${this.roundMoney(Math.abs(reconciliationGap)).toFixed(2)} nesta comanda.`);
        }
        if (amountDue > 0) {
            notes.push(`A comanda ainda tem saldo pendente de ${amountDue.toFixed(2)}.`);
        }
        if (overpaymentAmount > 0) {
            notes.push(`Existe sobrepagamento registrado de ${overpaymentAmount.toFixed(2)}.`);
        }
        if (paymentType !== 'FULL') {
            notes.push('Pagamento rateado exige conferência da parcela correta antes de estornar.');
        }
        if (refundPrepared) {
            notes.push('Já existe uma preparação de estorno registrada para este pagamento.');
        }

        const confirmedOrApproved = localStatus === 'CONFIRMED' || providerStatus === 'APPROVED';
        const canPrepare = paymentAmount > 0 && confirmedOrApproved;

        let riskLevel = 'low';
        if (notes.length >= 3 || (!providerPaymentId && providerStatus === 'APPROVED') || paymentType !== 'FULL') {
            riskLevel = 'high';
        } else if (notes.length > 0 || tabStatus === 'OPEN') {
            riskLevel = 'medium';
        }

        return {
            canPrepare,
            reason: canPrepare ? '' : 'Somente pagamentos confirmados ou aprovados no provedor podem entrar em preparação de estorno',
            recommendedAmount: paymentAmount,
            maxAmount: paymentAmount,
            paymentAmount,
            localStatus,
            providerStatus: providerStatus || null,
            providerPaymentId,
            riskLevel,
            notes,
            alreadyPrepared: refundPrepared,
        };
    }

    private mapPaymentTypeLabel(value?: string) {
        if (value === 'SPLIT_EQUAL') return 'rateado por pessoa';
        if (value === 'SPLIT_ITEMS') return 'rateado por item';
        return 'integral';
    }

    private formatPaymentMethodLabel(value?: string | null) {
        const normalized = String(value || '').trim().toUpperCase();
        if (normalized === 'CASH') return 'Dinheiro';
        if (normalized === 'PIX') return 'Pix';
        if (normalized === 'CREDIT_CARD') return 'Cartão de crédito';
        if (normalized === 'DEBIT_CARD') return 'Cartão de débito';
        if (normalized === 'OTHER') return 'Outro meio';
        if (normalized === 'UNSPECIFIED') return 'Forma não informada';
        return normalized || 'Forma não informada';
    }

    private normalizeManualPaymentMethod(value?: string) {
        const normalized = String(value || '').trim().toUpperCase();
        const allowed = new Set(['CASH', 'PIX', 'CREDIT_CARD', 'DEBIT_CARD', 'OTHER']);
        return allowed.has(normalized) ? normalized : 'UNSPECIFIED';
    }

    private parseJsonObject(value: unknown) {
        if (!value) return {};
        if (typeof value === 'object') return value as Record<string, any>;
        try {
            return JSON.parse(String(value));
        } catch (_error) {
            return {};
        }
    }

    private assertPublicCheckoutAccess(tabId: string, accessToken?: string) {
        const token = String(accessToken || '').trim();
        if (!token) {
            throw new UnauthorizedException('Link de pagamento inválido ou expirado');
        }

        try {
            const decoded = this.jwtService.verify(token) as Record<string, unknown>;
            const tokenTabId = String(decoded?.tab_id || decoded?.sub || '').trim();
            const scope = String(decoded?.scope || '').trim();
            const ownerPhone = this.normalizePhoneDigits(decoded?.owner_phone);

            if (scope !== 'checkout_public' || tokenTabId !== String(tabId || '').trim()) {
                throw new UnauthorizedException('Link de pagamento inválido ou expirado');
            }

            return { ownerPhone };
        } catch (error) {
            if (error instanceof UnauthorizedException) {
                throw error;
            }
            throw new UnauthorizedException('Link de pagamento inválido ou expirado');
        }
    }

    private async loadPublicTabContext(tabId: string, accessToken?: string) {
        const access = this.assertPublicCheckoutAccess(tabId, accessToken);

        const rows = await this.dataSource.query(
            `SELECT tb.id,
                    tb.tenant_id,
                    tb.table_id,
                    tb.user_phone,
                    tb.public_code,
                    tb.service_mode,
                    tb.exit_validated_at,
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

        const ownerPhone = this.normalizePhoneDigits(row.user_phone);
        if (access.ownerPhone && (!ownerPhone || ownerPhone !== access.ownerPhone)) {
            throw new UnauthorizedException('Link de pagamento inválido ou expirado');
        }

        const financialSnapshot = await this.reconcileTabFinancialSnapshot(tabId, String(row.tenant_id));

        return {
            id: String(row.id),
            tenantId: String(row.tenant_id),
            tableId: row.table_id ? String(row.table_id) : null,
            publicCode: String(row.public_code || '').trim() || null,
            serviceMode: String(row.service_mode || 'COM_MESA').trim() || 'COM_MESA',
            exitValidatedAt: row.exit_validated_at || null,
            userPhone: String(row.user_phone || ''),
            subtotal: financialSnapshot.subtotal,
            serviceFee: financialSnapshot.serviceFee,
            total: financialSnapshot.total,
            paidAmount: financialSnapshot.paidAmount,
            amountDue: this.getAmountDue(financialSnapshot.total, financialSnapshot.paidAmount, String(row.status || 'OPEN')),
            status: String(row.status || 'OPEN'),
            openedAt: row.opened_at,
            closedAt: row.closed_at,
            tableNumber: row.table_number || null,
            tenantName: String(row.tenant_name || 'ClickGarcom'),
            tenantSettings: this.parseTenantSettings(row.tenant_settings),
        };
    }

    private async loadTenantTabContext(tabId: string, tenantId: string) {
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
                AND tb.tenant_id = $2
              LIMIT 1`,
            [tabId, tenantId],
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

    private isPendingPaymentStillActive(input: { status?: string; latestAttemptStatus?: string; expiredAt?: Date | null }) {
        const status = String(input.status || '').trim().toUpperCase();
        const latestAttemptStatus = String(input.latestAttemptStatus || '').trim().toUpperCase();
        const expiredAt = input.expiredAt instanceof Date && !Number.isNaN(input.expiredAt.getTime())
            ? input.expiredAt
            : null;

        if (status === 'CONFIRMED') {
            return false;
        }

        if (expiredAt && expiredAt.getTime() <= Date.now()) {
            return false;
        }

        if (['REJECTED', 'CANCELLED', 'CANCELED', 'EXPIRED'].includes(latestAttemptStatus)) {
            return false;
        }

        return status === 'PENDING' || !status;
    }

    private hashPortalToken(rawToken: string) {
        return createHash('sha256').update(String(rawToken || ''), 'utf8').digest('hex');
    }

    private async loadPortalCredential(rawToken: string) {
        const token = String(rawToken || '').trim();
        if (token.length < 32) {
            throw new UnauthorizedException('Link da comanda inválido ou expirado.');
        }

        const rows = await this.dataSource.query(
            `SELECT c.id, c.tenant_id, c.tab_id
               FROM tab_portal_access_credentials c
               JOIN tabs tb ON tb.id = c.tab_id AND tb.tenant_id = c.tenant_id
              WHERE c.token_hash = $1
                AND c.revoked_at IS NULL
                AND (c.expires_at IS NULL OR c.expires_at > NOW())
                AND tb.status <> 'CLOSED'
              LIMIT 1`,
            [this.hashPortalToken(token)],
        );
        const credential = rows?.[0];
        if (!credential) {
            throw new UnauthorizedException('Link da comanda inválido ou expirado.');
        }

        return {
            id: String(credential.id),
            tenantId: String(credential.tenant_id),
            tabId: String(credential.tab_id),
        };
    }

    private async loadPortalSession(sessionToken: string) {
        let claims: Record<string, unknown>;
        try {
            claims = this.jwtService.verify(sessionToken) as Record<string, unknown>;
        } catch (_error) {
            throw new UnauthorizedException('Sessão da comanda expirada. Leia o QR Code novamente.');
        }

        if (String(claims.scope || '') !== 'tab_portal') {
            throw new UnauthorizedException('Sessão da comanda inválida.');
        }

        const credentialId = String(claims.credential_id || '').trim();
        const tenantId = String(claims.tenant_id || '').trim();
        const tabId = String(claims.tab_id || '').trim();
        if (!credentialId || !tenantId || !tabId) {
            throw new UnauthorizedException('Sessão da comanda inválida.');
        }

        const rows = await this.dataSource.query(
            `SELECT c.id
               FROM tab_portal_access_credentials c
               JOIN tabs tb ON tb.id = c.tab_id AND tb.tenant_id = c.tenant_id
              WHERE c.id = $1
                AND c.tenant_id = $2
                AND c.tab_id = $3
                AND c.revoked_at IS NULL
                AND (c.expires_at IS NULL OR c.expires_at > NOW())
                AND tb.status <> 'CLOSED'
              LIMIT 1`,
            [credentialId, tenantId, tabId],
        );
        if (!rows?.[0]) {
            throw new UnauthorizedException('A comanda foi encerrada ou o acesso foi renovado.');
        }

        return { id: credentialId, tenantId, tabId };
    }

    private async loadPortalTabContext(tabId: string, tenantId: string) {
        const rows = await this.dataSource.query(
            `SELECT tb.id,
                    tb.tenant_id,
                    tb.table_id,
                    tb.public_code,
                    tb.service_mode,
                    tb.exit_validated_at,
                    tb.status,
                    tb.opened_at,
                    tb.closed_at,
                    t.number AS table_number,
                    tn.name AS tenant_name,
                    tn.settings AS tenant_settings
               FROM tabs tb
               JOIN tenants tn ON tn.id = tb.tenant_id
          LEFT JOIN tables t ON t.id = tb.table_id AND t.tenant_id = tb.tenant_id
              WHERE tb.id = $1
                AND tb.tenant_id = $2
                AND tb.status <> 'CLOSED'
              LIMIT 1`,
            [tabId, tenantId],
        );
        const row = rows?.[0];
        if (!row) return null;

        const financialSnapshot = await this.reconcileTabFinancialSnapshot(tabId, tenantId);
        return {
            id: String(row.id),
            tenantId: String(row.tenant_id),
            tableId: row.table_id ? String(row.table_id) : null,
            publicCode: String(row.public_code || '').trim() || null,
            serviceMode: String(row.service_mode || 'COM_MESA').trim() || 'COM_MESA',
            exitValidatedAt: row.exit_validated_at || null,
            subtotal: financialSnapshot.subtotal,
            serviceFee: financialSnapshot.serviceFee,
            total: financialSnapshot.total,
            paidAmount: financialSnapshot.paidAmount,
            amountDue: this.getAmountDue(financialSnapshot.total, financialSnapshot.paidAmount, String(row.status || 'OPEN')),
            status: String(row.status || 'OPEN'),
            openedAt: row.opened_at,
            closedAt: row.closed_at,
            tableNumber: row.table_number || null,
            tenantName: String(row.tenant_name || 'ClickGarcom'),
            tenantSettings: this.parseTenantSettings(row.tenant_settings),
        };
    }

    private resolvePublicPortalBaseUrl() {
        return String(process.env.PUBLIC_ADMIN_BASE_URL || '').trim().replace(/\/+$/, '');
    }

    private normalizePortalOrderItems(rawItems: unknown) {
        if (!Array.isArray(rawItems) || rawItems.length === 0 || rawItems.length > 15) {
            throw new BadRequestException('Selecione de 1 a 15 itens para o pedido.');
        }

        const quantities = new Map<string, number>();
        for (const rawItem of rawItems) {
            const item = rawItem as Record<string, unknown>;
            const menuItemId = String(item?.menu_item_id || item?.menuItemId || '').trim();
            const quantity = Number(item?.quantity || 0);
            if (!this.normalizeUuidOrNull(menuItemId) || !Number.isInteger(quantity) || quantity < 1 || quantity > 20) {
                throw new BadRequestException('Item ou quantidade inválida no pedido.');
            }
            const nextQuantity = (quantities.get(menuItemId) || 0) + quantity;
            if (nextQuantity > 20) {
                throw new BadRequestException('Cada item pode ter no máximo 20 unidades por pedido.');
            }
            quantities.set(menuItemId, nextQuantity);
        }

        return Array.from(quantities, ([menuItemId, quantity]) => ({ menuItemId, quantity }));
    }

    private isPortalMenuItemAvailable(item: Record<string, unknown>) {
        if (item.available !== true && item.available !== 'true' && item.available !== 1 && item.available !== '1') {
            return false;
        }
        const tracksStock = item.track_stock === true || item.track_stock === 'true' || item.track_stock === 1 || item.track_stock === '1';
        if (tracksStock && Number(item.stock_quantity || 0) <= 0) {
            return false;
        }

        const rawWindows = item.availability_windows;
        const windows = Array.isArray(rawWindows)
            ? rawWindows
            : typeof rawWindows === 'string'
                ? this.parseJsonArray(rawWindows)
                : [];
        if (!windows.length) return true;

        const now = new Date();
        const minuteOfDay = now.getHours() * 60 + now.getMinutes();
        return windows.some((rawWindow: any) => {
            const day = Number(rawWindow?.dayOfWeek ?? rawWindow?.day_of_week);
            const start = this.timeToMinutes(rawWindow?.startTime ?? rawWindow?.start_time);
            const end = this.timeToMinutes(rawWindow?.endTime ?? rawWindow?.end_time);
            return day === now.getDay() && start !== null && end !== null && minuteOfDay >= start && minuteOfDay <= end;
        });
    }

    private isPortalSimpleMenuItem(item: Record<string, unknown>) {
        if (String(item.item_type || 'STANDARD').toUpperCase() !== 'STANDARD') {
            return false;
        }

        const rawOptionGroups = item.option_groups;
        const optionGroups = Array.isArray(rawOptionGroups)
            ? rawOptionGroups
            : typeof rawOptionGroups === 'string'
                ? this.parseJsonArray(rawOptionGroups)
                : [];
        return optionGroups.length === 0;
    }

    private parseJsonArray(value: string): any[] {
        try {
            const parsed = JSON.parse(value);
            return Array.isArray(parsed) ? parsed : [];
        } catch (_error) {
            return [];
        }
    }

    private timeToMinutes(value: unknown): number | null {
        const match = /^(\d{1,2}):(\d{2})$/.exec(String(value || '').trim());
        if (!match) return null;
        const hour = Number(match[1]);
        const minute = Number(match[2]);
        return hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59 ? hour * 60 + minute : null;
    }

    private normalizePhoneDigits(value: unknown) {
        return String(value || '').replace(/\D/g, '');
    }

    private buildPublicTabPayload(tab: any) {
        const amountDue = this.getAmountDue(tab.total, tab.paidAmount, tab.status);
        const cardCheckoutConfig = this.resolvePublicCardCheckoutConfig(tab.tenantSettings);

        return {
            id: tab.id,
            tenantName: tab.tenantName,
            tableNumber: tab.tableNumber,
            publicCode: tab.publicCode,
            serviceMode: tab.serviceMode,
            exitValidatedAt: tab.exitValidatedAt,
            status: tab.status,
            total: amountDue,
            fullTotal: this.roundMoney(tab.total),
            paidAmount: this.roundMoney(tab.paidAmount),
            amountDue,
            closed: amountDue <= 0,
            mpPublicKey: cardCheckoutConfig.enabled ? cardCheckoutConfig.publicKey : '',
            cardEnabled: cardCheckoutConfig.enabled,
            cardUnavailableReason: cardCheckoutConfig.reason,
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

    private async reconcileTabFinancialSnapshot(
        tabId: string,
        tenantId: string,
        executor: { query: (query: string, parameters?: any[]) => Promise<any> } = this.dataSource,
    ) {
        const rows = await executor.query(
            `SELECT tb.id,
                    tb.status,
                    tb.subtotal AS stored_subtotal,
                    tb.service_fee AS stored_service_fee,
                    tb.total AS stored_total,
                    tb.paid_amount AS stored_paid_amount,
                    COALESCE(items.subtotal, 0) AS calculated_subtotal,
                    COALESCE((items.subtotal * fee.service_fee_percent / 100.0), 0) AS calculated_service_fee,
                    COALESCE(items.subtotal, 0) + COALESCE((items.subtotal * fee.service_fee_percent / 100.0), 0) AS calculated_total,
                    COALESCE(pay.confirmed_total, 0) AS confirmed_payments_total
               FROM tabs tb
               CROSS JOIN LATERAL (
                    SELECT COALESCE((tn.settings->>'service_fee_percent')::numeric, 10) AS service_fee_percent
                      FROM tenants tn
                     WHERE tn.id = tb.tenant_id
                     LIMIT 1
               ) fee
               LEFT JOIN LATERAL (
                    SELECT COALESCE(SUM(oi.quantity * oi.unit_price), 0) AS subtotal
                      FROM orders o
                      JOIN order_items oi
                        ON oi.order_id = o.id
                     WHERE o.tab_id = tb.id
                       AND o.tenant_id = tb.tenant_id
                       AND o.status <> 'CANCELED'
               ) items ON TRUE
               LEFT JOIN LATERAL (
                    SELECT COALESCE(SUM(p.amount), 0) AS confirmed_total
                      FROM payments p
                     WHERE p.tab_id = tb.id
                       AND p.tenant_id = tb.tenant_id
                       AND p.status = 'CONFIRMED'
               ) pay ON TRUE
              WHERE tb.id = $1
                AND tb.tenant_id = $2
              LIMIT 1`,
            [tabId, tenantId],
        );

        const row = rows?.[0];
        if (!row) {
            throw new NotFoundException('Comanda não encontrada');
        }

        const subtotal = this.roundMoney(Number.parseFloat(String(row.calculated_subtotal ?? '0')) || 0);
        const serviceFee = this.roundMoney(Number.parseFloat(String(row.calculated_service_fee ?? '0')) || 0);
        const total = this.roundMoney(Number.parseFloat(String(row.calculated_total ?? '0')) || 0);
        const storedPaidAmount = this.roundMoney(Number.parseFloat(String(row.stored_paid_amount ?? '0')) || 0);
        const confirmedPaymentsAmount = this.roundMoney(Number.parseFloat(String(row.confirmed_payments_total ?? '0')) || 0);
        const paidAmount = this.roundMoney(Math.max(storedPaidAmount, confirmedPaymentsAmount));

        const storedSubtotal = this.roundMoney(Number.parseFloat(String(row.stored_subtotal ?? '0')) || 0);
        const storedServiceFee = this.roundMoney(Number.parseFloat(String(row.stored_service_fee ?? '0')) || 0);
        const storedTotal = this.roundMoney(Number.parseFloat(String(row.stored_total ?? '0')) || 0);

        if (
            storedSubtotal !== subtotal
            || storedServiceFee !== serviceFee
            || storedTotal !== total
            || storedPaidAmount !== paidAmount
        ) {
            await executor.query(
                `UPDATE tabs
                    SET subtotal = $1,
                        service_fee = $2,
                        total = $3,
                        paid_amount = $4
                  WHERE id = $5
                    AND tenant_id = $6`,
                [subtotal, serviceFee, total, paidAmount, tabId, tenantId],
            );
        }

        return {
            status: String(row.status || 'OPEN'),
            subtotal,
            serviceFee,
            total,
            paidAmount,
            confirmedPaymentsAmount,
        };
    }

    private resolvePayerField(value: unknown, fallback: string) {
        const text = String(value || '').trim();
        return text || fallback;
    }

    private resolveCpf(value: unknown) {
        const digits = String(value || '').replace(/\D/g, '');
        return digits || '19119119100';
    }

    private async notifyTabClosed(tabId: string, tenantId: string) {
        const rows = await this.dataSource.query(
            `WITH claimed AS (
                UPDATE tabs
                   SET closed_notified_at = NOW()
                 WHERE id = $1
                   AND tenant_id = $2
                   AND closed_notified_at IS NULL
                   AND NULLIF(TRIM(user_phone), '') IS NOT NULL
             RETURNING id,
                       tenant_id,
                       total,
                       NULLIF(TRIM(user_phone), '') AS notification_phone
            )
            SELECT c.id,
                   c.tenant_id,
                   c.notification_phone,
                   c.total,
                   tn.name AS tenant_name,
                   tn.settings AS tenant_settings
              FROM claimed c
              JOIN tenants tn
                ON tn.id = c.tenant_id`,
            [tabId, tenantId],
        );

        const row = rows?.[0];
        if (!row) {
            return;
        }

        const phone = String(row.notification_phone || '').trim();
        if (!phone) {
            return;
        }

        const tenantSettings = this.parseTenantSettings(row.tenant_settings);
        const message = this.buildPaymentConfirmedMessage(tenantSettings, Number(row.total || 0));

        try {
            await this.dataSource.query(
                `INSERT INTO outbox_messages
                    (tenant_id, destination, recipient, payload, sent, attempts, max_attempts, created_at)
                 VALUES ($1, 'whatsapp', $2, $3, false, 0, 3, NOW())`,
                [tenantId, phone, message],
            );
        } catch (error) {
            await this.dataSource.query(
                `UPDATE tabs
                    SET closed_notified_at = NULL
                  WHERE id = $1
                    AND tenant_id = $2`,
                [tabId, tenantId],
            );
            throw error;
        }
    }

    private buildPaymentConfirmedMessage(settings: Record<string, any>, total: number) {
        const custom = String(settings?.messages?.msg_payment_confirmed || '').trim();
        const fallback = `✅ *Pagamento confirmado!*

Valor: R$ {total}

Obrigado pela preferência!
Esperamos te receber novamente em breve! 😊`;

        const template = custom || fallback;
        const normalized = template.replace(/\{total\}/g, this.roundMoney(total).toFixed(2));
        const sanitized = this.sanitizePaymentConfirmedMessage(normalized);

        if (sanitized) {
            return sanitized;
        }

        return this.sanitizePaymentConfirmedMessage(
            fallback.replace(/\{total\}/g, this.roundMoney(total).toFixed(2)),
        );
    }

    private sanitizePaymentConfirmedMessage(message: string) {
        return String(message || '')
            .replace(/_Como foi sua experi[êe]ncia\?_\s*\n*Avalie de 0 a 10:\s*/gi, '')
            .replace(/\n{3,}/g, '\n\n')
            .trim();
    }

    private async releaseGoCoreSessions(tenantId: string, tabId: string, userPhone?: string) {
        const payload = {
            tenant_id: tenantId,
            tab_id: tabId,
            user_phone: String(userPhone || '').trim(),
        };

        const token = String(process.env.INTERNAL_SERVICE_TOKEN || 'clickgarcom-internal-token').trim()
            || 'clickgarcom-internal-token';

        let lastError: Error | null = null;

        for (const baseUrl of this.getGoCoreBaseUrls()) {
            try {
                const response = await fetch(`${baseUrl}/internal/sessions/release`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'X-Internal-Token': token,
                    },
                    body: JSON.stringify(payload),
                    signal: AbortSignal.timeout(5000),
                });

                if (response.ok) {
                    return;
                }

                const body = await response.text().catch(() => '');
                lastError = new Error(`go-core release returned status ${response.status}: ${body || response.statusText}`);
            } catch (error) {
                lastError = error as Error;
            }
        }

        if (lastError) {
            throw lastError;
        }
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

    private resolvePublicCardCheckoutConfig(tenantSettings: Record<string, unknown>) {
        const accessToken = String(tenantSettings?.mp_access_token || '').trim();
        const publicKey = String(tenantSettings?.mp_public_key || '').trim();
        const accessTokenEnv = this.detectMercadoPagoEnvironment(accessToken);
        const publicKeyEnv = this.detectMercadoPagoEnvironment(publicKey);

        if (!accessToken) {
            return {
                enabled: false,
                publicKey: '',
                reason: 'Pagamento com cartão indisponível no momento. O restaurante ainda não configurou o Mercado Pago.',
            };
        }

        if (!publicKey) {
            return {
                enabled: false,
                publicKey: '',
                reason: 'Pagamento com cartão indisponível no momento. Falta configurar a Public Key do Mercado Pago para este restaurante.',
            };
        }

        if (accessTokenEnv && publicKeyEnv && accessTokenEnv !== publicKeyEnv) {
            return {
                enabled: false,
                publicKey: '',
                reason: 'Pagamento com cartão indisponível no momento. As credenciais do Mercado Pago estão em ambientes diferentes.',
            };
        }

        return {
            enabled: true,
            publicKey,
            reason: '',
        };
    }

    private detectMercadoPagoEnvironment(value: unknown) {
        const normalized = String(value || '').trim().toUpperCase();
        if (!normalized) {
            return '';
        }
        if (normalized.startsWith('TEST-')) {
            return 'test';
        }
        if (normalized.startsWith('APP_USR-')) {
            return 'production';
        }
        return '';
    }

    private getAmountDue(total: number, paidAmount: number, status: string) {
        if (String(status || '').trim().toUpperCase() === 'CLOSED') {
            return 0;
        }
        return this.roundMoney(Math.max(0, total - paidAmount));
    }

    private matchesPaymentsOverviewFilters(payment: any, search: string, statusFilter: string, reconciliationFilter: string) {
        const paymentStatusKey = this.getPaymentsOverviewStatusKey(payment);
        const reconciliationKey = String(payment?.reconciliationStatus || 'awaiting_payment').trim().toUpperCase();
        const searchText = [
            payment?.id,
            payment?.tabId,
            payment?.tableNumber,
            payment?.userPhone,
            payment?.paymentType,
            payment?.method,
            payment?.localStatus,
            payment?.latestAttemptStatus,
            payment?.externalReference,
        ].join(' ').toLowerCase();

        if (statusFilter !== 'ALL' && paymentStatusKey !== statusFilter) {
            return false;
        }

        if (reconciliationFilter !== 'ALL' && reconciliationKey !== reconciliationFilter) {
            return false;
        }

        if (search && !searchText.includes(search)) {
            return false;
        }

        return true;
    }

    private getPaymentsOverviewStatusKey(payment: any) {
        if (payment?.providerApprovedPending) {
            return 'PROVIDER_APPROVED';
        }
        if (payment?.rejectedByProvider) {
            return 'REJECTED';
        }
        if (String(payment?.localStatus || '').trim().toUpperCase() === 'CONFIRMED') {
            return 'CONFIRMED';
        }
        return 'PENDING';
    }

    private resolvePaymentsOverviewRange(query?: Record<string, string>) {
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        let parsedStart = this.parseDateOnlySafe(query?.start_date);
        let parsedEnd = this.parseDateOnlySafe(query?.end_date);

        if (parsedEnd) {
            parsedEnd.setDate(parsedEnd.getDate() + 1);
        }

        if (!parsedStart && !parsedEnd) {
            parsedEnd = new Date(today);
            parsedEnd.setDate(parsedEnd.getDate() + 1);
            parsedStart = new Date(parsedEnd);
            parsedStart.setDate(parsedStart.getDate() - 30);
        } else if (parsedStart && !parsedEnd) {
            parsedEnd = new Date(today);
            parsedEnd.setDate(parsedEnd.getDate() + 1);
        } else if (!parsedStart && parsedEnd) {
            parsedStart = new Date(parsedEnd);
            parsedStart.setDate(parsedStart.getDate() - 30);
        }

        if (!parsedStart || !parsedEnd || parsedStart >= parsedEnd) {
            parsedEnd = new Date(today);
            parsedEnd.setDate(parsedEnd.getDate() + 1);
            parsedStart = new Date(parsedEnd);
            parsedStart.setDate(parsedStart.getDate() - 30);
        }

        return {
            startDate: parsedStart,
            endDate: parsedEnd,
        };
    }

    private parseDateOnlySafe(value?: string) {
        const text = String(value || '').trim();
        const match = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
        if (!match) {
            return null;
        }

        const [, year, month, day] = match;
        const date = new Date(Number(year), Number(month) - 1, Number(day));
        date.setHours(0, 0, 0, 0);
        return Number.isNaN(date.getTime()) ? null : date;
    }

    private toDateString(date: Date) {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }

    private formatDateLabel(dateString: string) {
        const date = new Date(`${dateString}T00:00:00`);
        return date.toLocaleDateString('pt-BR', {
            day: '2-digit',
            month: 'short',
        });
    }

    private normalizeUuidOrNull(value?: string) {
        const text = String(value || '').trim();
        return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(text)
            ? text
            : null;
    }

    private normalizeTextOrNull(value?: string | null) {
        const text = String(value || '').trim();
        return text || null;
    }

    private roundMoney(value: number) {
        return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
    }

    private getGoCoreBaseUrls() {
        const configured = (process.env.GO_CORE_BASE_URL || '').trim();
        return [...new Set([configured, 'http://go-api:8080', 'http://localhost:8080'].filter(Boolean))];
    }

    private async notifyPortalEvent(tenantId: string, tabId: string, type: string) {
        const token = String(process.env.INTERNAL_SERVICE_TOKEN || 'clickgarcom-internal-token').trim();
        for (const baseUrl of this.getGoCoreBaseUrls()) {
            try {
                const response = await fetch(`${baseUrl}/internal/portal/events`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'X-Internal-Token': token,
                    },
                    body: JSON.stringify({ tenant_id: tenantId, tab_id: tabId, type }),
                });
                if (response.ok) return;
            } catch (_error) {
                // The portal keeps polling as a fallback when Go-Core is restarting.
            }
        }
        this.logger.warn(`Portal realtime event not delivered: ${type} for tab ${tabId}`);
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
