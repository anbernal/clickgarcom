import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrap() {
    const app = await NestFactory.create(AppModule);

    app.useGlobalPipes(
        new ValidationPipe({
            whitelist: true,
            transform: true,
            transformOptions: { enableImplicitConversion: true },
        }),
    );

    app.enableCors();

    const port = process.env.APP_PORT || 3002;
    await app.listen(port);
    console.log(`🍽  ClickGarçom Admin running on http://localhost:${port}`);
}
bootstrap();
