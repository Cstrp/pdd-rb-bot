import { Module } from '@nestjs/common';
import { GibddModule } from '@app/gibdd';
import { WebModule } from '@app/web';
import { RagService } from './rag.service';

@Module({
  imports: [GibddModule, WebModule],
  providers: [RagService],
  exports: [RagService],
})
export class RagModule {}
