import { TelegrafExecutionContext } from 'nestjs-telegraf';
import { UserService } from '../users/user.service';
import { ConfigService } from '@nestjs/config';
import { Role } from '@prisma/client';
import { Context } from 'telegraf';
import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
} from '@nestjs/common';

@Injectable()
export class AdminGuard implements CanActivate {
  private readonly logger = new Logger(AdminGuard.name);
  private readonly adminId: number;

  constructor(
    private readonly userService: UserService,
    private readonly configService: ConfigService,
  ) {
    this.adminId = parseInt(
      this.configService.get<string>('ADMIN_TELEGRAM_ID', '620756711'),
      10,
    );
  }

  public async canActivate(context: ExecutionContext): Promise<boolean> {
    const ctx = TelegrafExecutionContext.create(context).getContext<Context>();
    const from = ctx.from;
    if (!from) return false;

    if (from.id === this.adminId) return true;

    const user = await this.userService.findByTelegramId(from.id);
    if (user?.role === Role.ADMIN) return true;

    this.logger.warn(`Denied admin command from non-admin user ${from.id}`);
    return false;
  }
}
