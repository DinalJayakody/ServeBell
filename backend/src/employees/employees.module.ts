import { Module } from '@nestjs/common';
import { EmployeesController } from './employees.controller.js';
import { InvitationsService } from './invitations.service.js';

@Module({ controllers: [EmployeesController], providers: [InvitationsService], exports: [InvitationsService] })
export class EmployeesModule {}
