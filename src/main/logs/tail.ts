import fs from 'node:fs';
import path from 'node:path';

export function tailLogFile(logsDir: string, filename = 'app.log', maxLines = 200): string[] {
  const file = path.join(logsDir, filename);
  if (!fs.existsSync(file)) return [];
  const text = fs.readFileSync(file, 'utf8');
  const lines = text.split(/\r?\n/).filter((l) => l.length > 0);
  return lines.slice(Math.max(0, lines.length - maxLines));
}
