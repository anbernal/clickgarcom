import { ForbiddenException, Injectable, HttpException, HttpStatus, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Not, Repository } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { User } from '../../entities/user.entity';
import { UserAccessAuditLog } from '../../entities/user-access-audit-log.entity';
import { MessageTemplates, Tenant, TenantSettings } from '../../entities/tenant.entity';
import { DEFAULT_MESSAGE_TEMPLATES, MESSAGE_TEMPLATE_KEYS } from '../../shared/message-templates';
import { ChangePasswordDto } from './dto/change-password.dto';
import { CreateTenantUserDto } from './dto/create-tenant-user.dto';
import { ResetTenantUserPasswordDto } from './dto/reset-tenant-user-password.dto';
import { UpdateTenantUserDto } from './dto/update-tenant-user.dto';
import { UpdateTenantUserStatusDto } from './dto/update-tenant-user-status.dto';
import {
    SUPPORTED_TENANT_ROLES,
    TENANT_BOT_CONFIG_ROLES,
    TENANT_FLOOR_ROLES,
    TENANT_FULL_ACCESS_ROLES,
    TENANT_ORDER_CANCEL_ROLES,
    TENANT_MENU_READ_ROLES,
    TENANT_MENU_WRITE_ROLES,
    TENANT_ORDER_WRITE_ROLES,
    TENANT_REPORT_ROLES,
    TENANT_SETTLEMENT_ROLES,
    TENANT_TABLE_READ_ROLES,
    TENANT_TABLE_WRITE_ROLES,
    TENANT_WALLET_ROLES,
    TenantUserRole,
    normalizeTenantRole,
} from './roles';

type TenantActorContext = {
    userId: string;
    userRole: string;
    userName?: string;
};

type ManagedTenantUser = {
    id: string;
    name: string;
    email: string;
    phone: string | null;
    role: string;
    roleLabel: string;
    active: boolean;
    isCurrentUser: boolean;
    lastLoginAt: string | null;
    createdAt: string;
    updatedAt: string;
    permissions: {
        canEdit: boolean;
        canToggleStatus: boolean;
        canResetPassword: boolean;
    };
};

@Injectable()
export class AuthService {
    constructor(
        @InjectRepository(User) private readonly userRepository: Repository<User>,
        @InjectRepository(UserAccessAuditLog) private readonly userAccessAuditLogRepository: Repository<UserAccessAuditLog>,
        @InjectRepository(Tenant) private readonly tenantRepository: Repository<Tenant>,
        private readonly jwtService: JwtService,
    ) { }

    async register(data: any): Promise<any> {
        const { tenant_id, email, password, role, tenant_name, whatsapp } = data;

        // Verify if tenant slug or whatsapp already exists
        const existingTenant = await this.tenantRepository.findOne({
            where: [{ slug: tenant_id }, { whatsappNumber: whatsapp }]
        });
        if (existingTenant) {
            throw new HttpException('Slug do restaurante ou WhatsApp já cadastrado.', HttpStatus.BAD_REQUEST);
        }

        // Verify if user email exists
        const existingUser = await this.userRepository.findOne({ where: { email } });
        if (existingUser) {
            throw new HttpException('Email já cadastrado.', HttpStatus.BAD_REQUEST);
        }

        // Create Tenant
        const newTenant = this.tenantRepository.create({
            name: tenant_name,
            slug: tenant_id,
            whatsappNumber: whatsapp,
            isOpen: false,
            settings: {
                split_enabled: true,
                auto_accept_orders: false,
                nps_enabled: true,
                voucher_enabled: true,
                service_fee_percent: 10
            }
        });
        const savedTenant = await this.tenantRepository.save(newTenant);

        // Hash password and create User
        const salt = await bcrypt.genSalt(10);
        const passwordHash = await bcrypt.hash(password, salt);

        const newUser = this.userRepository.create({
            tenantId: savedTenant.id,
            name: 'Administrador',
            email,
            passwordHash,
            role: normalizeTenantRole(role) || TenantUserRole.Admin,
            phone: whatsapp,
            active: true
        });
        const savedUser = await this.userRepository.save(newUser);

        return {
            message: 'Conta registrada com sucesso!',
            tenant_id: savedTenant.id,
            user_id: savedUser.id
        };
    }

