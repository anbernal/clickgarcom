import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Tenant } from './entities/tenant.entity';
import { User } from './entities/user.entity';
import { AppController } from './app.controller';
import { SuperAdminModule } from './modules/super-admin/super-admin.module';

@Module({
    imports: [
        ConfigModule.forRoot({ isGlobal: true }),
        TypeOrmModule.forRoot({
            type: 'postgres',
            host: process.env.DATABASE_HOST || 'localhost',
            port: parseInt(process.env.DATABASE_PORT || '5432', 10),
            username: process.env.DATABASE_USER || 'postgres',
            password: process.env.DATABASE_PASSWORD || 'postgres123',
            database: process.env.DATABASE_NAME || 'clickgarcom_db',
            entities: [Tenant, User],
            synchronize: false,
        }),
        SuperAdminModule,
    ],
    controllers: [AppController],
})
export class AppModule { }
