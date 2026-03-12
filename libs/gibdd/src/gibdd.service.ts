import { DatabaseService } from '../../../src/database/database.service';
import { GIBDD_EVENTS, SeedCompletedPayload } from './types';
import { ParserService, ScrapperService } from './services';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { Injectable, OnModuleInit } from '@nestjs/common';
import type { PddChapter, PddContent } from './types';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ChapterType } from '@prisma/client';

@Injectable()
export class GibddService implements OnModuleInit {
  private readonly baseUrl = 'https://gibdd.by/txt_pdd.html';

  constructor(
    @InjectPinoLogger(GibddService.name)
    private readonly logger: PinoLogger,
    private readonly databaseService: DatabaseService,
    private readonly scrapperService: ScrapperService,
    private readonly parserService: ParserService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  public async onModuleInit() {
    await this.seed();
  }

  public async seed(): Promise<void> {
    let indexHtml: string;

    try {
      indexHtml = await this.scrapperService.fetchPage(this.baseUrl);
    } catch (err) {
      this.logger.warn(
        { url: this.baseUrl, error: (err as Error).message },
        'Failed to fetch TOC, skipping seed',
      );

      this.eventEmitter.emit(GIBDD_EVENTS.SEED_COMPLETED, {
        chaptersAdded: 0,
        totalChapters: 0,
      } satisfies SeedCompletedPayload);
      return;
    }

    const tocEntries = this.parserService.parseToc(indexHtml, this.baseUrl);

    const existingUrls = new Set(
      (
        await this.databaseService.chapter.findMany({ select: { url: true } })
      ).map((c) => c.url),
    );
    const pending = tocEntries.filter((e) => !existingUrls.has(e.url));

    if (pending.length === 0) {
      this.logger.info(
        { totalChapters: existingUrls.size },
        'All chapters already seeded',
      );
      this.eventEmitter.emit(GIBDD_EVENTS.SEED_COMPLETED, {
        chaptersAdded: 0,
        totalChapters: existingUrls.size,
      } satisfies SeedCompletedPayload);
      return;
    }

    this.logger.info({ pendingCount: pending.length }, 'Seeding chapters');

    const chapters: PddChapter[] = [];

    for (const entry of pending) {
      try {
        const html = await this.scrapperService.fetchPage(entry.url);
        const chapter = this.parserService.parseChapter(html, entry);

        const totalPoints = chapter.rules.reduce(
          (sum, r) => sum + r.points.length,
          0,
        );

        this.logger.info(
          {
            type: entry.type,
            chapterNumber: chapter.number,
            rulesCount: chapter.rules.length,
            pointsCount: totalPoints,
          },
          'Chapter parsed',
        );

        chapters.push(chapter);
      } catch (err) {
        this.logger.warn(
          { url: entry.url, error: (err as Error).message },
          'Failed to parse chapter',
        );
      }
    }

    await this.saveContent({ chapters });

    const payload: SeedCompletedPayload = {
      chaptersAdded: chapters.length,
      totalChapters: existingUrls.size + chapters.length,
    };

    this.logger.info(
      { chaptersAdded: payload.chaptersAdded },
      'Seeding complete',
    );
    this.eventEmitter.emit(GIBDD_EVENTS.SEED_COMPLETED, payload);
  }

  private async saveContent(content: PddContent): Promise<void> {
    for (const ch of content.chapters) {
      const chapterType =
        ch.type === 'chapter' ? ChapterType.CHAPTER : ChapterType.APPENDIX;
      const chapter = await this.databaseService.chapter.upsert({
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
        const savedRule = await this.databaseService.rule.upsert({
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
          await this.databaseService.ruleImage.createMany({
            data: rule.images.map((img) => ({
              url: img.url,
              ruleId: savedRule.id,
            })),
          });
        }

        for (const point of rule.points) {
          const savedPoint = await this.databaseService.rule.upsert({
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
            await this.databaseService.ruleImage.createMany({
              data: point.images.map((img) => ({
                url: img.url,
                ruleId: savedPoint.id,
              })),
            });
          }
        }
      }

      this.logger.debug(
        `Chapter ${chapter.number} saved: ${ch.rules.length} rules`,
      );
    }

    this.logger.info(`${content.chapters.length} chapters saved to database`);
  }
}