    async login(data: any): Promise<any> {
        const { email, password } = data;

        const user = await this.userRepository.findOne({
            where: { email },
            relations: ['tenant']
        });

        if (!user || !user.active) {
            throw new UnauthorizedException('Credenciais inválidas ou usuário inativo.');
        }

        const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
        if (!isPasswordValid) {
            throw new UnauthorizedException('Credenciais inválidas.');
        }

        // Update last login
        user.lastLoginAt = new Date();
        await this.userRepository.save(user);
        await this.recordAuditEvent(user.tenantId, {
            actorUserId: user.id,
            actorName: user.name,
            actorRole: user.role,
            targetUserId: user.id,
            targetUserName: user.name,
            eventType: 'LOGIN_SUCCESS',
            description: 'Login efetuado com sucesso no tenant admin.',
            metadata: {
                email: user.email,
            },
        });

        const payload = {
            sub: user.id,
            email: user.email,
            role: normalizeTenantRole(user.role),
            tenant_id: user.tenantId,
            tenant_name: user.tenant?.name
        };

        return {
            access_token: this.jwtService.sign(payload),
            user: this.buildSessionUser(user),
        };
    }

    async getProfile(userId: string, tenantId: string) {
        const user = await this.userRepository.findOne({
            where: { id: userId, tenantId },
            relations: ['tenant'],
        });

        if (!user || !user.active) {
            throw new UnauthorizedException('Sua sessão é inválida ou expirou.');
        }

        return this.buildSessionUser(user);
    }

    async listUsers(tenantId: string, actor: TenantActorContext) {
        const users = await this.userRepository.find({
            where: { tenantId },
            order: {
                active: 'DESC',
                createdAt: 'ASC',
            },
        });

        const mappedUsers = users.map((user) => this.buildManagedUser(user, actor));
        const last7Days = Date.now() - (7 * 24 * 60 * 60 * 1000);
        const roleBreakdown = SUPPORTED_TENANT_ROLES.map((role) => {
            const roleUsers = users.filter((user) => normalizeTenantRole(user.role) === role);
            return {
                role,
                label: this.getRoleLabel(role),
                total: roleUsers.length,
                active: roleUsers.filter((user) => !!user.active).length,
            };
        }).filter((item) => item.total > 0);

        return {
            currentUserId: actor.userId,
            currentUserRole: normalizeTenantRole(actor.userRole),
            summary: {
                totalUsers: users.length,
                activeUsers: users.filter((user) => !!user.active).length,
                inactiveUsers: users.filter((user) => !user.active).length,
                recentLogins7d: users.filter((user) => user.lastLoginAt && new Date(user.lastLoginAt).getTime() >= last7Days).length,
                roleBreakdown,
            },
            roleOptions: this.buildRoleOptions(actor.userRole),
            users: mappedUsers,
        };
    }

    async listAuditLogs(tenantId: string, limitRaw?: number) {
        const limit = Math.max(1, Math.min(100, Number(limitRaw || 30)));
        const logs = await this.userAccessAuditLogRepository.find({
            where: { tenantId },
            order: { createdAt: 'DESC' },
            take: limit,
        });

        return {
            items: logs.map((log) => ({
                id: log.id,
                eventType: log.eventType,
                description: log.description,
                actorUserId: log.actorUserId,
                actorName: log.actorName,
                actorRole: normalizeTenantRole(log.actorRole),
                targetUserId: log.targetUserId,
                targetUserName: log.targetUserName,
                metadata: log.metadata || null,
                createdAt: new Date(log.createdAt).toISOString(),
            })),
        };
    }

