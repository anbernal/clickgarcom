import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
    const app = await NestFactory.create(AppModule);

    app.enableCors();

    const port = process.env.APP_PORT || 3005;
    await app.listen(port);
    console.log(`ClickGarcom Super Admin API running on http://localhost:${port}`);
}

bootstrap();
