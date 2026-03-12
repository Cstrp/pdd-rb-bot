import { RagService } from './rag.service';
import { GibddModule } from '@app/gibdd';
import { Module } from '@nestjs/common';
import { WebModule } from '@app/web';

@Module({
  imports: [GibddModule, WebModule],
  providers: [RagService],
  exports: [RagService],
})
export class RagModule {}
