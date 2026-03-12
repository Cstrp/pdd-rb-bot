import { ParserService, ScrapperService } from './services';
import { GibddService } from './gibdd.service';
import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';

@Module({
  imports: [HttpModule.register({ timeout: 15000 })],
  providers: [GibddService, ScrapperService, ParserService],
  exports: [GibddService, ScrapperService, ParserService],
})
export class GibddModule {}
