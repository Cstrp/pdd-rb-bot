import {
  Command,
  Ctx,
  Hears,
  InjectBot,
  On,
  Start,
  Update,
} from 'nestjs-telegraf';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { Injectable, OnModuleInit, UseGuards } from '@nestjs/common';
import type { InputMediaPhoto } from 'telegraf/types';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { UserService } from '../users/user.service';
import { AdminGuard } from '../guards/admin.guard';
import { ConfigService } from '@nestjs/config';
import { BanGuard } from '../guards/ban.guard';
import telegramify from 'telegramify-markdown';
import { Context, Telegraf } from 'telegraf';
import { RagService } from '@app/rag';
import { OcrService } from '@app/ocr';
import { Role } from '@prisma/client';
import axios from 'axios';

const MAX_MEDIA_GROUP = 10;
const TYPING_REFRESH_MS = 4500;
const USERS_PAGE_SIZE = 20;

const STATUS = {
  SEARCHING: '🔍 Ищу в базе ПДД...',
  RECOGNIZING: '🖼 Читаю изображение...',
  GENERATING: '🤔 Генерирую ответ...',
  ERROR_OCR: '❌ Не удалось распознать текст на изображении.',
  ERROR_GENERAL: '❌ Произошла ошибка при обработке. Попробуй ещё раз.',
} as const;

@Update()
@Injectable()
export class TelegramService implements OnModuleInit {
  private readonly adminId: number;

  constructor(
    @InjectPinoLogger(TelegramService.name)
    private readonly logger: PinoLogger,
    @InjectBot() private readonly bot: Telegraf<Context>,
    private readonly ragService: RagService,
    private readonly ocrService: OcrService,
    private readonly userService: UserService,
    private readonly configService: ConfigService,
    private readonly eventEmitter: EventEmitter2,
  ) {
    this.adminId = parseInt(
      this.configService.get<string>('ADMIN_TELEGRAM_ID', '620756711'),
      10,
    );
  }

  public async onModuleInit() {
    await this.userService.ensureAdmin(this.adminId);

    const commands = await this.bot.telegram.getMyCommands();

    if (!commands.length) {
      await this.bot.telegram.setMyCommands([
        { command: 'start', description: 'Начать диалог с ботом' },
        {
          command: 'help',
          description: 'Получить справку по использованию бота',
        },
      ]);
    }

    await this.bot.telegram.setMyCommands(
      [
        { command: 'start', description: 'Начать диалог с ботом' },
        {
          command: 'help',
          description: 'Получить справку по использованию бота',
        },
        {
          command: 'ban',
          description: 'Заблокировать: /ban <@username или id> [причина]',
        },
        {
          command: 'unban',
          description: 'Разблокировать: /unban <@username или id>',
        },
        {
          command: 'users',
          description: 'Список пользователей: /users [страница]',
        },
        {
          command: 'promote',
          description: 'Выдать роль админа: /promote <@username или id>',
        },
        {
          command: 'demote',
          description: 'Снять роль админа: /demote <@username или id>',
        },
      ],
      { scope: { type: 'chat', chat_id: this.adminId } },
    );

    this.logger.info('Telegram bot initialized');
  }

  @Start()
  public async onStart(@Ctx() ctx: Context) {
    if (!ctx.from) return;

    await this.userService.upsert(ctx.from.id, {
      username: ctx.from.username,
      firstName: ctx.from.first_name,
      lastName: ctx.from.last_name,
    });

    this.logger.debug(
      { userId: ctx.from?.id, username: ctx.from?.username },
      'Start command received',
    );

    await ctx.reply(
      'Привет! Я могу помочь тебе с вопросами по Правилам дорожного движения Республики Беларусь. Просто задай свой вопрос.',
    );
  }

  @Command('help')
  public async onHelp(@Ctx() ctx: Context) {
    await ctx.reply(
      'ℹ️ *Как пользоваться ботом*\n\n' +
        '• Просто напиши свой вопрос по ПДД РБ — бот найдёт ответ в базе правил.\n' +
        '• Отправь фото с текстом (например, билет или знак) — бот распознает вопрос и ответит.\n\n' +
        '*Команды:*\n' +
        '/start — начать диалог\n' +
        '/help — эта справка',
      { parse_mode: 'Markdown' },
    );
  }

  @Hears(/^[^/]/)
  public async onText(@Ctx() ctx: Context) {
    const message = ctx.message;
    if (!message || !('text' in message)) return;

    if (!ctx.from) return;

    await this.userService.upsert(ctx.from.id, {
      username: ctx.from.username,
      firstName: ctx.from.first_name,
      lastName: ctx.from.last_name,
    });

    const question = message.text;

    this.logger.debug(
      {
        userId: ctx.from?.id,
        username: ctx.from?.username,
        questionLength: question.length,
      },
      'Text message received',
    );

    this.eventEmitter.emit('telegram.query.received', {
      userId: ctx.from?.id,
      type: 'text',
    });

    const statusMsg = await ctx.reply(STATUS.SEARCHING);
    const interval = this.startTypingInterval(ctx);

    try {
      await this.performRagQuery(ctx, question, statusMsg.message_id);
    } finally {
      clearInterval(interval);
    }
  }

