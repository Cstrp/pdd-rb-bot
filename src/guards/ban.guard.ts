import { TelegrafExecutionContext } from 'nestjs-telegraf';
import { UserService } from '../users/user.service';
import { ConfigService } from '@nestjs/config';
import { Context } from 'telegraf';
import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
} from '@nestjs/common';

@Injectable()
export class BanGuard implements CanActivate {
  private readonly logger = new Logger(BanGuard.name);
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
    if (!user?.isBanned) return true;

    await ctx.reply(
      user.banReason
        ? `Вы заблокированы: ${user.banReason}`
        : 'Вы заблокированы и не можете пользоваться ботом.',
    );

    this.logger.warn(`Blocked request from banned user ${from.id}`);
    return false;
  }
}
