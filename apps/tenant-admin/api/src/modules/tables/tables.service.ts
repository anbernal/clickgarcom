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

        req.status = RequestStatus.REJECTED;
        await this.tableRequestRepo.save(req);

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

    async finalizeTab(tabId: string, tenantId: string, staffUserId?: string, staffUserName?: string) {
        const result = await this.finalizeTabInternal(tabId, tenantId, {
            resolvedByUserId: staffUserId,
            resolvedByUserName: staffUserName,
            closureSource: 'MANUAL_SETTLEMENT',
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
                        tb.payment_notifier_phone,
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

        const payments = (paymentRows || []).map((row: any) => ({
            id: String(row.id),
            paymentType: String(row.payment_type || 'FULL'),
            amount: this.roundMoney(Number.parseFloat(String(row.amount ?? '0')) || 0),
            status: String(row.status || 'PENDING'),
            pixTxid: String(row.pix_txid || ''),
            method: String(row.method || row.latest_attempt_method || '').trim() || null,
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
        }));

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
            userPhone: String(tab.user_phone || '').trim() || null,
            paymentNotifierPhone: String(tab.payment_notifier_phone || '').trim() || null,
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
                        approvedPaymentsAmount,
                        approvedAttemptAmount,
                    },
                    currentUserRole,
                ),
            },
        };
    }

    async reopenTab(tabId: string, tenantId: string, actor: TabActorContext) {
        const queryRunner = this.dataSource.createQueryRunner();
        await queryRunner.connect();
        await queryRunner.startTransaction();

        try {
            const tabRows = await queryRunner.query(
                `SELECT id,
                        tenant_id,
                        table_id,
                        total,
                        paid_amount,
                        status,
                        closed_at
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
                    approvedPaymentsAmount: confirmedTotal,
                    approvedAttemptAmount: approvedAttempts > 0 ? confirmedTotal : 0,
                },
                actor.userRole,
            );

            if (!reopenPolicy.canReopen) {
                throw new BadRequestException(reopenPolicy.reason || 'Reabertura não permitida para esta comanda');
            }

            await queryRunner.query(
                `UPDATE tabs
                    SET status = 'OPEN',
                        closed_at = NULL,
                        reopened_at = NOW(),
                        reopened_by_user_id = COALESCE($3::uuid, reopened_by_user_id),
                        reopened_by_user_name = COALESCE($4, reopened_by_user_name)
                  WHERE id = $1
                    AND tenant_id = $2`,
                [
                    tabId,
                    tenantId,
                    this.normalizeUuidOrNull(actor.userId),
                    this.normalizeTextOrNull(actor.userName),
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
                    reason: this.normalizeTextOrNull(actor.reason),
                    confirmed_payments_amount: confirmedTotal,
                    approved_attempts: approvedAttempts,
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
        options: {
            resolvedByUserId?: string;
            resolvedByUserName?: string;
            requestId?: string;
            closureSource?: string;
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

            const total = Number.parseFloat(String(tab.total ?? '0')) || 0;
            const paidAmount = Number.parseFloat(String(tab.paid_amount ?? '0')) || 0;
            const alreadyClosed = String(tab.status || '').trim().toUpperCase() === 'CLOSED';
            const nextPaidAmount = this.roundMoney(Math.max(total, paidAmount));

            if (!alreadyClosed) {
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
                        source: String(options.closureSource || 'MANUAL_SETTLEMENT'),
                        request_id: options.requestId || null,
                        total: this.roundMoney(total),
                        paid_amount: nextPaidAmount,
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
            events.push({
                key: `payment-${payment.id}`,
                type: 'PAYMENT_CREATED',
                label: `Pagamento ${this.mapPaymentTypeLabel(payment.paymentType)}`,
                description: `${this.formatPaymentMethodLabel(payment.method || payment.latestAttemptMethod)} · ${this.roundMoney(payment.amount).toFixed(2)}`,
                actorName: null,
                createdAt: payment.createdAt,
            });

            if (payment.paidAt || payment.latestAttemptStatus === 'APPROVED') {
                events.push({
                    key: `payment-approved-${payment.id}`,
                    type: 'PAYMENT_APPROVED',
                    label: 'Pagamento aprovado',
                    description: `${this.formatPaymentMethodLabel(payment.method || payment.latestAttemptMethod)} confirmado`,
                    actorName: null,
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
        input: { status: string; approvedPaymentsAmount: number; approvedAttemptAmount: number },
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

        const requiresManagerApproval = input.approvedPaymentsAmount > 0 || input.approvedAttemptAmount > 0;
        const privileged = this.isManagerRole(currentUserRole);

        if (requiresManagerApproval && !privileged) {
            return {
                canReopen: false,
                requiresManagerApproval: true,
                reason: 'Comanda com pagamento liquidado só pode ser reaberta por gerente ou admin',
            };
        }

        return {
            canReopen: true,
            requiresManagerApproval,
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
            return 'Fechamento manual registrado pela equipe';
        }
        if (eventType === 'TAB_REOPENED') {
            const reason = String(details?.reason || '').trim();
            return reason ? `Reabertura registrada: ${reason}` : 'Comanda reaberta para continuar o atendimento';
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
        if (normalized === 'PIX') return 'Pix';
        if (normalized === 'CREDIT_CARD') return 'Cartão de crédito';
        if (normalized === 'DEBIT_CARD') return 'Cartão de débito';
        return normalized || 'Forma não informada';
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

            if (scope !== 'checkout_public' || tokenTabId !== String(tabId || '').trim() || !ownerPhone) {
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
        if (!ownerPhone || ownerPhone !== access.ownerPhone) {
            throw new UnauthorizedException('Link de pagamento inválido ou expirado');
        }

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
