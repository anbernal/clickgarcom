import { Injectable, HttpException, HttpStatus, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { User } from '../../entities/user.entity';
import { MessageTemplates, Tenant, TenantSettings } from '../../entities/tenant.entity';

const DEFAULT_MESSAGE_TEMPLATES: MessageTemplates = {
    msg_welcome: `🍽️ Olá! Bem-vindo ao *{nome_restaurante}*!

Como posso te ajudar hoje?

*1* - 🛒 Fazer pedido
*2* - 📋 Ver minha comanda
*3* - 🔄 Repetir última rodada
*4* - 🙋 Chamar garçom
*5* - 💰 Fechar conta

_Digite o número da opção desejada_`,
    msg_restaurant_closed: `🚪 *O restaurante ainda não está aberto.*

Agradecemos o seu contato, mas nossas atividades estão encerradas no momento.
Aguarde, em breve abriremos!`,
    msg_welcome_table: `🍽️ Olá! Bem-vindo ao *{nome_restaurante}*!

Vimos que você está na *Mesa {numero_mesa}*.
Para começarmos a te atender, para quantas pessoas é a mesa?

_Digite apenas o número de pessoas (ex: 2)_`,
    msg_table_request_pending: `⏳ *Mesa solicitada!*

Aguarde um momento enquanto nossa equipe libera o acesso ao cardápio para sua mesa.`,
    msg_table_approved: `✅ *Mesa liberada!*

Você já pode acessar nosso menu principal:

*1* - 🛒 Fazer pedido
*2* - 📋 Ver minha comanda
*4* - 🙋 Chamar garçom

_Digite o número da opção_`,
    msg_main_menu: `📱 *Menu Principal*

*1* - 🛒 Fazer pedido
*2* - 📋 Ver minha comanda
*3* - 🔄 Repetir última rodada
*4* - 🙋 Chamar garçom
*5* - 💰 Fechar conta

_Digite o número da opção_`,
    msg_invalid_option: `❌ Opção inválida.

Por favor, digite um número válido do menu.`,
    msg_order_confirmed: `✅ *Pedido confirmado!*

Número do pedido: *#{numero_pedido}*

Seu pedido está sendo preparado.
Você receberá uma notificação quando estiver pronto! 🍳`,
    msg_order_ready: `🔔 *Pedido #{numero_pedido} está pronto!*

Nosso garçom já está levando até você! 🚶`,
    msg_tab_summary: `📋 *Sua Comanda*

{itens}
━━━━━━━━━━━━━━━━
Subtotal: R$ {subtotal}
Taxa de serviço (10%): R$ {taxa}
━━━━━━━━━━━━━━━━
*Total: R$ {total}*

_Use o menu para fazer mais pedidos ou fechar a conta_`,
    msg_service_request: `✅ *Solicitação registrada!*

Tipo: {tipo_servico}

Nosso garçom já foi avisado e virá te atender em breve! 🙋`,
    msg_payment_pending: "💰 *Fechar Conta*\n\nTotal a pagar: *R$ {total}*\n\n🔑 *Pix Copia e Cola:*\n`{codigo_pix}`\n\n_Copie o código acima e pague pelo seu app do banco_\n\nVocê receberá confirmação assim que o pagamento for identificado! ✅",
    msg_payment_confirmed: `✅ *Pagamento confirmado!*

Valor: R$ {total}

Obrigado pela preferência! 
Esperamos vê-lo novamente em breve! 😊

_Como foi sua experiência?_
Avalie de 0 a 10:`,
};

const MESSAGE_TEMPLATE_KEYS: Array<keyof MessageTemplates> = [
    'msg_welcome',
    'msg_restaurant_closed',
    'msg_welcome_table',
    'msg_table_request_pending',
    'msg_table_approved',
    'msg_main_menu',
    'msg_invalid_option',
    'msg_order_confirmed',
    'msg_order_ready',
    'msg_tab_summary',
    'msg_service_request',
    'msg_payment_pending',
    'msg_payment_confirmed',
];

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