    async createUser(tenantId: string, actor: TenantActorContext, payload: CreateTenantUserDto) {
        const role = this.normalizeAndValidateRole(payload.role);
        this.assertActorCanAssignRole(actor.userRole, role);

        const email = this.normalizeEmail(payload.email);
        await this.ensureEmailAvailable(email);

        const passwordHash = await this.hashPassword(payload.password);
        const user = this.userRepository.create({
            tenantId,
            name: this.normalizeRequiredText(payload.name, 'Nome'),
            email,
            passwordHash,
            role,
            phone: this.normalizeOptionalText(payload.phone),
            active: payload.active !== false,
        });

        const savedUser = await this.userRepository.save(user);
        await this.recordAuditEvent(tenantId, {
            actorUserId: actor.userId,
            actorName: actor.userName || null,
            actorRole: actor.userRole,
            targetUserId: savedUser.id,
            targetUserName: savedUser.name,
            eventType: 'USER_CREATED',
            description: `Usuário ${savedUser.name} criado com perfil ${this.getRoleLabel(savedUser.role)}.`,
            metadata: {
                email: savedUser.email,
                role: normalizeTenantRole(savedUser.role),
                active: !!savedUser.active,
            },
        });

        return {
            message: 'Usuário criado com sucesso.',
            user: this.buildManagedUser(savedUser, actor),
        };
    }

    async updateUser(tenantId: string, userId: string, actor: TenantActorContext, payload: UpdateTenantUserDto) {
        const user = await this.getManagedUserOrFail(tenantId, userId);
        this.assertActorCanManageTarget(actor.userRole, normalizeTenantRole(user.role));

        if (payload.role !== undefined) {
            const nextRole = this.normalizeAndValidateRole(payload.role);
            this.assertActorCanAssignRole(actor.userRole, nextRole);
            if (normalizeTenantRole(user.role) === TenantUserRole.Admin && nextRole !== TenantUserRole.Admin) {
                await this.ensureAnotherActiveAdminExists(tenantId, user.id);
            }
            user.role = nextRole;
        }

        if (payload.email !== undefined) {
            const email = this.normalizeEmail(payload.email);
            await this.ensureEmailAvailable(email, user.id);
            user.email = email;
        }

        if (payload.name !== undefined) {
            user.name = this.normalizeRequiredText(payload.name, 'Nome');
        }

        if (payload.phone !== undefined) {
            user.phone = this.normalizeOptionalText(payload.phone);
        }

        const previousUserSnapshot = {
            name: user.name,
            email: user.email,
            role: normalizeTenantRole(user.role),
            phone: user.phone || null,
        };
        const savedUser = await this.userRepository.save(user);
        await this.recordAuditEvent(tenantId, {
            actorUserId: actor.userId,
            actorName: actor.userName || null,
            actorRole: actor.userRole,
            targetUserId: savedUser.id,
            targetUserName: savedUser.name,
            eventType: 'USER_UPDATED',
            description: `Cadastro de ${savedUser.name} atualizado.`,
            metadata: {
                before: previousUserSnapshot,
                after: {
                    name: savedUser.name,
                    email: savedUser.email,
                    role: normalizeTenantRole(savedUser.role),
                    phone: savedUser.phone || null,
                },
            },
        });

        return {
            message: 'Usuário atualizado com sucesso.',
            user: this.buildManagedUser(savedUser, actor),
        };
    }

    async updateUserStatus(
        tenantId: string,
        userId: string,
        actor: TenantActorContext,
        payload: UpdateTenantUserStatusDto,
    ) {
        const user = await this.getManagedUserOrFail(tenantId, userId);
        this.assertActorCanManageTarget(actor.userRole, normalizeTenantRole(user.role));

        if (!payload.active && actor.userId === user.id) {
            throw new HttpException('Nao e permitido desativar o proprio usuario em uso.', HttpStatus.BAD_REQUEST);
        }

        if (!payload.active && normalizeTenantRole(user.role) === TenantUserRole.Admin) {
            await this.ensureAnotherActiveAdminExists(tenantId, user.id);
        }

        const previousActive = !!user.active;
        user.active = payload.active;
        const savedUser = await this.userRepository.save(user);
        await this.recordAuditEvent(tenantId, {
            actorUserId: actor.userId,
            actorName: actor.userName || null,
            actorRole: actor.userRole,
            targetUserId: savedUser.id,
            targetUserName: savedUser.name,
            eventType: 'USER_STATUS_UPDATED',
            description: payload.active
                ? `Acesso de ${savedUser.name} reativado.`
                : `Acesso de ${savedUser.name} desativado.`,
            metadata: {
                beforeActive: previousActive,
                afterActive: !!savedUser.active,
            },
        });

        return {
            message: payload.active ? 'Usuário ativado com sucesso.' : 'Usuário desativado com sucesso.',
            user: this.buildManagedUser(savedUser, actor),
        };
    }

