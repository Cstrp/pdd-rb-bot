import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { Injectable } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';

@Injectable()
export class ScrapperService {
  constructor(
    @InjectPinoLogger(ScrapperService.name)
    private readonly logger: PinoLogger,
    private readonly httpService: HttpService,
  ) {}

  public async fetchPage(url: string): Promise<string> {
    this.logger.debug({ url }, 'Fetching page');

    const { data } = await this.httpService.axiosRef.get<ArrayBuffer>(url, {
      responseType: 'arraybuffer',
    });

    const buf = Buffer.from(data);
    const encoding = this.detectEncoding(buf);
    const html = new TextDecoder(encoding).decode(buf);

    this.logger.debug(
      { url, encoding, charCount: html.length },
      'Page fetched',
    );

    return html;
  }

  private detectEncoding(buf: Buffer): string {
    if (buf[0] === 0xff && buf[1] === 0xfe) return 'utf-16le';
    if (buf[0] === 0xfe && buf[1] === 0xff) return 'utf-16be';

    return 'utf-8';
  }
}
