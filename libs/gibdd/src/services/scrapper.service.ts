import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';

@Injectable()
export class ScrapperService {
  private readonly logger: Logger = new Logger(ScrapperService.name);

  constructor(private readonly httpService: HttpService) {}

  public async fetchPage(url: string): Promise<string> {
    this.logger.verbose(`Fetching page from ${url}`);

    const { data } = await this.httpService.axiosRef.get<ArrayBuffer>(url, {
      responseType: 'arraybuffer',
    });

    const html = this.decodeHtml(Buffer.from(data));

    this.logger.verbose(`Received ${html.length} chars from ${url}`);

    return html;
  }

  private decodeHtml(buf: Buffer): string {
    if (buf[0] === 0xff && buf[1] === 0xfe) {
      return new TextDecoder('utf-16le').decode(buf);
    }

    if (buf[0] === 0xfe && buf[1] === 0xff) {
      return new TextDecoder('utf-16be').decode(buf);
    }

    return new TextDecoder('utf-8').decode(buf);
  }
}
