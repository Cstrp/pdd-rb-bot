import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ChatOpenAI, OpenAIEmbeddings } from '@langchain/openai';
import { PGVectorStore } from '@langchain/community/vectorstores/pgvector';
import { ChatPromptTemplate } from '@langchain/core/prompts';
import { StringOutputParser } from '@langchain/core/output_parsers';
import {
  RunnableSequence,
  RunnablePassthrough,
} from '@langchain/core/runnables';
import { Document } from '@langchain/core/documents';
import axios from 'axios';
import { DatabaseService } from '@app/gibdd';
import { WebService } from '@app/web';
import type { RagAnswer, RagSource } from './types';
import { ConfigService } from '@nestjs/config';

const SYSTEM_PROMPT = `Ты — эксперт по Правилам дорожного движения Республики Беларусь.

U тебя есть два источника:

=== База данных ПДД РБ (официальный текст) ===
{db_context}

=== Интернет-источники ===
{web_context}

Правила ответа:
- Основой для ответа всегда служит база данных ПДД РБ
- Если оба источника согласны — отвечай с высокой уверенностью
- Если интернет-источники противоречат базе — доверяй базе данных
- Цитируй пункты с их номерами (например, «пункт 2.61 ПДД»)
- Если вопрос касается запретов, требований или ограничений — перечисли ВСЕ без исключений
- Если в вопросе есть варианты ответов (А, Б, В, Г или 1–4) — назови букву или номер единственно верного варианта первым, затем коротко объясни почему
- Никогда не говори «не знаю» или «информации нет» — всегда давай полезный ответ
- Отвечай на русском языке`;

const BATCH_SIZE = 100;
const RETRIEVER_K = 8;
const IMAGE_SOURCES_LIMIT = 2;
const TABLE_NAME = 'rule_embeddings';

@Injectable()
export class RagService implements OnModuleInit {
  private readonly logger = new Logger(RagService.name);
  private vectorStore: PGVectorStore | null = null;

  constructor(
    private readonly databaseService: DatabaseService,
    private readonly configService: ConfigService,
    private readonly webService: WebService,
  ) {}

  public async onModuleInit(): Promise<void> {
    await this.indexRules();
  }

  public async indexRules(): Promise<void> {
    if (!process.env.OPENAI_API_KEY) {
      this.logger.warn('OPENAI_API_KEY is not set — skipping vector indexing');
      return;
    }

    const store = await this.getVectorStore();

    const indexed = await this.databaseService.$queryRawUnsafe<
      { rule_id: number }[]
    >(
      `SELECT DISTINCT (metadata->>'ruleId')::int AS rule_id FROM ${TABLE_NAME} WHERE metadata->>'ruleId' IS NOT NULL`,
    );
    const indexedIds = new Set(indexed.map((r) => r.rule_id));

    const rules = await this.databaseService.rule.findMany({
      select: { id: true, number: true, text: true, chapterId: true },
    });

    const pending = rules.filter((r) => !indexedIds.has(r.id));
    if (pending.length === 0) {
      this.logger.log(`All ${rules.length} rules are already indexed`);
      return;
    }

    this.logger.log(`Indexing ${pending.length} rules into vector store...`);

    for (let i = 0; i < pending.length; i += BATCH_SIZE) {
      const batch = pending.slice(i, i + BATCH_SIZE);
      const docs = batch.map(
        (r) =>
          new Document({
            pageContent: `${r.number}. ${r.text}`,
            metadata: {
              ruleId: r.id,
              number: r.number,
              chapterId: r.chapterId,
            },
          }),
      );
      await store.addDocuments(docs);
      this.logger.log(
        `Indexed ${Math.min(i + BATCH_SIZE, pending.length)}/${pending.length} rules`,
      );
    }

    this.logger.log('Vector indexing complete');
  }

  public async query(question: string): Promise<RagAnswer> {
    if (!this.configService.get<string>('OPENAI_API_KEY')) {
      throw new Error('OPENAI_API_KEY is not set');
    }

    const [docsWithScores, webContext] = await Promise.all([
      this.hybridSearch(question),
      this.webService.search(question),
    ]);

    const dbContext = docsWithScores
      .map(([doc]) => doc.pageContent)
      .join('\n\n');

    const prompt = ChatPromptTemplate.fromMessages([
      ['system', SYSTEM_PROMPT],
      ['human', '{question}'],
    ]);

    const chain = RunnableSequence.from([
      {
        db_context: new RunnablePassthrough().pipe(() => dbContext),
        web_context: new RunnablePassthrough().pipe(
          () => webContext || 'Нет данных из интернета',
        ),
        question: new RunnablePassthrough(),
      },
      prompt,
      this.buildLlm(),
      new StringOutputParser(),
    ]);

    const answer = await chain.invoke(question);

    const imageRuleIds = docsWithScores
      .filter(([, score]) => score === 0.05)
      .slice(0, IMAGE_SOURCES_LIMIT)
      .map(([doc]) => doc.metadata.ruleId as number)
      .filter(Boolean);

    const sources = await this.buildSources([...new Set(imageRuleIds)]);

    return { answer, sources };
  }

