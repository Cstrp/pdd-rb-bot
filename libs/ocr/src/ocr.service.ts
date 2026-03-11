import { StringOutputParser } from '@langchain/core/output_parsers';
import { HumanMessage } from '@langchain/core/messages';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ChatOpenAI } from '@langchain/openai';

const CHOICE_PATTERN = /[АаБбВвГг][.)]\s|^\s*[1-4][.)]\s/m;
const OCR_PROMPT =
  'Перепиши дословно весь текст на изображении, включая вопрос и все варианты ответов (А, Б, В, Г или 1–4). Не добавляй ничего от себя — только текст с изображения.';

@Injectable()
export class OcrService {
  private readonly logger = new Logger(OcrService.name);

  constructor(private readonly configService: ConfigService) {}

  public async recognize(buffer: Buffer): Promise<string> {
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

    this.logger.debug(`OCR result: ${result.slice(0, 150)}`);

    return result.trim();
  }

  public buildQuery(ocrText: string, caption: string): string {
    const parts = [caption.trim(), ocrText.trim()].filter(Boolean).join('\n');

    if (CHOICE_PATTERN.test(ocrText)) {
      return `Это вопрос экзамена по ПДД Республики Беларусь с вариантами ответов. На основе правил ПДД определи единственно верный вариант. Назови его букву (или номер) и коротко объясни почему.\n\n${parts}`;
    }

    return parts;
  }
}
