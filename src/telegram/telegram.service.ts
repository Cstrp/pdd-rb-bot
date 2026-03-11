import { Ctx, InjectBot, On, Start, Update } from 'nestjs-telegraf';
import type { InputMediaPhoto } from 'telegraf/types';
import { Injectable, Logger } from '@nestjs/common';
import telegramify from 'telegramify-markdown';
import { Context, Telegraf } from 'telegraf';
import { RagService } from '@app/rag';
import { OcrService } from '@app/ocr';
import axios from 'axios';

const MAX_MEDIA_GROUP = 10;

@Update()
@Injectable()
export class TelegramService {
  private readonly logger: Logger = new Logger(TelegramService.name);

  constructor(
    @InjectBot() private readonly bot: Telegraf<Context>,
    private readonly ragService: RagService,
    private readonly ocrService: OcrService,
  ) {}

  public async onModuleInit() {
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

    this.logger.log('Telegram bot initialized');
  }

  @Start()
  public async onStart(@Ctx() ctx: Context) {
    this.logger.debug(
      `Received /start command from ${ctx.from?.username ?? ctx.from?.id}`,
    );

    await ctx.reply(
      'Привет! Я могу помочь тебе с вопросами по Правилам дорожного движения Республики Беларусь. Просто задай свой вопрос.',
    );
  }

  @On('text')
  public async onText(@Ctx() ctx: Context) {
    const message = ctx.message;

    if (!message || !('text' in message)) {
      return;
    }

    const question = message.text;

    this.logger.debug(
      `Received question from ${ctx.from?.username ?? ctx.from?.id}: ${question}`,
    );

    try {
      await ctx.sendChatAction('typing');
      const { answer, sources } = await this.ragService.query(question);

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
    } catch (err) {
      this.logger.error(
        `Failed to process question from ${ctx.from?.username ?? ctx.from?.id}: ${(err as Error).message}`,
      );

      await ctx.reply(
        'Произошла ошибка при обработке запроса. Попробуй ещё раз.',
      );
    }
  }

  @On('photo')
  public async onPhoto(@Ctx() ctx: Context) {
    const message = ctx.message;

    if (!message || !('photo' in message)) {
      return;
    }

    const caption = 'caption' in message ? (message.caption ?? '') : '';
    const photo = message.photo.at(-1);

    if (!photo) {
      return;
    }

    this.logger.debug(
      `Received photo from ${ctx.from?.username ?? ctx.from?.id}: file_id=${photo.file_id}`,
    );

    try {
      await ctx.sendChatAction('typing');

      const fileLink = await ctx.telegram.getFileLink(photo.file_id);

      const response = await axios.get<ArrayBuffer>(fileLink.href, {
        responseType: 'arraybuffer',
      });

      const buffer = Buffer.from(response.data);

      const ocrText = await this.ocrService.recognize(buffer);

      this.logger.debug(`OCR result: ${ocrText.slice(0, 200)}`);

      const question = this.ocrService.buildQuery(ocrText, caption);

      if (!question.trim()) {
        await ctx.reply('Не удалось распознать текст на изображении.');
        return;
      }

      const { answer, sources } = await this.ragService.query(question);

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
    } catch (err) {
      this.logger.error(
        `Failed to process photo from ${ctx.from?.username ?? ctx.from?.id}: ${(err as Error).message}`,
      );

      await ctx.reply(
        'Произошла ошибка при обработке изображения. Попробуй ещё раз.',
      );
    }
  }

  private dataUriToBuffer(dataUri: string): Buffer {
    const base64 = dataUri.slice(dataUri.indexOf(',') + 1);

    return Buffer.from(base64, 'base64');
  }

  private async escapeMarkdown(text: string): Promise<string> {
    return new Promise((res) => res(telegramify(text, 'escape')));
  }
}
