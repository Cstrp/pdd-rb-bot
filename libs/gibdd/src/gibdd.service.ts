import { GIBDD_EVENTS, SeedCompletedPayload } from './types';
import { ParserService, ScrapperService } from './services';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { Injectable, OnModuleInit } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { DatabaseService } from './database.service';
import type { PddChapter } from './types';

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

    await this.databaseService.saveContent({ chapters });

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
}
