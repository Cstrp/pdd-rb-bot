import { Ctx, InjectBot, On, Start, Update } from 'nestjs-telegraf';
import type { InputMediaPhoto } from 'telegraf/types';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Injectable, OnModuleInit } from '@nestjs/common';
import telegramify from 'telegramify-markdown';
import { Context, Telegraf } from 'telegraf';
import { RagService } from '@app/rag';
import { OcrService } from '@app/ocr';
import axios from 'axios';

const MAX_MEDIA_GROUP = 10;
const TYPING_REFRESH_MS = 4500;

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
  constructor(
    @InjectPinoLogger(TelegramService.name)
    private readonly logger: PinoLogger,
    @InjectBot() private readonly bot: Telegraf<Context>,
    private readonly ragService: RagService,
    private readonly ocrService: OcrService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  public async onModuleInit() {
    const commands = await this.bot.telegram.getMyCommands();

    if (!commands.length) {
      await this.bot.telegram.setMyCommands([
        { command: 'start', description: 'Начать диалог с ботом' },
        { command: 'help', description: 'Получить справку по использованию бота' },
      ]);
    }

    this.logger.info('Telegram bot initialized');
  }

  @Start()
  public async onStart(@Ctx() ctx: Context) {
    this.logger.debug(
      { userId: ctx.from?.id, username: ctx.from?.username },
      'Start command received',
    );

    await ctx.reply(
      'Привет! Я могу помочь тебе с вопросами по Правилам дорожного движения Республики Беларусь. Просто задай свой вопрос.',
    );
  }

  @On('text')
  public async onText(@Ctx() ctx: Context) {
    const message = ctx.message;
    if (!message || !('text' in message)) return;

    const question = message.text;

    this.logger.debug(
      { userId: ctx.from?.id, username: ctx.from?.username, questionLength: question.length },
      'Text message received',
    );

    this.eventEmitter.emit('telegram.query.received', { userId: ctx.from?.id, type: 'text' });

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

    const caption = 'caption' in message ? (message.caption ?? '') : '';
    const photo = message.photo.at(-1);
    if (!photo) return;

    this.logger.debug(
      { userId: ctx.from?.id, username: ctx.from?.username, fileId: photo.file_id },
      'Photo received',
    );

    this.eventEmitter.emit('telegram.query.received', { userId: ctx.from?.id, type: 'photo' });

    const statusMsg = await ctx.reply(STATUS.RECOGNIZING);
    const interval = this.startTypingInterval(ctx);

    try {
      const fileLink = await ctx.telegram.getFileLink(photo.file_id);
      const { data } = await axios.get<ArrayBuffer>(fileLink.href, { responseType: 'arraybuffer' });

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

  private async performRagQuery(
    ctx: Context,
    question: string,
    statusMsgId: number,
  ): Promise<void> {
    try {
      await this.editStatus(ctx, statusMsgId, STATUS.GENERATING);

      const { answer, sources } = await this.ragService.query(question);

      await this.deleteStatus(ctx, statusMsgId);

      await ctx.reply(await this.escapeMarkdown(answer), { parse_mode: 'MarkdownV2' });

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
    return setInterval(() => void ctx.sendChatAction('typing'), TYPING_REFRESH_MS);
  }

  private async editStatus(ctx: Context, msgId: number, text: string): Promise<void> {
    if (!ctx.chat) return;
    await ctx.telegram.editMessageText(ctx.chat.id, msgId, undefined, text).catch(() => {});
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
