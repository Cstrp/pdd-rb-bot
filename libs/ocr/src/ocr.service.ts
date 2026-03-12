import { StringOutputParser } from '@langchain/core/output_parsers';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { HumanMessage } from '@langchain/core/messages';
import { ConfigService } from '@nestjs/config';
import { ChatOpenAI } from '@langchain/openai';
import { Injectable } from '@nestjs/common';

const CHOICE_PATTERN = /[АаБбВвГг][.)]\s|^\s*[1-4][.)]\s/m;
const OCR_PROMPT =
  'Перепиши дословно весь текст на изображении, включая вопрос и все варианты ответов (А, Б, В, Г или 1–4). Не добавляй ничего от себя — только текст с изображения.';

@Injectable()
export class OcrService {
  constructor(
    @InjectPinoLogger(OcrService.name)
    private readonly logger: PinoLogger,
    private readonly configService: ConfigService,
  ) {}

  public async recognize(buffer: Buffer): Promise<string> {
    const start = Date.now();
    const base64 = buffer.toString('base64');

    const llm = new ChatOpenAI({
      apiKey: this.configService.get<string>('OPENAI_API_KEY'),
      model: 'gpt-4o-mini',
      temperature: 0,
    }).pipe(new StringOutputParser());

    const result = await llm.invoke([
      new HumanMessage({
        content: [
          { type: 'text', text: OCR_PROMPT },
          {
            type: 'image_url',
            image_url: { url: `data:image/jpeg;base64,${base64}` },
          },
        ],
      }),
    ]);

    const trimmed = result.trim();

    this.logger.debug(
      { ocrLength: trimmed.length, durationMs: Date.now() - start },
      'OCR recognition complete',
    );

    return trimmed;
  }

  public buildQuery(ocrText: string, caption: string): string {
    const parts = [caption.trim(), ocrText.trim()].filter(Boolean).join('\n');

    if (CHOICE_PATTERN.test(ocrText)) {
      return `Это вопрос экзамена по ПДД Республики Беларусь с вариантами ответов. На основе правил ПДД определи единственно верный вариант. Назови его букву (или номер) и коротко объясни почему.\n\n${parts}`;
    }

    return parts;
  }
}
