import pino, { type Logger } from 'pino';
import path from 'node:path';
import fs from 'node:fs';

let cached: Logger | null = null;

export function getLogger(logsDir?: string): Logger {
  if (cached) return cached;
  const targets: pino.TransportTargetOptions[] = [
    { target: 'pino-pretty', level: 'debug', options: { colorize: true } }
  ];
  if (logsDir) {
    fs.mkdirSync(logsDir, { recursive: true });
    targets.push({
      target: 'pino/file',
      level: 'info',
      options: { destination: path.join(logsDir, 'app.log'), mkdir: true }
    });
  }
  cached = pino({ level: process.env.LOG_LEVEL ?? 'info' }, pino.transport({ targets }));
  return cached;
}
