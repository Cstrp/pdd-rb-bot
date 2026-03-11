import { Injectable } from '@nestjs/common';
import * as cheerio from 'cheerio';
import type {
  PddChapter,
  PddContent,
  PddEntry,
  PddImage,
  PddRule,
  TocEntry,
} from '../types';

const RULE_PATTERN =
  /^(\d+(?:\.\d+)*(?:[\u2013\-]\d+(?:\.\d+)*)?)\.\s+([\s\S]+)/;

@Injectable()
export class ParserService {
  public parseToc(html: string, baseUrl: string): TocEntry[] {
    const $ = cheerio.load(html);
    const seen = new Set<string>();
    const entries: TocEntry[] = [];

    $('a[href*="pdd_txt/ch_"], a[href*="pdd_txt/p_"]').each((_, el) => {
      const href = $(el).attr('href');
      const title = $(el).text().trim();
      if (!href || !title) return;

      const url = this.resolveUrl(href, baseUrl);
      if (seen.has(url)) return;

      seen.add(url);
      entries.push({
        title,
        url,
        type: href.includes('/ch_') ? 'chapter' : 'appendix',
      });
    });

    return entries;
  }

  public parseChapter(html: string, meta: TocEntry): PddChapter {
    const $ = cheerio.load(html);
    const rules: PddRule[] = [];
    let title = '';
    let currentRule: PddRule | undefined;
    let currentEntry: PddRule | PddEntry | undefined;

    $('h2, p, img').each((_, el) => {
      const tagName = el.tagName.toLowerCase();

      if (tagName === 'h2') {
        const text = $(el).text().trim();
        if (text && !title) title = text;
        return;
      }

      if (tagName === 'img') {
        const src = $(el).attr('src');
        if (!src || !currentEntry) return;
        currentEntry.images.push({ url: this.resolveUrl(src, meta.url) });
        return;
      }

      const text = $(el).text().trim();
      if (!text || text.includes('<<')) return;

      const match = RULE_PATTERN.exec(text);
      if (match) {
        const result = this.resolveEntry(
          match[1],
          match[2].trim(),
          meta.type,
          rules,
          currentRule,
        );
        currentRule = result.currentRule;
        currentEntry = result.target;
      } else if (currentEntry) {
        currentEntry.commentary = currentEntry.commentary
          ? `${currentEntry.commentary}\n${text}`
          : text;
      }
    });

    return {
      type: meta.type,
      number: this.extractPageNumber(meta.url),
      title: title || meta.title,
      url: meta.url,
      rules,
    };
  }

  private resolveEntry(
    number: string,
    text: string,
    type: 'chapter' | 'appendix',
    rules: PddRule[],
    currentRule: PddRule | undefined,
  ): { target: PddRule | PddEntry; currentRule: PddRule } {
    if (type === 'appendix' || !this.isSubPoint(number)) {
      const existing = rules.find((r) => r.number === number);
      if (existing) {
        existing.text += `\n${text}`;
        return { target: existing, currentRule: existing };
      }
      const rule: PddRule = { number, text, images: [], points: [] };
      rules.push(rule);
      return { target: rule, currentRule: rule };
    }

    const parent = this.findParentRule(number, rules) ?? currentRule;
    if (parent) {
      const existingPoint = parent.points.find((p) => p.number === number);
      if (existingPoint) {
        existingPoint.text += `\n${text}`;
        return { target: existingPoint, currentRule: parent };
      }
      const point: PddEntry = { number, text, images: [] };
      parent.points.push(point);
      return { target: point, currentRule: parent };
    }

    const rule: PddRule = { number, text, images: [], points: [] };
    rules.push(rule);
    return { target: rule, currentRule: rule };
  }

  private isSubPoint(number: string): boolean {
    const base = number.split(/[\u2013\-]/)[0];
    return /\d+\.\d/.test(base);
  }

  private findParentRule(
    number: string,
    rules: PddRule[],
  ): PddRule | undefined {
    const base = number.split(/[\u2013\-]/)[0];
    const parentSegment = base.split('.')[0];
    return [...rules].reverse().find((r) => r.number === parentSegment);
  }

  private extractPageNumber(url: string): string {
    const match = /(?:ch_|p_)(\d+)\.htm/.exec(url);
    return match ? match[1] : '';
  }

  private resolveUrl(href: string, base: string): string {
    return new URL(href, base).href;
  }
}
