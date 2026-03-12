export type ChapterType = 'chapter' | 'appendix';

export const GIBDD_EVENTS = {
  SEED_COMPLETED: 'gibdd.seed.completed',
} as const;

export interface SeedCompletedPayload {
  chaptersAdded: number;
  totalChapters: number;
}

export interface PddImage {
  url: string;
}

export interface PddEntry {
  number: string;
  text: string;
  images: PddImage[];
  commentary?: string;
}

export interface PddRule extends PddEntry {
  points: PddEntry[];
}

export interface PddChapter {
  type: ChapterType;
  number: string;
  title: string;
  url: string;
  rules: PddRule[];
}

export interface PddContent {
  chapters: PddChapter[];
}

export interface TocEntry {
  title: string;
  url: string;
  type: ChapterType;
}
