import { ConfigModule } from '@nestjs/config';
import { WebService } from './web.service';
import { Module } from '@nestjs/common';

@Module({
  imports: [ConfigModule],
  providers: [WebService],
  exports: [WebService],
})
export class WebModule {}
