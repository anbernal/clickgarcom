import { ExtractJwt, Strategy } from 'passport-jwt';
import { PassportStrategy } from '@nestjs/passport';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { User } from '../../entities/user.entity';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
    constructor(
        @InjectRepository(User) private readonly userRepository: Repository<User>,
        private configService: ConfigService,
    ) {
        super({
            jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
            ignoreExpiration: false,
            secretOrKey: configService.get<string>('JWT_SECRET') || 'super-secret-key-clg-2024',
        });
    }

    async validate(payload: any) {
        // payload: { sub: userId, email, role, tenant_id }
        const user = await this.userRepository.findOne({
            where: { id: payload.sub },
            relations: ['tenant'],
        });

        if (!user || !user.active) {
            throw new UnauthorizedException('Sua sessão é inválida ou expirou.');
        }

        return {
            id: user.id,
            email: user.email,
            tenantId: user.tenantId,
            role: user.role,
            name: user.name,
            tenantName: user.tenant?.name,
            isOpen: !!user.tenant?.isOpen,
        };
    }
}
