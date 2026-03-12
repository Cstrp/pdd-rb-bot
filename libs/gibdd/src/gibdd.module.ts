import { ParserService, ScrapperService } from './services';
import { DatabaseService } from './database.service';
import { GibddService } from './gibdd.service';
import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';

@Module({
  imports: [HttpModule.register({ timeout: 15000 })],
  providers: [GibddService, ScrapperService, ParserService, DatabaseService],
  exports: [GibddService, DatabaseService],
})
export class GibddModule {}
