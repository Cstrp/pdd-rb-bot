import { TavilySearchAPIRetriever } from '@langchain/community/retrievers/tavily_search_api';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { ConfigService } from '@nestjs/config';
import { Injectable } from '@nestjs/common';

const SEARCH_PREFIX = 'ПДД Республики Беларусь ';
const RESULTS_COUNT = 5;

@Injectable()
export class WebService {
  constructor(
    @InjectPinoLogger(WebService.name)
    private readonly logger: PinoLogger,
    private readonly configService: ConfigService,
  ) {}

  public async search(question: string): Promise<string> {
    const apiKey = this.configService.get<string>('TAVILY_API_KEY');

    if (!apiKey) {
      return '';
    }

    try {
      const retriever = new TavilySearchAPIRetriever({
        apiKey,
        k: RESULTS_COUNT,
      });

      const docs = await retriever.invoke(`${SEARCH_PREFIX}${question}`);
      const result = docs.map((d) => d.pageContent).join('\n\n');

      this.logger.debug(
        { query: question, resultsCount: docs.length },
        'Web search complete',
      );

      return result;
    } catch (err) {
      this.logger.warn(
        { query: question, error: (err as Error).message },
        'Web search failed',
      );
      return '';
    }
  }
}
