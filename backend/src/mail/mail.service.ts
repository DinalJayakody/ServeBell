import { Global, Injectable, Logger, Module } from '@nestjs/common';
import nodemailer, { type Transporter } from 'nodemailer';
import { AppConfig } from '../config/config.module.js';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly transport: Transporter | null;

  constructor(private readonly config: AppConfig) {
    this.transport = config.env.SMTP_URL ? nodemailer.createTransport(config.env.SMTP_URL) : null;
  }

  async send(to: string, subject: string, text: string) {
    if (!this.transport) {
      if (this.config.isProd) {
        this.logger.error(`SMTP not configured; could not send "${subject}"`);
        return;
      }
      // Development only: print instead of sending so flows can be tested locally.
      this.logger.warn(`[dev mail] to=${to} subject="${subject}"\n${text}`);
      return;
    }
    await this.transport.sendMail({ from: this.config.env.MAIL_FROM, to, subject, text });
  }
}

@Global()
@Module({ providers: [MailService], exports: [MailService] })
export class MailModule {}
