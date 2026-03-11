import { TelegramModule } from './telegram/telegram.module';
import { ConfigModule } from '@nestjs/config';
import { AppService } from './app.service';
import { GibddModule } from '@app/gibdd';
import { Module } from '@nestjs/common';
import { RagModule } from '@app/rag';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TelegramModule,
    GibddModule,
    RagModule,
  ],
  providers: [AppService],
})
export class AppModule {}