  @On('photo')
  public async onPhoto(@Ctx() ctx: Context) {
    const message = ctx.message;

    if (!message || !('photo' in message)) return;

    if (!ctx.from) return;

    await this.userService.upsert(ctx.from.id, {
      username: ctx.from.username,
      firstName: ctx.from.first_name,
      lastName: ctx.from.last_name,
    });

    const caption = 'caption' in message ? (message.caption ?? '') : '';
    const photo = message.photo.at(-1);
    if (!photo) return;

    this.logger.debug(
      {
        userId: ctx.from?.id,
        username: ctx.from?.username,
        fileId: photo.file_id,
      },
      'Photo received',
    );

    this.eventEmitter.emit('telegram.query.received', {
      userId: ctx.from?.id,
      type: 'photo',
    });

    const statusMsg = await ctx.reply(STATUS.RECOGNIZING);
    const interval = this.startTypingInterval(ctx);

    try {
      const fileLink = await ctx.telegram.getFileLink(photo.file_id);
      const { data } = await axios.get<ArrayBuffer>(fileLink.href, {
        responseType: 'arraybuffer',
      });

      const ocrText = await this.ocrService.recognize(Buffer.from(data));
      const question = this.ocrService.buildQuery(ocrText, caption);

      if (!question.trim()) {
        this.logger.warn({ userId: ctx.from?.id }, 'OCR returned empty text');

        await this.editStatus(ctx, statusMsg.message_id, STATUS.ERROR_OCR);
        return;
      }

      await this.performRagQuery(ctx, question, statusMsg.message_id);
    } catch (err) {
      this.logger.error(
        { userId: ctx.from?.id, error: (err as Error).message },
        'Failed to process photo',
      );

      await this.editStatus(ctx, statusMsg.message_id, STATUS.ERROR_GENERAL);
    } finally {
      clearInterval(interval);
    }
  }

  @Command('ban')
  @UseGuards(AdminGuard)
  public async onBan(@Ctx() ctx: Context) {
    const message = ctx.message;
    if (!message || !('text' in message)) return;

    const parts = message.text.trim().split(/\s+/);
    const target = parts[1] ?? '';

    if (!target) {
      await ctx.reply('Использование: /ban <@username или id> [причина]');
      return;
    }

    const reason = parts.slice(2).join(' ') || undefined;
    const resolved = await this.resolveTarget(target);

    if (!resolved) {
      await ctx.reply(`Пользователь ${target} не найден.`);
      return;
    }

    await this.userService.ban(Number(resolved.telegramId), reason);
    const label = resolved.username ? `@${resolved.username}` : target;

    await ctx.reply(
      `✅ Пользователь ${label} заблокирован${reason ? `: ${reason}` : '.'}`,
    );

    this.logger.info(
      { adminId: ctx.from?.id, target, reason },
      'User banned by admin',
    );
  }

  @Command('unban')
  @UseGuards(AdminGuard)
  public async onUnban(@Ctx() ctx: Context) {
    const message = ctx.message;
    if (!message || !('text' in message)) return;

    const parts = message.text.trim().split(/\s+/);
    const target = parts[1] ?? '';

    if (!target) {
      await ctx.reply('Использование: /unban <@username или id>');
      return;
    }

    const resolved = await this.resolveTarget(target);

    if (!resolved) {
      await ctx.reply(`Пользователь ${target} не найден.`);
      return;
    }

    await this.userService.unban(Number(resolved.telegramId));
    const label = resolved.username ? `@${resolved.username}` : target;

    await ctx.reply(`✅ Пользователь ${label} разблокирован.`);
    this.logger.info(
      { adminId: ctx.from?.id, target },
      'User unbanned by admin',
    );
  }

  @Command('users')
  @UseGuards(AdminGuard)
  public async onUsers(@Ctx() ctx: Context) {
    const message = ctx.message;
    if (!message || !('text' in message)) return;

    const parts = message.text.trim().split(/\s+/);
    const page = Math.max(1, parseInt(parts[1] ?? '1', 10) || 1);

    const { users, total, pages } = await this.userService.list(page);

    if (users.length === 0) {
      await ctx.reply('Пользователи не найдены.');
      return;
    }

    const lines = users.map((u) => {
      const id = u.telegramId.toString();
      const name = [u.firstName, u.lastName].filter(Boolean).join(' ') || '—';
      const username = u.username ? `@${u.username}` : '—';
      const role = u.role === Role.ADMIN ? ' [ADMIN]' : '';
      const banned = u.isBanned ? ' 🚫' : '';
      return `${id} ${username} (${name})${role}${banned}`;
    });

    await ctx.reply(
      `👥 Пользователи (стр. ${page}/${pages}, всего: ${total}):\n\n${lines.join('\n')}`,
    );
  }