    async resetUserPassword(
        tenantId: string,
        userId: string,
        actor: TenantActorContext,
        payload: ResetTenantUserPasswordDto,
    ) {
        const user = await this.getManagedUserOrFail(tenantId, userId);
        this.assertActorCanManageTarget(actor.userRole, normalizeTenantRole(user.role));

        user.passwordHash = await this.hashPassword(payload.password);
        const savedUser = await this.userRepository.save(user);
        await this.recordAuditEvent(tenantId, {
            actorUserId: actor.userId,
            actorName: actor.userName || null,
            actorRole: actor.userRole,
            targetUserId: savedUser.id,
            targetUserName: savedUser.name,
            eventType: 'USER_PASSWORD_RESET',
            description: `Senha de ${savedUser.name} redefinida por gestão.`,
            metadata: null,
        });

        return {
            message: 'Senha redefinida com sucesso.',
            userId: user.id,
            updatedAt: savedUser.updatedAt?.toISOString?.() || new Date().toISOString(),
        };
    }

    async changePassword(userId: string, tenantId: string, payload: ChangePasswordDto) {
        const user = await this.userRepository.findOne({ where: { id: userId, tenantId } });
        if (!user || !user.active) {
            throw new UnauthorizedException('Sua sessão é inválida ou expirou.');
        }

        const isCurrentPasswordValid = await bcrypt.compare(payload.currentPassword, user.passwordHash);
        if (!isCurrentPasswordValid) {
            throw new UnauthorizedException('A senha atual informada está incorreta.');
        }

        const isSamePassword = await bcrypt.compare(payload.newPassword, user.passwordHash);
        if (isSamePassword) {
            throw new HttpException('A nova senha precisa ser diferente da senha atual.', HttpStatus.BAD_REQUEST);
        }

        user.passwordHash = await this.hashPassword(payload.newPassword);
        await this.userRepository.save(user);
        await this.recordAuditEvent(tenantId, {
            actorUserId: user.id,
            actorName: user.name,
            actorRole: user.role,
            targetUserId: user.id,
            targetUserName: user.name,
            eventType: 'PASSWORD_CHANGED',
            description: 'Usuário alterou a própria senha.',
            metadata: null,
        });

        return {
            message: 'Senha atualizada com sucesso.',
        };
    }

    async toggleTenantStatus(tenantId: string, currentStatus: boolean, token?: string, actor?: TenantActorContext): Promise<any> {
        return this.setTenantStatus(tenantId, !currentStatus, actor);
    }

    async setTenantStatus(tenantId: string, isOpen: boolean, actor?: TenantActorContext): Promise<any> {
        const tenant = await this.tenantRepository.findOne({ where: { id: tenantId } });
        if (!tenant) {
            throw new HttpException('Restaurante não encontrado.', HttpStatus.NOT_FOUND);
        }

        tenant.isOpen = isOpen;
        await this.tenantRepository.save(tenant);
        await this.recordAuditEvent(tenantId, {
            actorUserId: actor?.userId,
            actorName: actor?.userName,
            actorRole: actor?.userRole,
            eventType: 'TENANT_STATUS_UPDATED',
            description: tenant.isOpen ? 'Expediente aberto no tenant admin.' : 'Expediente fechado no tenant admin.',
            metadata: {
                isOpen: !!tenant.isOpen,
            },
        });

        return {
            success: true,
            is_open: tenant.isOpen,
            message: tenant.isOpen ? 'Expediente Aberto!' : 'Expediente Fechado'
        };
    }

