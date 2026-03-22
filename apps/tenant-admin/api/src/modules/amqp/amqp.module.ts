import { Module, Global } from '@nestjs/common';
import { AmqpService } from './amqp.service';

@Global()
@Module({
    providers: [AmqpService],
    exports: [AmqpService],
})
export class AmqpModule { }
