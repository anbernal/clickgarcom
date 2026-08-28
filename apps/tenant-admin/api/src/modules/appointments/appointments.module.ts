import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppointmentService } from '../../entities/appointment-service.entity';
import { AppointmentProfessional } from '../../entities/appointment-professional.entity';
import { Appointment } from '../../entities/appointment.entity';
import { AppointmentAutomationVersion } from '../../entities/appointment-automation-version.entity';
import { Customer } from '../../entities/customer.entity';
import { Tenant } from '../../entities/tenant.entity';
import { DomainOutboxEvent } from '../../entities/domain-outbox-event.entity';
import { AppointmentsController, AppointmentsInternalController, AppointmentsPublicController } from './appointments.controller';
import { AppointmentsService } from './appointments.service';
@Module({ imports: [TypeOrmModule.forFeature([AppointmentService, AppointmentProfessional, Appointment, AppointmentAutomationVersion, Customer, Tenant, DomainOutboxEvent])], controllers: [AppointmentsController, AppointmentsPublicController, AppointmentsInternalController], providers: [AppointmentsService], exports: [AppointmentsService] })
export class AppointmentsModule {}