  @Command('promote')
  @UseGuards(AdminGuard)
  public async onPromote(@Ctx() ctx: Context) {
    const message = ctx.message;
    if (!message || !('text' in message)) return;

    const parts = message.text.trim().split(/\s+/);
    const target = parts[1] ?? '';

    if (!target) {
      await ctx.reply('Использование: /promote <@username или id>');
      return;
    }

    const resolved = await this.resolveTarget(target);

    if (!resolved) {
      await ctx.reply(`Пользователь ${target} не найден.`);
      return;
    }

    await this.userService.setRole(Number(resolved.telegramId), Role.ADMIN);
    const label = resolved.username ? `@${resolved.username}` : target;

    await ctx.reply(`✅ Пользователь ${label} назначен администратором.`);

    this.logger.info(
      { adminId: ctx.from?.id, target },
      'User promoted to admin',
    );
  }

  @Command('demote')
  @UseGuards(AdminGuard)
  public async onDemote(@Ctx() ctx: Context) {
    const message = ctx.message;
    if (!message || !('text' in message)) return;

    const parts = message.text.trim().split(/\s+/);
    const target = parts[1] ?? '';

    if (!target) {
      await ctx.reply('Использование: /demote <@username или id>');
      return;
    }

    const resolved = await this.resolveTarget(target);

    if (!resolved) {
      await ctx.reply(`Пользователь ${target} не найден.`);
      return;
    }

    if (Number(resolved.telegramId) === this.adminId) {
      await ctx.reply('❌ Нельзя снять роль с основного администратора.');
      return;
    }

    await this.userService.setRole(Number(resolved.telegramId), Role.USER);
    const label = resolved.username ? `@${resolved.username}` : target;

    await ctx.reply(`✅ Роль администратора снята с пользователя ${label}.`);
    this.logger.info(
      { adminId: ctx.from?.id, target },
      'User demoted by admin',
    );
  }

  private async resolveTarget(target: string) {
    const asId = parseInt(target, 10);
    if (!isNaN(asId)) {
      return this.userService.findByTelegramId(asId);
    }
    const username = target.startsWith('@') ? target.slice(1) : target;
    return this.userService.findByUsername(username);
  }

  private async performRagQuery(
    ctx: Context,
    question: string,
    statusMsgId: number,
  ): Promise<void> {
    try {
      await this.editStatus(ctx, statusMsgId, STATUS.GENERATING);

      const { answer, sources } = await this.ragService.query(question);

      await this.deleteStatus(ctx, statusMsgId);

      await ctx.reply(await this.escapeMarkdown(answer), {
        parse_mode: 'MarkdownV2',
      });

      const images = sources
        .flatMap((s) => s.images)
        .slice(0, MAX_MEDIA_GROUP)
        .map((dataUri) => this.dataUriToBuffer(dataUri));

      if (images.length === 1) {
        await ctx.replyWithPhoto({ source: images[0] });
      } else if (images.length > 1) {
        const media: InputMediaPhoto[] = images.map((buf) => ({
          type: 'photo',
          media: { source: buf },
        }));

        await ctx.replyWithMediaGroup(media);
      }

      this.logger.info(
        { userId: ctx.from?.id, sourcesCount: sources.length },
        'Query answered',
      );
    } catch (err) {
      this.logger.error(
        { userId: ctx.from?.id, error: (err as Error).message },
        'Failed to process query',
      );

      await this.editStatus(ctx, statusMsgId, STATUS.ERROR_GENERAL);
    }
  }

  private startTypingInterval(ctx: Context): ReturnType<typeof setInterval> {
    void ctx.sendChatAction('typing');

    return setInterval(
      () => void ctx.sendChatAction('typing'),
      TYPING_REFRESH_MS,
    );
  }

  private async editStatus(
    ctx: Context,
    msgId: number,
    text: string,
  ): Promise<void> {
    if (!ctx.chat) return;

    await ctx.telegram
      .editMessageText(ctx.chat.id, msgId, undefined, text)
      .catch(() => {});
  }

  private async deleteStatus(ctx: Context, msgId: number): Promise<void> {
    if (!ctx.chat) return;

    await ctx.telegram.deleteMessage(ctx.chat.id, msgId).catch(() => {});
  }

  private dataUriToBuffer(dataUri: string): Buffer {
    return Buffer.from(dataUri.slice(dataUri.indexOf(',') + 1), 'base64');
  }

  private async escapeMarkdown(text: string): Promise<string> {
    return new Promise((res) => res(telegramify(text, 'escape')));
  }
}