  private async hybridSearch(
    question: string,
  ): Promise<Array<[Document, number]>> {
    const store = await this.getVectorStore();
    const vectorDocs = await store.similaritySearchWithScore(
      question,
      RETRIEVER_K,
    );

    const keywords = this.extractKeywords(question);
    if (keywords.length === 0) {
      return vectorDocs;
    }

    const vectorIds = new Set(
      vectorDocs.map(([doc]) => doc.metadata.ruleId as number),
    );

    const keywordRules = await this.databaseService.rule.findMany({
      where: {
        OR: keywords.map((k) => ({
          text: { contains: k, mode: 'insensitive' as const },
        })),
        NOT: { id: { in: [...vectorIds] } },
      },
      select: { id: true, number: true, text: true, chapterId: true },
      take: 20,
    });

    const keywordDocs: Array<[Document, number]> = keywordRules.map((r) => [
      new Document({
        pageContent: `${r.number}. ${r.text}`,
        metadata: { ruleId: r.id, number: r.number, chapterId: r.chapterId },
      }),
      0.05,
    ]);

    return [...vectorDocs, ...keywordDocs];
  }

  private extractKeywords(text: string): string[] {
    const STOPWORDS = new Set([
      'что',
      'как',
      'где',
      'когда',
      'кто',
      'чем',
      'зачем',
      'почему',
      'можно',
      'нельзя',
      'должен',
      'должны',
      'надо',
      'нужно',
      'такое',
      'такой',
      'такие',
      'является',
      'называется',
      'запрещено',
      'разрешено',
      'допускается',
      'обязан',
      'это',
      'при',
      'для',
      'под',
      'над',
      'про',
      'без',
      'через',
      'полное',
      'описание',
      'расскажи',
      'объясни',
    ]);

    const words = text
      .toLowerCase()
      .replace(/[?!.,;:«»"'()]/g, '')
      .split(/\s+/)
      .filter((w) => w.length >= 4 && !STOPWORDS.has(w));

    // Add stemmed variants: strip common Russian inflection endings
    const stems = words.map((w) => this.stem(w));
    return [...new Set([...words, ...stems])].filter((w) => w.length >= 4);
  }

  private stem(word: string): string {
    const suffixes = [
      'ующего',
      'ующему',
      'ующими',
      'ующих',
      'ующим',
      'ующей',
      'ующее',
      'ующая',
      'ующий',
      'ующих',
      'ующие',
      'овавших',
      'овавшей',
      'ающего',
      'ающему',
      'ающими',
      'ающих',
      'ающим',
      'ающей',
      'ениями',
      'ениях',
      'ением',
      'ении',
      'ение',
      'остями',
      'остей',
      'остью',
      'ости',
      'ающий',
      'ающая',
      'ающие',
      'ского',
      'ской',
      'ским',
      'ских',
      'овых',
      'овой',
      'овому',
      'овым',
      'ами',
      'ях',
      'ях',
      'ом',
      'ой',
      'ем',
      'ей',
      'ах',
      'ов',
      'ев',
      'ью',
      'е',
      'и',
      'а',
      'у',
      'ю',
      'я',
    ];

    for (const suffix of suffixes) {
      if (word.endsWith(suffix) && word.length - suffix.length >= 4) {
        return word.slice(0, word.length - suffix.length);
      }
    }

    return word;
  }

  private async buildSources(ruleIds: number[]): Promise<RagSource[]> {
    const rules = await this.databaseService.rule.findMany({
      where: { id: { in: ruleIds } },
      select: {
        id: true,
        number: true,
        text: true,
        images: { select: { url: true } },
      },
    });

    return Promise.all(
      rules.map(async (rule) => ({
        number: rule.number,
        text: rule.text,
        images: await Promise.all(
          rule.images.map((img) => this.fetchAsBase64(img.url)),
        ),
      })),
    );
  }

  private async fetchAsBase64(url: string): Promise<string> {
    const response = await axios.get<ArrayBuffer>(url, {
      responseType: 'arraybuffer',
    });

    const buffer = Buffer.from(response.data);

    const contentType =
      (response.headers['content-type'] as string) ?? 'image/jpeg';

    return `data:${contentType};base64,${buffer.toString('base64')}`;
  }

  private async getVectorStore(): Promise<PGVectorStore> {
    if (!this.vectorStore) {
      this.vectorStore = await PGVectorStore.initialize(
        this.buildEmbeddings(),
        {
          postgresConnectionOptions: {
            connectionString: process.env.DATABASE_URL,
          },
          tableName: TABLE_NAME,
          columns: {
            idColumnName: 'id',
            vectorColumnName: 'embedding',
            contentColumnName: 'content',
            metadataColumnName: 'metadata',
          },
        },
      );
    }

    return this.vectorStore;
  }

  private buildEmbeddings(): OpenAIEmbeddings {
    return new OpenAIEmbeddings({
      apiKey: this.configService.get<string>('OPENAI_API_KEY'),
      model: 'text-embedding-3-small',
    });
  }

  private buildLlm(): ChatOpenAI {
    return new ChatOpenAI({
      apiKey: this.configService.get<string>('OPENAI_API_KEY'),
      model: 'gpt-4o-mini',
      temperature: 0,
    });
  }
}
