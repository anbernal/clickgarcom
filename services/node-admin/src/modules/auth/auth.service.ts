import { Injectable, HttpException, HttpStatus, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { User } from '../../entities/user.entity';
import { Tenant } from '../../entities/tenant.entity';

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
            role: role || 'ADMIN',
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
            role: user.role,
            tenant_id: user.tenantId,
            tenant_name: user.tenant?.name
        };

        return {
            access_token: this.jwtService.sign(payload),
            user: {
                id: user.id,
                name: user.name,
                email: user.email,
                role: user.role,
                tenant_id: user.tenantId,
                tenant_name: user.tenant?.name
            }
        };
    }

    async toggleTenantStatus(tenantId: string, currentStatus: boolean, token?: string): Promise<any> {
        const tenant = await this.tenantRepository.findOne({ where: { id: tenantId } });
        if (!tenant) {
            throw new HttpException('Restaurante não encontrado.', HttpStatus.NOT_FOUND);
        }

        tenant.isOpen = !currentStatus;
        await this.tenantRepository.save(tenant);

        return {
            success: true,
            is_open: tenant.isOpen,
            message: tenant.isOpen ? 'Expediente Aberto!' : 'Expediente Fechado'
        };
    }
}

