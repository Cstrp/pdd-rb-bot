import { TelegrafModule } from 'nestjs-telegraf';
import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TelegramService } from './telegram.service';
import { RagModule } from '@app/rag';
import { OcrModule } from '@app/ocr';

@Module({
  imports: [
    TelegrafModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        token: configService.get<string>('TELEGRAM_BOT_TOKEN', ''),
      }),
    }),
    RagModule,
    OcrModule,
  ],
  providers: [TelegramService],
})
export class TelegramModule {}