    async getTenantMessages(tenantId: string): Promise<any> {
        const tenant = await this.tenantRepository.findOne({ where: { id: tenantId } });
        if (!tenant) {
            throw new HttpException('Restaurante não encontrado.', HttpStatus.NOT_FOUND);
        }

        const customMessages = (tenant.settings?.messages || {}) as MessageTemplates;
        const mergedMessages: MessageTemplates = {
            ...DEFAULT_MESSAGE_TEMPLATES,
            ...customMessages,
        };

        return {
            tenant_id: tenant.id,
            messages: mergedMessages,
            defaults: DEFAULT_MESSAGE_TEMPLATES,
        };
    }

    async updateTenantMessages(tenantId: string, payload: any, actor?: TenantActorContext): Promise<any> {
        const tenant = await this.tenantRepository.findOne({ where: { id: tenantId } });
        if (!tenant) {
            throw new HttpException('Restaurante não encontrado.', HttpStatus.NOT_FOUND);
        }

        const currentSettings = (tenant.settings || {}) as TenantSettings;
        const cleanMessages: MessageTemplates = {};

        for (const key of MESSAGE_TEMPLATE_KEYS) {
            const raw = payload?.[key];
            if (typeof raw !== 'string') continue;
            const trimmed = raw.trim();
            if (trimmed) cleanMessages[key] = trimmed;
        }

        tenant.settings = {
            ...currentSettings,
            messages: cleanMessages,
        };

        await this.tenantRepository.save(tenant);
        await this.recordAuditEvent(tenantId, {
            actorUserId: actor?.userId,
            actorName: actor?.userName,
            actorRole: actor?.userRole,
            eventType: 'MESSAGE_TEMPLATES_UPDATED',
            description: 'Templates de mensagens automáticas atualizados.',
            metadata: {
                customizedKeys: Object.keys(cleanMessages),
            },
        });

        return {
            status: 'updated',
            messages: cleanMessages,
            defaults: DEFAULT_MESSAGE_TEMPLATES,
        };
    }

    private buildSessionUser(user: User & { tenant?: Tenant | null }) {
        const normalizedRole = normalizeTenantRole(user.role);

        return {
            id: user.id,
            name: user.name,
            email: user.email,
            phone: user.phone || null,
            role: normalizedRole,
            tenant_id: user.tenantId,
            tenant_name: user.tenant?.name,
            active: !!user.active,
            isOpen: !!user.tenant?.isOpen,
            last_login_at: user.lastLoginAt ? new Date(user.lastLoginAt).toISOString() : null,
            permissions: this.buildFrontendPermissions(normalizedRole),
        };
    }

    private buildManagedUser(user: User, actor: TenantActorContext): ManagedTenantUser {
        const actorRole = normalizeTenantRole(actor.userRole);
        const targetRole = normalizeTenantRole(user.role);
        const canManageTarget = this.canActorManageTarget(actorRole, targetRole);
        const isCurrentUser = actor.userId === user.id;

        return {
            id: user.id,
            name: user.name,
            email: user.email,
            phone: user.phone || null,
            role: targetRole,
            roleLabel: this.getRoleLabel(targetRole),
            active: !!user.active,
            isCurrentUser,
            lastLoginAt: user.lastLoginAt ? new Date(user.lastLoginAt).toISOString() : null,
            createdAt: new Date(user.createdAt).toISOString(),
            updatedAt: new Date(user.updatedAt).toISOString(),
            permissions: {
                canEdit: canManageTarget,
                canToggleStatus: canManageTarget && !isCurrentUser,
                canResetPassword: canManageTarget,
            },
        };
    }

    private buildRoleOptions(actorRole: string) {
        const normalizedActorRole = normalizeTenantRole(actorRole);

        return SUPPORTED_TENANT_ROLES.map((role) => ({
            value: role,
            label: this.getRoleLabel(role),
            assignable: this.canActorAssignRole(normalizedActorRole, role),
        }));
    }

