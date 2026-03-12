import { TelegramModule } from './telegram/telegram.module';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ConfigModule } from '@nestjs/config';
import { LoggerModule } from 'nestjs-pino';
import { GibddModule } from '@app/gibdd';
import { Module } from '@nestjs/common';
import { RagModule } from '@app/rag';

@Module({
  imports: [
    EventEmitterModule.forRoot({ global: true, verboseMemoryLeak: true }),
    ConfigModule.forRoot({ isGlobal: true, cache: true }),
    LoggerModule.forRoot({
      pinoHttp: {
        level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
        transport: {
          target: 'pino-pretty',
          options: {
            colorize: true,
            singleLine: true,
            ignore: 'pid,hostname',
            translateTime: 'SYS:yyyy-mm-dd HH:MM:ss',
            messageFormat: '{msg} {args}',
          },
        },
      },
    }),
    TelegramModule,
    GibddModule,
    RagModule,
  ],
})
export class AppModule {}
