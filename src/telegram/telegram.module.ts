import { TelegramService } from './telegram.service';
import { TelegrafModule } from 'nestjs-telegraf';
import { ConfigService } from '@nestjs/config';
import { session } from 'telegraf/session';
import { Module } from '@nestjs/common';
import { RagModule } from '@app/rag';
import { OcrModule } from '@app/ocr';

@Module({
  imports: [
    TelegrafModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        token: configService.get<string>('TELEGRAM_BOT_TOKEN', ''),
        launchOptions: {
          dropPendingUpdates: true,
        },
        middlewares: [session()],
      }),
    }),
    RagModule,
    OcrModule,
  ],
  providers: [TelegramService],
})
export class TelegramModule {}