    private buildFrontendPermissions(role: string) {
        const normalizedRole = normalizeTenantRole(role);
        const routeGroupAccessors = [
            { key: 'full_access', roles: TENANT_FULL_ACCESS_ROLES },
            { key: 'menu_read', roles: TENANT_MENU_READ_ROLES },
            { key: 'menu_write', roles: TENANT_MENU_WRITE_ROLES },
            { key: 'order_read_write', roles: TENANT_ORDER_WRITE_ROLES },
            { key: 'order_cancel', roles: TENANT_ORDER_CANCEL_ROLES },
            { key: 'table_read', roles: TENANT_TABLE_READ_ROLES },
            { key: 'table_write', roles: TENANT_TABLE_WRITE_ROLES },
            { key: 'floor_operations', roles: TENANT_FLOOR_ROLES },
            { key: 'settlement', roles: TENANT_SETTLEMENT_ROLES },
            { key: 'reports', roles: TENANT_REPORT_ROLES },
            { key: 'wallet', roles: TENANT_WALLET_ROLES },
            { key: 'bot_config', roles: TENANT_BOT_CONFIG_ROLES },
        ];
        const routeGroups = routeGroupAccessors
            .filter((group) => this.isRoleAllowed(normalizedRole, group.roles))
            .map((group) => group.key);
        const pages = ['dashboard'];

        if (routeGroups.includes('wallet')) pages.push('wallet', 'extratoMensagens');
        if (routeGroups.includes('order_read_write')) pages.push('pedidos');
        if (routeGroups.includes('menu_read')) pages.push('cardapio', 'categorias');
        if (routeGroups.includes('table_read')) pages.push('mesas');
        if (routeGroups.includes('reports')) pages.push('vendas');
        if (routeGroups.includes('full_access')) pages.push('configuracoes', 'equipe');

        return {
            pages,
            routeGroups,
            actions: {
                manageUsers: this.isRoleAllowed(normalizedRole, TENANT_FULL_ACCESS_ROLES),
                manageSettings: this.isRoleAllowed(normalizedRole, TENANT_FULL_ACCESS_ROLES),
                toggleTenantStatus: this.isRoleAllowed(normalizedRole, TENANT_FULL_ACCESS_ROLES),
                manageMenu: this.isRoleAllowed(normalizedRole, TENANT_MENU_WRITE_ROLES),
                manageOrders: this.isRoleAllowed(normalizedRole, TENANT_ORDER_WRITE_ROLES),
                cancelOrders: this.isRoleAllowed(normalizedRole, TENANT_ORDER_CANCEL_ROLES),
                manageTables: this.isRoleAllowed(normalizedRole, TENANT_TABLE_WRITE_ROLES),
                manageSettlement: this.isRoleAllowed(normalizedRole, TENANT_SETTLEMENT_ROLES),
                viewReports: this.isRoleAllowed(normalizedRole, TENANT_REPORT_ROLES),
                viewWallet: this.isRoleAllowed(normalizedRole, TENANT_WALLET_ROLES),
            },
        };
    }

    private getRoleLabel(role: string) {
        const normalizedRole = normalizeTenantRole(role);
        const labels: Record<string, string> = {
            [TenantUserRole.Admin]: 'Administrador',
            [TenantUserRole.Manager]: 'Gerente',
            [TenantUserRole.Waiter]: 'Garçom',
            [TenantUserRole.Kitchen]: 'Cozinha',
            [TenantUserRole.Bar]: 'Bar',
            [TenantUserRole.Cashier]: 'Caixa',
        };

        return labels[normalizedRole] || normalizedRole;
    }

    private normalizeAndValidateRole(role: string) {
        const normalizedRole = normalizeTenantRole(role);
        if (!SUPPORTED_TENANT_ROLES.includes(normalizedRole as typeof SUPPORTED_TENANT_ROLES[number])) {
            throw new HttpException('Perfil informado é inválido.', HttpStatus.BAD_REQUEST);
        }

        return normalizedRole;
    }

    private assertActorCanAssignRole(actorRole: string, targetRole: string) {
        const normalizedActorRole = normalizeTenantRole(actorRole);
        if (!this.canActorAssignRole(normalizedActorRole, targetRole)) {
            throw new ForbiddenException('Seu perfil nao pode atribuir este papel.');
        }
    }

    private assertActorCanManageTarget(actorRole: string, targetRole: string) {
        if (!this.canActorManageTarget(actorRole, targetRole)) {
            throw new ForbiddenException('Seu perfil nao pode gerenciar este usuário.');
        }
    }

