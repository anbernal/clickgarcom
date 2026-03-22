import { Injectable, HttpException, HttpStatus, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { User } from '../../entities/user.entity';
import { MessageTemplates, Tenant, TenantSettings } from '../../entities/tenant.entity';
import { DEFAULT_MESSAGE_TEMPLATES, MESSAGE_TEMPLATE_KEYS } from '../../shared/message-templates';
import { TenantUserRole, normalizeTenantRole } from './roles';

@Injectable()
export class AuthService {
    constructor(
        @InjectRepository(User) private readonly userRepository: Repository<User>,
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

        const payload = {
            sub: user.id,
            email: user.email,
            role: normalizeTenantRole(user.role),
            tenant_id: user.tenantId,
            tenant_name: user.tenant?.name
        };

        return {
            access_token: this.jwtService.sign(payload),
            user: {
                id: user.id,
                name: user.name,
                email: user.email,
                role: normalizeTenantRole(user.role),
                tenant_id: user.tenantId,
                tenant_name: user.tenant?.name
            }
        };
    }

    async toggleTenantStatus(tenantId: string, currentStatus: boolean, token?: string): Promise<any> {
        return this.setTenantStatus(tenantId, !currentStatus);
    }

    async setTenantStatus(tenantId: string, isOpen: boolean): Promise<any> {
        const tenant = await this.tenantRepository.findOne({ where: { id: tenantId } });
        if (!tenant) {
            throw new HttpException('Restaurante não encontrado.', HttpStatus.NOT_FOUND);
        }

        tenant.isOpen = isOpen;
        await this.tenantRepository.save(tenant);

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

    async updateTenantMessages(tenantId: string, payload: any): Promise<any> {
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

        return {
            status: 'updated',
            messages: cleanMessages,
            defaults: DEFAULT_MESSAGE_TEMPLATES,
        };
    }
}
