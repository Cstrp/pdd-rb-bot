import { ConfigModule } from '@nestjs/config';
import { OcrService } from './ocr.service';
import { Module } from '@nestjs/common';

@Module({
  imports: [ConfigModule],
  providers: [OcrService],
  exports: [OcrService],
})
export class OcrModule {}
