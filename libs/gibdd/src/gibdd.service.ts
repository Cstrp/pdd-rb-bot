import { ParserService, ScrapperService } from './services';
import { DatabaseService } from './database.service';
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import type { PddChapter } from './types';

@Injectable()
export class GibddService implements OnModuleInit {
  private readonly logger = new Logger(GibddService.name);
  private readonly baseUrl = 'https://gibdd.by/txt_pdd.html';

  constructor(
    private readonly databaseService: DatabaseService,
    private readonly scrapperService: ScrapperService,
    private readonly parserService: ParserService,
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
        `Failed to fetch TOC from ${this.baseUrl}: ${(err as Error).message}. Skipping seeding.`,
      );

      return;
    }

    const tocEntries = this.parserService.parseToc(indexHtml, this.baseUrl);

    this.logger.verbose(`Found ${tocEntries.length} TOC entries`);

    const existingUrls = new Set(
      (
        await this.databaseService.chapter.findMany({ select: { url: true } })
      ).map((c) => c.url),
    );
    const pending = tocEntries.filter((e) => !existingUrls.has(e.url));

    if (pending.length === 0) {
      this.logger.verbose(`All ${existingUrls.size} chapters already seeded`);

      return;
    }

    this.logger.verbose(`Seeding ${pending.length} remaining chapters`);

    const chapters: PddChapter[] = [];

    for (const entry of pending) {
      try {
        const html = await this.scrapperService.fetchPage(entry.url);
        const chapter = this.parserService.parseChapter(html, entry);

        const totalPoints = chapter.rules.reduce(
          (sum, r) => sum + r.points.length,
          0,
        );

        this.logger.log(
          `Parsed ${entry.type} ${chapter.number}: ${chapter.rules.length} rules, ${totalPoints} sub-points`,
        );

        chapters.push(chapter);
      } catch (err) {
        this.logger.warn(
          `Failed to parse ${entry.url}: ${(err as Error).message}`,
        );
      }
    }

    await this.databaseService.saveContent({ chapters });

    this.logger.log(
      `Seeding complete: ${chapters.length} chapters saved to database`,
    );
  }
}
