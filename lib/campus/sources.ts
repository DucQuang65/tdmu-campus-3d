export interface Source {
  id: string;
  name: string;
  url: string;
  publishedAt?: string | null;
  capturedAt?: string | null;
  retrievedAt?: string | null;
  note?: string;
}

/** One source registry serves data validation and the visible reference list. */
export function sourceIndex(sources: Source[]): Record<string, Source> {
  return Object.fromEntries(sources.map((source) => [source.id, source]));
}

export function sourceDates(source: Source) {
  return [
    source.publishedAt ? `Phát hành: ${source.publishedAt}` : 'Ngày phát hành chưa rõ',
    source.capturedAt ? `Thu thập: ${source.capturedAt}` : 'Ngày thu thập chưa rõ',
    source.retrievedAt ? `Truy xuất: ${source.retrievedAt}` : '',
  ]
    .filter(Boolean)
    .join(' · ');
}