    private canActorAssignRole(actorRole: string, targetRole: string) {
        const normalizedActorRole = normalizeTenantRole(actorRole);
        const normalizedTargetRole = normalizeTenantRole(targetRole);

        if (normalizedActorRole === TenantUserRole.Admin) {
            return true;
        }

        if (normalizedActorRole === TenantUserRole.Manager) {
            return normalizedTargetRole !== TenantUserRole.Admin;
        }

        return false;
    }

    private canActorManageTarget(actorRole: string, targetRole: string) {
        const normalizedActorRole = normalizeTenantRole(actorRole);
        const normalizedTargetRole = normalizeTenantRole(targetRole);

        if (!this.isRoleAllowed(normalizedActorRole, TENANT_FULL_ACCESS_ROLES)) {
            return false;
        }

        if (normalizedActorRole === TenantUserRole.Manager && normalizedTargetRole === TenantUserRole.Admin) {
            return false;
        }

        return true;
    }

    private isRoleAllowed(role: string, allowedRoles: readonly string[]) {
        const normalizedRole = normalizeTenantRole(role);
        return allowedRoles.map((item) => normalizeTenantRole(item)).includes(normalizedRole);
    }

    private async getManagedUserOrFail(tenantId: string, userId: string) {
        const user = await this.userRepository.findOne({
            where: { id: userId, tenantId },
        });

        if (!user) {
            throw new HttpException('Usuário não encontrado.', HttpStatus.NOT_FOUND);
        }

        return user;
    }

    private async ensureEmailAvailable(email: string, ignoreUserId?: string) {
        const existingUser = await this.userRepository.findOne({
            where: ignoreUserId ? { email, id: Not(ignoreUserId) } : { email },
        });

        if (existingUser) {
            throw new HttpException('Email já cadastrado.', HttpStatus.BAD_REQUEST);
        }
    }

    private async ensureAnotherActiveAdminExists(tenantId: string, ignoreUserId: string) {
        const activeAdmins = await this.userRepository.count({
            where: {
                tenantId,
                role: TenantUserRole.Admin,
                active: true,
                id: Not(ignoreUserId),
            },
        });

        if (activeAdmins === 0) {
            throw new HttpException('Nao e permitido remover ou desativar o ultimo administrador ativo.', HttpStatus.BAD_REQUEST);
        }
    }

    private normalizeEmail(email: string) {
        return String(email || '').trim().toLowerCase();
    }

    private normalizeRequiredText(value: string, fieldLabel: string) {
        const normalized = String(value || '').trim();
        if (!normalized) {
            throw new HttpException(`${fieldLabel} é obrigatório.`, HttpStatus.BAD_REQUEST);
        }

        return normalized;
    }

    private normalizeOptionalText(value?: string | null) {
        const normalized = String(value || '').trim();
        return normalized || null;
    }

    private async hashPassword(password: string) {
        const salt = await bcrypt.genSalt(10);
        return bcrypt.hash(password, salt);
    }

    private async recordAuditEvent(
        tenantId: string,
        payload: {
            actorUserId?: string | null;
            actorName?: string | null;
            actorRole?: string | null;
            targetUserId?: string | null;
            targetUserName?: string | null;
            eventType: string;
            description: string;
            metadata?: Record<string, unknown> | null;
        },
    ) {
        const log = this.userAccessAuditLogRepository.create({
            tenantId,
            actorUserId: this.normalizeUuidOrNull(payload.actorUserId),
            actorName: this.normalizeOptionalText(payload.actorName),
            actorRole: this.normalizeOptionalText(payload.actorRole),
            targetUserId: this.normalizeUuidOrNull(payload.targetUserId),
            targetUserName: this.normalizeOptionalText(payload.targetUserName),
            eventType: payload.eventType,
            description: payload.description,
            metadata: payload.metadata || null,
        });
        await this.userAccessAuditLogRepository.save(log);
    }

    private normalizeUuidOrNull(value?: string | null) {
        const normalized = String(value || '').trim();
        return normalized || null;
    }
}
