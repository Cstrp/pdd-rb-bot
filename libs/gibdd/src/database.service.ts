import { ChapterType, PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import type { PddContent } from './types';
import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';

@Injectable()
export class DatabaseService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(DatabaseService.name);

  constructor() {
    super({
      adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
    });
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }

  public async saveContent(content: PddContent): Promise<void> {
    for (const ch of content.chapters) {
      const chapterType =
        ch.type === 'chapter' ? ChapterType.CHAPTER : ChapterType.APPENDIX;
      const chapter = await this.chapter.upsert({
        where: { url: ch.url },
        update: { title: ch.title, number: ch.number, type: chapterType },
        create: {
          url: ch.url,
          title: ch.title,
          number: ch.number,
          type: chapterType,
        },
      });

      for (const rule of ch.rules) {
        const savedRule = await this.rule.upsert({
          where: {
            chapterId_number: { chapterId: chapter.id, number: rule.number },
          },
          update: { text: rule.text, commentary: rule.commentary },
          create: {
            number: rule.number,
            text: rule.text,
            commentary: rule.commentary,
            chapterId: chapter.id,
          },
        });

        if (rule.images.length > 0) {
          await this.ruleImage.createMany({
            data: rule.images.map((img) => ({
              url: img.url,
              ruleId: savedRule.id,
            })),
          });
        }

        for (const point of rule.points) {
          const savedPoint = await this.rule.upsert({
            where: {
              chapterId_number: { chapterId: chapter.id, number: point.number },
            },
            update: { text: point.text, commentary: point.commentary },
            create: {
              number: point.number,
              text: point.text,
              commentary: point.commentary,
              chapterId: chapter.id,
              parentId: savedRule.id,
            },
          });

          if (point.images.length > 0) {
            await this.ruleImage.createMany({
              data: point.images.map((img) => ({
                url: img.url,
                ruleId: savedPoint.id,
              })),
            });
          }
        }
      }

      this.logger.debug(
        `Saved chapter ${chapter.number}: ${ch.rules.length} top-level rules`,
      );
    }

    this.logger.log(`Saved ${content.chapters.length} chapters to database`);
  }
}
