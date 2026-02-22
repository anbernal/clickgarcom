import { Controller, Get, Res } from '@nestjs/common';
import { Response } from 'express';
import { join } from 'path';

@Controller()
export class AppController {

    @Get('login.html')
    serveLogin(@Res() res: Response) {
        res.sendFile(join(__dirname, '..', 'public', 'login.html'));
    }

    @Get('register.html')
    serveRegister(@Res() res: Response) {
        res.sendFile(join(__dirname, '..', 'public', 'register.html'));
    }
}
