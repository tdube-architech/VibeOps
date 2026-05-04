# Architecture

VibeOps runs as an Electron desktop app split into three trust zones:

- **Main process** — owns lifecycle, filesystem access, SQLite, AI calls, and shell access (currently disabled).
- **Preload bridge** — exposes a typed `window.vibeops` API via `contextBridge`. No raw `ipcRenderer`.
- **Renderer** — React 19 + Tailwind + shadcn/ui. No Node, no FS, no shell.

See `vibeops_windows_native_app_prd.md` for full spec. Key folders:

- `src/main/projects` — project registry
- `src/main/scanner`  — read-only project walker + detectors
- `src/main/memory`   — memory.md generator + merger
- `src/main/ai`       — provider registry + secret redactor
- `src/main/audit`    — audit pipeline (static + AI)
- `src/main/backup`   — DB export/import
- `src/main/update`   — electron-updater wrapper
- `src/renderer`      — UI
