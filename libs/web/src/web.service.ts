import { TavilySearchAPIRetriever } from '@langchain/community/retrievers/tavily_search_api';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

const SEARCH_PREFIX = 'ПДД Республики Беларусь ';
const RESULTS_COUNT = 5;

@Injectable()
export class WebService {
  private readonly logger = new Logger(WebService.name);

  constructor(private readonly configService: ConfigService) {}

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

      return docs.map((d) => d.pageContent).join('\n\n');
    } catch (err) {
      this.logger.warn(`Web search failed: ${(err as Error).message}`);
      return '';
    }
  }
}
