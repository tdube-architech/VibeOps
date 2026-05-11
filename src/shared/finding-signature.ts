export function findingSignature(f: {
  category: string;
  title: string;
  filePath: string | null;
  lineStart: number | null;
}): string {
  return [f.category, f.filePath ?? '-', f.lineStart ?? 0, f.title].join('|');
}
