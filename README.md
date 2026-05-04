# VibeOps

Local-first Windows desktop project intelligence app.

## What it does
- Registers local project folders.
- Scans them read-only.
- Detects stack, frameworks, package manager, database, auth, deployment.
- Generates and maintains a `memory.md` for each project.
- Runs read-only audits with severity-graded findings and a recommended Claude/Codex prompt.

## Dev

```bash
pnpm install
pnpm dev
```

## Build a Windows installer

```bash
pnpm package
```

## Docs
- [Architecture](docs/architecture.md)
- [Deployment](docs/deployment.md)
- [Audit history](docs/audit-history.md)
- [Roadmap](docs/roadmap.md)
- Spec: [vibeops_windows_native_app_prd.md](vibeops_windows_native_app_prd.md)
