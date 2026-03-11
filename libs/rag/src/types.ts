export interface RagSource {
  number: string;
  text: string;
  images: string[];
}

export interface RagAnswer {
  answer: string;
  sources: RagSource[];
}
