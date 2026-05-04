# Deployment

Build a Windows installer:

```bash
pnpm install
pnpm build
pnpm package
```

Output: `release/VibeOps Setup <version>.exe`.

App data lives in `%APPDATA%\VibeOps\`:

- `vibeops.db` — SQLite database
- `settings.json` — app settings
- `secrets.json` — encrypted API keys (Electron safeStorage)
- `logs/app.log` — pino log file
- `backups/` — DB exports (when used)
