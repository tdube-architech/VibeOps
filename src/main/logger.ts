import pino, { type Logger } from 'pino';
import path from 'node:path';
import fs from 'node:fs';

let cached: Logger | null = null;

export function getLogger(logsDir?: string): Logger {
  if (cached) return cached;
  const level = process.env.LOG_LEVEL ?? 'info';

  if (logsDir) {
    fs.mkdirSync(logsDir, { recursive: true });
    const dest = pino.destination({
      dest: path.join(logsDir, 'app.log'),
      sync: false,
      mkdir: true
    });
    cached = pino({ level }, dest);
  } else {
    cached = pino({ level });
  }
  return cached;
}
