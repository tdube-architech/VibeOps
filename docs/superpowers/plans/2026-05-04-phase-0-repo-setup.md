# VibeOps Phase 0: Repo Setup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up Electron + React + TypeScript + Tailwind + shadcn/ui + SQLite/Drizzle scaffold with secure preload bridge, sidebar shell, dashboard route, and initialized local DB.

**Architecture:** Electron main process owns window lifecycle and IPC. Renderer is a Vite-built React SPA with no Node access. Preload exposes a typed `vibeops` API. SQLite + Drizzle live in main process, accessed via IPC. Tailwind v3 + shadcn/ui (manual install — no CLI scaffold). Repo initialized as git on first commit.

**Tech Stack:** Electron 33, electron-vite, React 18, TypeScript 5, Tailwind CSS 3, shadcn/ui, lucide-react, SQLite via `better-sqlite3`, Drizzle ORM, Vitest, electron-builder.

**Reference docs:** PRD §7-§9, §22, §23, §29.0.

---

## File Structure

```
E:\Projects\VibeOps\
├── .gitignore
├── .editorconfig
├── package.json
├── tsconfig.json
├── tsconfig.node.json
├── tsconfig.web.json
├── electron.vite.config.ts
├── tailwind.config.cjs
├── postcss.config.cjs
├── components.json                          # shadcn config
├── drizzle.config.ts
├── vitest.config.ts
├── index.html                                # renderer entry
├── electron-builder.yml
├── src/
│   ├── main/
│   │   ├── index.ts                         # main process bootstrap
│   │   ├── window.ts                        # BrowserWindow factory
│   │   ├── ipc/
│   │   │   ├── index.ts                     # IPC handler registration
│   │   │   └── handlers.ts                  # placeholder handlers
│   │   ├── db/
│   │   │   ├── client.ts                    # Drizzle/better-sqlite3 client
│   │   │   ├── schema.ts                    # Drizzle schema
│   │   │   ├── migrate.ts                   # migration runner
│   │   │   └── paths.ts                     # %APPDATA%/VibeOps resolution
│   │   └── logger.ts                        # pino-based logger
│   ├── preload/
│   │   ├── index.ts                         # contextBridge exposure
│   │   └── api.ts                           # typed API surface
│   ├── shared/
│   │   ├── types.ts                         # shared types (Project, etc.)
│   │   └── ipc-channels.ts                  # IPC channel name constants
│   └── renderer/
│       ├── main.tsx                         # React entry
│       ├── App.tsx                          # router root
│       ├── index.css                        # Tailwind directives
│       ├── routes/
│       │   ├── DashboardRoute.tsx
│       │   ├── ProjectsRoute.tsx
│       │   ├── MemoryRoute.tsx
│       │   ├── AuditsRoute.tsx
│       │   ├── TasksRoute.tsx
│       │   ├── ChatRoute.tsx
│       │   └── SettingsRoute.tsx
│       ├── components/
│       │   ├── layout/
│       │   │   ├── AppShell.tsx
│       │   │   ├── Sidebar.tsx
│       │   │   └── Topbar.tsx
│       │   └── ui/                          # shadcn components land here
│       │       ├── button.tsx
│       │       ├── card.tsx
│       │       └── badge.tsx
│       └── lib/
│           ├── utils.ts                     # cn() helper
│           └── api.ts                       # window.vibeops typed wrapper
├── drizzle/
│   └── 0000_initial.sql                     # generated migration
├── tests/
│   ├── main/
│   │   └── db.test.ts
│   └── shared/
│       └── ipc-channels.test.ts
└── docs/
    └── superpowers/
        └── plans/                            # this directory
```

---

## Task 1: Initialize Repo + Git

**Files:**
- Create: `E:\Projects\VibeOps\.gitignore`
- Create: `E:\Projects\VibeOps\.editorconfig`
- Create: `E:\Projects\VibeOps\README.md`

- [ ] **Step 1: Verify cwd and absence of git repo**

Run: `cd /e/Projects/VibeOps && git rev-parse --is-inside-work-tree 2>&1 || echo "no repo"`
Expected: `no repo`

- [ ] **Step 2: Init git**

Run: `cd /e/Projects/VibeOps && git init -b main`
Expected: `Initialized empty Git repository in E:/Projects/VibeOps/.git/`

- [ ] **Step 3: Write `.gitignore`**

```gitignore
# deps
node_modules/
.pnpm-store/

# build
dist/
out/
build/
release/
*.tsbuildinfo

# electron
.vite/
.electron-vite/

# env / local
.env
.env.local
.env.*.local

# editor
.vscode/*
!.vscode/extensions.json
.idea/
.DS_Store

# logs
*.log
logs/

# OS
Thumbs.db
desktop.ini

# DB / runtime
*.sqlite
*.sqlite-journal
*.db
*.db-journal

# test
coverage/
```

- [ ] **Step 4: Write `.editorconfig`**

```ini
root = true

[*]
end_of_line = lf
insert_final_newline = true
charset = utf-8
indent_style = space
indent_size = 2
trim_trailing_whitespace = true

[*.md]
trim_trailing_whitespace = false
```

- [ ] **Step 5: Write `README.md`**

```markdown
# VibeOps

Local-first Windows desktop project intelligence app. See `vibeops_windows_native_app_prd.md`.

## Dev

```bash
pnpm install
pnpm dev
```

## Build

```bash
pnpm build
pnpm package
```
```

- [ ] **Step 6: Commit**

```bash
git add .gitignore .editorconfig README.md vibeops_windows_native_app_prd.md
git commit -m "chore: init repo with PRD and base config"
```

---

## Task 2: Init pnpm + base package.json

**Files:**
- Create: `E:\Projects\VibeOps\package.json`
- Create: `E:\Projects\VibeOps\.npmrc`

- [ ] **Step 1: Confirm pnpm available**

Run: `pnpm --version`
Expected: version string (e.g. `9.x.x`). If missing, install via `npm i -g pnpm`.

- [ ] **Step 2: Write `.npmrc`**

```
shamefully-hoist=false
strict-peer-dependencies=false
```

- [ ] **Step 3: Write `package.json`**

```json
{
  "name": "vibeops",
  "version": "0.0.1",
  "private": true,
  "description": "Local-first Windows project intelligence app for AI-built software",
  "main": "out/main/index.js",
  "type": "module",
  "scripts": {
    "dev": "electron-vite dev",
    "build": "electron-vite build",
    "build:typecheck": "tsc -p tsconfig.web.json --noEmit && tsc -p tsconfig.node.json --noEmit",
    "package": "pnpm build && electron-builder --win",
    "test": "vitest run",
    "test:watch": "vitest",
    "lint": "eslint .",
    "format": "prettier --write .",
    "db:generate": "drizzle-kit generate",
    "db:migrate": "tsx src/main/db/migrate.ts",
    "postinstall": "electron-builder install-app-deps"
  },
  "engines": {
    "node": ">=20.18.0"
  }
}
```

- [ ] **Step 4: Add deps in two installs (runtime then dev)**

Run:
```bash
pnpm add electron-updater better-sqlite3 drizzle-orm pino react react-dom react-router-dom clsx tailwind-merge class-variance-authority lucide-react zustand @tanstack/react-query @tanstack/react-table
```
Run:
```bash
pnpm add -D electron electron-vite electron-builder vite typescript @types/node @types/react @types/react-dom @types/better-sqlite3 drizzle-kit @vitejs/plugin-react tailwindcss postcss autoprefixer tsx vitest @vitest/coverage-v8 eslint prettier @typescript-eslint/parser @typescript-eslint/eslint-plugin eslint-plugin-react-hooks eslint-plugin-react-refresh
```

Expected: pnpm completes, `node_modules/` and `pnpm-lock.yaml` exist.

- [ ] **Step 5: Verify electron-builder rebuild ran (better-sqlite3 native)**

Run: `node -e "require('better-sqlite3')(':memory:').close(); console.log('ok')"`

> **Note:** Renderer never imports `better-sqlite3`. This check runs in Node, not Electron — passes if node-gyp build succeeded. Real Electron ABI rebuild verified in Task 12.

Expected: `ok`. If error mentions `NODE_MODULE_VERSION`, run `pnpm rebuild better-sqlite3` then retry.

- [ ] **Step 6: Commit**

```bash
git add package.json pnpm-lock.yaml .npmrc
git commit -m "chore: add pnpm package manifest and dependencies"
```

---

## Task 3: TypeScript configs (3-config split)

**Files:**
- Create: `E:\Projects\VibeOps\tsconfig.json`
- Create: `E:\Projects\VibeOps\tsconfig.node.json`
- Create: `E:\Projects\VibeOps\tsconfig.web.json`

- [ ] **Step 1: Write root `tsconfig.json`**

```json
{
  "files": [],
  "references": [
    { "path": "./tsconfig.node.json" },
    { "path": "./tsconfig.web.json" }
  ]
}
```

- [ ] **Step 2: Write `tsconfig.node.json` (main + preload + drizzle scripts)**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["ES2022"],
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "verbatimModuleSyntax": true,
    "composite": true,
    "outDir": "out/main",
    "baseUrl": ".",
    "paths": {
      "@shared/*": ["src/shared/*"],
      "@main/*": ["src/main/*"]
    }
  },
  "include": [
    "src/main/**/*.ts",
    "src/preload/**/*.ts",
    "src/shared/**/*.ts",
    "drizzle.config.ts",
    "electron.vite.config.ts",
    "vitest.config.ts"
  ]
}
```

- [ ] **Step 3: Write `tsconfig.web.json` (renderer)**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "jsx": "react-jsx",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "verbatimModuleSyntax": true,
    "composite": true,
    "outDir": "out/renderer",
    "baseUrl": ".",
    "paths": {
      "@shared/*": ["src/shared/*"],
      "@/*": ["src/renderer/*"]
    }
  },
  "include": ["src/renderer/**/*.ts", "src/renderer/**/*.tsx", "src/shared/**/*.ts"]
}
```

- [ ] **Step 4: Run typecheck**

Run: `pnpm build:typecheck`
Expected: exit 0, no errors (no source files yet so trivially passes — confirms tsconfigs parse).

- [ ] **Step 5: Commit**

```bash
git add tsconfig.json tsconfig.node.json tsconfig.web.json
git commit -m "chore: add split TypeScript configs for main, preload, renderer"
```

---

## Task 4: electron-vite config

**Files:**
- Create: `E:\Projects\VibeOps\electron.vite.config.ts`
- Create: `E:\Projects\VibeOps\index.html`

- [ ] **Step 1: Write `electron.vite.config.ts`**

```ts
import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: {
        '@shared': resolve(__dirname, 'src/shared'),
        '@main': resolve(__dirname, 'src/main')
      }
    },
    build: {
      outDir: 'out/main',
      rollupOptions: {
        input: { index: resolve(__dirname, 'src/main/index.ts') }
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: { '@shared': resolve(__dirname, 'src/shared') }
    },
    build: {
      outDir: 'out/preload',
      rollupOptions: {
        input: { index: resolve(__dirname, 'src/preload/index.ts') }
      }
    }
  },
  renderer: {
    root: '.',
    plugins: [react()],
    resolve: {
      alias: {
        '@shared': resolve(__dirname, 'src/shared'),
        '@': resolve(__dirname, 'src/renderer')
      }
    },
    build: {
      outDir: 'out/renderer',
      rollupOptions: {
        input: { index: resolve(__dirname, 'index.html') }
      }
    },
    server: { port: 5173 }
  }
});
```

- [ ] **Step 2: Write `index.html`**

```html
<!doctype html>
<html lang="en" class="dark">
  <head>
    <meta charset="UTF-8" />
    <meta http-equiv="Content-Security-Policy"
          content="default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self' ws://localhost:5173 http://localhost:5173" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>VibeOps</title>
  </head>
  <body class="bg-zinc-950 text-zinc-100 antialiased">
    <div id="root"></div>
    <script type="module" src="/src/renderer/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 3: Commit**

```bash
git add electron.vite.config.ts index.html
git commit -m "chore: configure electron-vite with split build targets"
```

---

## Task 5: Tailwind + shadcn/ui base

**Files:**
- Create: `E:\Projects\VibeOps\tailwind.config.cjs`
- Create: `E:\Projects\VibeOps\postcss.config.cjs`
- Create: `E:\Projects\VibeOps\components.json`
- Create: `E:\Projects\VibeOps\src\renderer\index.css`
- Create: `E:\Projects\VibeOps\src\renderer\lib\utils.ts`

- [ ] **Step 1: Write `tailwind.config.cjs`**

```js
/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: ['class'],
  content: ['./index.html', './src/renderer/**/*.{ts,tsx}'],
  theme: {
    container: { center: true, padding: '1rem', screens: { '2xl': '1400px' } },
    extend: {
      colors: {
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))'
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))'
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))'
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))'
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))'
        },
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))'
        }
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)'
      }
    }
  },
  plugins: []
};
```

- [ ] **Step 2: Write `postcss.config.cjs`**

```js
module.exports = {
  plugins: {
    tailwindcss: {},
    autoprefixer: {}
  }
};
```

- [ ] **Step 3: Write `components.json` (shadcn config)**

```json
{
  "$schema": "https://ui.shadcn.com/schema.json",
  "style": "new-york",
  "rsc": false,
  "tsx": true,
  "tailwind": {
    "config": "tailwind.config.cjs",
    "css": "src/renderer/index.css",
    "baseColor": "zinc",
    "cssVariables": true,
    "prefix": ""
  },
  "aliases": {
    "components": "@/components",
    "utils": "@/lib/utils",
    "ui": "@/components/ui",
    "lib": "@/lib",
    "hooks": "@/hooks"
  }
}
```

- [ ] **Step 4: Write `src/renderer/index.css`**

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  :root {
    --background: 240 10% 4%;
    --foreground: 0 0% 98%;
    --card: 240 8% 8%;
    --card-foreground: 0 0% 98%;
    --primary: 263 70% 60%;
    --primary-foreground: 0 0% 100%;
    --secondary: 240 5% 14%;
    --secondary-foreground: 0 0% 98%;
    --muted: 240 5% 14%;
    --muted-foreground: 240 5% 65%;
    --accent: 263 60% 30%;
    --accent-foreground: 0 0% 98%;
    --destructive: 0 70% 50%;
    --destructive-foreground: 0 0% 98%;
    --border: 240 5% 18%;
    --input: 240 5% 18%;
    --ring: 263 70% 60%;
    --radius: 0.625rem;
  }

  * { @apply border-border; }
  body { @apply bg-background text-foreground; }
}
```

- [ ] **Step 5: Write `src/renderer/lib/utils.ts`**

```ts
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
```

- [ ] **Step 6: Commit**

```bash
git add tailwind.config.cjs postcss.config.cjs components.json src/renderer/index.css src/renderer/lib/utils.ts
git commit -m "feat(ui): tailwind + shadcn config with dark theme tokens"
```

---

## Task 6: shadcn UI primitives (button, card, badge)

**Files:**
- Create: `E:\Projects\VibeOps\src\renderer\components\ui\button.tsx`
- Create: `E:\Projects\VibeOps\src\renderer\components\ui\card.tsx`
- Create: `E:\Projects\VibeOps\src\renderer\components\ui\badge.tsx`

> **Note:** shadcn CLI requires network + react setup. Manual install of three primitives is faster and matches `components.json` style.

- [ ] **Step 1: Write `button.tsx`**

```tsx
import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground shadow hover:bg-primary/90',
        destructive: 'bg-destructive text-destructive-foreground shadow-sm hover:bg-destructive/90',
        outline: 'border border-input bg-transparent shadow-sm hover:bg-accent hover:text-accent-foreground',
        secondary: 'bg-secondary text-secondary-foreground shadow-sm hover:bg-secondary/80',
        ghost: 'hover:bg-accent hover:text-accent-foreground',
        link: 'text-primary underline-offset-4 hover:underline'
      },
      size: {
        default: 'h-9 px-4 py-2',
        sm: 'h-8 rounded-md px-3 text-xs',
        lg: 'h-10 rounded-md px-8',
        icon: 'h-9 w-9'
      }
    },
    defaultVariants: { variant: 'default', size: 'default' }
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';
    return <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />;
  }
);
Button.displayName = 'Button';

export { buttonVariants };
```

- [ ] **Step 2: Add `@radix-ui/react-slot` dep**

Run: `pnpm add @radix-ui/react-slot`
Expected: success.

- [ ] **Step 3: Write `card.tsx`**

```tsx
import * as React from 'react';
import { cn } from '@/lib/utils';

export const Card = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('rounded-xl border bg-card text-card-foreground shadow', className)} {...props} />
  )
);
Card.displayName = 'Card';

export const CardHeader = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('flex flex-col space-y-1.5 p-6', className)} {...props} />
  )
);
CardHeader.displayName = 'CardHeader';

export const CardTitle = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('font-semibold leading-none tracking-tight', className)} {...props} />
  )
);
CardTitle.displayName = 'CardTitle';

export const CardDescription = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('text-sm text-muted-foreground', className)} {...props} />
  )
);
CardDescription.displayName = 'CardDescription';

export const CardContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('p-6 pt-0', className)} {...props} />
  )
);
CardContent.displayName = 'CardContent';
```

- [ ] **Step 4: Write `badge.tsx`**

```tsx
import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-semibold transition-colors',
  {
    variants: {
      variant: {
        default: 'border-transparent bg-primary text-primary-foreground',
        secondary: 'border-transparent bg-secondary text-secondary-foreground',
        destructive: 'border-transparent bg-destructive text-destructive-foreground',
        success: 'border-transparent bg-emerald-600 text-white',
        warning: 'border-transparent bg-amber-600 text-white',
        outline: 'text-foreground'
      }
    },
    defaultVariants: { variant: 'default' }
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { badgeVariants };
```

- [ ] **Step 5: Commit**

```bash
git add src/renderer/components/ui pnpm-lock.yaml package.json
git commit -m "feat(ui): add Button, Card, Badge primitives"
```

---

## Task 7: Shared types + IPC channels constants

**Files:**
- Create: `E:\Projects\VibeOps\src\shared\types.ts`
- Create: `E:\Projects\VibeOps\src\shared\ipc-channels.ts`
- Create: `E:\Projects\VibeOps\tests\shared\ipc-channels.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/shared/ipc-channels.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { IpcChannels, IPC_CHANNEL_LIST } from '@shared/ipc-channels';

describe('IpcChannels', () => {
  it('exposes ping channel', () => {
    expect(IpcChannels.ping).toBe('app:ping');
  });

  it('exposes app version channel', () => {
    expect(IpcChannels.appVersion).toBe('app:version');
  });

  it('all channel values are unique', () => {
    const values = Object.values(IpcChannels);
    expect(new Set(values).size).toBe(values.length);
  });

  it('channel list matches values', () => {
    expect(IPC_CHANNEL_LIST.sort()).toEqual(Object.values(IpcChannels).sort());
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- tests/shared/ipc-channels.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `src/shared/ipc-channels.ts`**

```ts
export const IpcChannels = {
  ping: 'app:ping',
  appVersion: 'app:version'
} as const;

export type IpcChannel = (typeof IpcChannels)[keyof typeof IpcChannels];

export const IPC_CHANNEL_LIST: readonly IpcChannel[] = Object.values(IpcChannels);
```

- [ ] **Step 4: Write `src/shared/types.ts`**

```ts
export type ProjectStatus = 'active' | 'planning' | 'needs_cleanup' | 'critical' | 'archived';

export interface Project {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  localPath: string;
  repoUrl: string | null;
  category: string | null;
  status: ProjectStatus;
  primaryStack: string | null;
  tags: string[];
  createdAt: string;
  updatedAt: string;
  lastScannedAt: string | null;
  lastAuditedAt: string | null;
}

export interface AppInfo {
  version: string;
  electronVersion: string;
  platform: NodeJS.Platform;
}
```

- [ ] **Step 5: Configure vitest**

Create `vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

export default defineConfig({
  resolve: {
    alias: {
      '@shared': resolve(__dirname, 'src/shared'),
      '@main': resolve(__dirname, 'src/main'),
      '@': resolve(__dirname, 'src/renderer')
    }
  },
  test: {
    globals: false,
    environment: 'node',
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx']
  }
});
```

- [ ] **Step 6: Run test to verify it passes**

Run: `pnpm test`
Expected: 4 tests pass.

- [ ] **Step 7: Commit**

```bash
git add src/shared tests/shared vitest.config.ts
git commit -m "feat(shared): add IPC channel constants and shared types"
```

---

## Task 8: Drizzle schema + DB client (projects table only — Phase 0 minimum)

**Files:**
- Create: `E:\Projects\VibeOps\src\main\db\paths.ts`
- Create: `E:\Projects\VibeOps\src\main\db\schema.ts`
- Create: `E:\Projects\VibeOps\src\main\db\client.ts`
- Create: `E:\Projects\VibeOps\src\main\db\migrate.ts`
- Create: `E:\Projects\VibeOps\drizzle.config.ts`
- Create: `E:\Projects\VibeOps\tests\main\db.test.ts`

> **Scope:** Phase 0 ships only `projects` schema. Phase 2 adds scans/files. Phase 3 adds memories. Phase 5 adds audits/findings. Plans for those phases extend this schema.

- [ ] **Step 1: Write `src/main/db/paths.ts`**

```ts
import { app } from 'electron';
import path from 'node:path';
import fs from 'node:fs';

export interface AppPaths {
  root: string;
  dbFile: string;
  logsDir: string;
  backupsDir: string;
  indexesDir: string;
  settingsFile: string;
}

export function resolveAppPaths(overrideRoot?: string): AppPaths {
  const root = overrideRoot ?? path.join(app.getPath('appData'), 'VibeOps');
  const paths: AppPaths = {
    root,
    dbFile: path.join(root, 'vibeops.db'),
    logsDir: path.join(root, 'logs'),
    backupsDir: path.join(root, 'backups'),
    indexesDir: path.join(root, 'indexes'),
    settingsFile: path.join(root, 'settings.json')
  };
  for (const dir of [paths.root, paths.logsDir, paths.backupsDir, paths.indexesDir]) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return paths;
}
```

- [ ] **Step 2: Write `src/main/db/schema.ts`**

```ts
import { sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

export const projects = sqliteTable('projects', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  slug: text('slug').notNull(),
  description: text('description'),
  localPath: text('local_path').notNull().unique(),
  repoUrl: text('repo_url'),
  category: text('category'),
  status: text('status').notNull().default('active'),
  primaryStack: text('primary_stack'),
  tags: text('tags').notNull().default('[]'),
  createdAt: text('created_at').notNull().default(sql`(CURRENT_TIMESTAMP)`),
  updatedAt: text('updated_at').notNull().default(sql`(CURRENT_TIMESTAMP)`),
  lastScannedAt: text('last_scanned_at'),
  lastAuditedAt: text('last_audited_at')
});

export type ProjectRow = typeof projects.$inferSelect;
export type NewProjectRow = typeof projects.$inferInsert;
```

- [ ] **Step 3: Write `src/main/db/client.ts`**

```ts
import Database, { type Database as BetterSqliteDb } from 'better-sqlite3';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import * as schema from './schema';

export type Db = BetterSQLite3Database<typeof schema>;

export interface DbHandle {
  raw: BetterSqliteDb;
  db: Db;
  close: () => void;
}

export function openDb(filePath: string): DbHandle {
  const raw = new Database(filePath);
  raw.pragma('journal_mode = WAL');
  raw.pragma('foreign_keys = ON');
  const db = drizzle(raw, { schema });
  return {
    raw,
    db,
    close: () => raw.close()
  };
}
```

- [ ] **Step 4: Write `drizzle.config.ts`**

```ts
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './src/main/db/schema.ts',
  out: './drizzle',
  dialect: 'sqlite'
});
```

- [ ] **Step 5: Generate initial migration**

Run: `pnpm db:generate`
Expected: file `drizzle/0000_*.sql` created with `CREATE TABLE projects`.

- [ ] **Step 6: Write `src/main/db/migrate.ts`**

```ts
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDb, type DbHandle } from './client';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function runMigrations(handle: DbHandle, migrationsFolder?: string): void {
  const folder = migrationsFolder ?? path.resolve(__dirname, '../../drizzle');
  migrate(handle.db, { migrationsFolder: folder });
}

if (import.meta.url === `file://${process.argv[1]?.replace(/\\/g, '/')}`) {
  const file = process.env.VIBEOPS_DB ?? path.join(process.cwd(), '.dev.db');
  const handle = openDb(file);
  runMigrations(handle, path.resolve(process.cwd(), 'drizzle'));
  handle.close();
  console.log(`Migrated ${file}`);
}
```

- [ ] **Step 7: Write the failing DB test**

`tests/main/db.test.ts`:

```ts
import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { openDb } from '@main/db/client';
import { runMigrations } from '@main/db/migrate';
import { projects } from '@main/db/schema';
import { eq } from 'drizzle-orm';

let tmpDir: string;
let dbFile: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vibeops-db-'));
  dbFile = path.join(tmpDir, 'test.db');
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('openDb + migrations', () => {
  it('creates projects table after migration', () => {
    const h = openDb(dbFile);
    runMigrations(h, path.resolve(process.cwd(), 'drizzle'));
    const tables = h.raw
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='projects'")
      .all() as Array<{ name: string }>;
    expect(tables).toHaveLength(1);
    h.close();
  });

  it('inserts and reads a project row', () => {
    const h = openDb(dbFile);
    runMigrations(h, path.resolve(process.cwd(), 'drizzle'));
    h.db.insert(projects).values({
      id: 'p1',
      name: 'Test',
      slug: 'test',
      localPath: 'C:\\\\tmp\\\\test'
    }).run();
    const found = h.db.select().from(projects).where(eq(projects.id, 'p1')).all();
    expect(found).toHaveLength(1);
    expect(found[0]?.name).toBe('Test');
    h.close();
  });

  it('rejects duplicate localPath', () => {
    const h = openDb(dbFile);
    runMigrations(h, path.resolve(process.cwd(), 'drizzle'));
    const row = { id: 'p1', name: 'A', slug: 'a', localPath: 'C:\\\\tmp\\\\dup' };
    h.db.insert(projects).values(row).run();
    expect(() =>
      h.db.insert(projects).values({ ...row, id: 'p2' }).run()
    ).toThrow(/UNIQUE/i);
    h.close();
  });
});
```

- [ ] **Step 8: Run test to verify it fails first, then passes**

Run: `pnpm test -- tests/main/db.test.ts`
Expected first run: FAIL if any path missing. Fix issues until 3 tests pass.

- [ ] **Step 9: Commit**

```bash
git add src/main/db drizzle.config.ts drizzle/ tests/main/db.test.ts
git commit -m "feat(db): drizzle schema for projects with migrations"
```

---

## Task 9: Logger

**Files:**
- Create: `E:\Projects\VibeOps\src\main\logger.ts`

- [ ] **Step 1: Add pino**

Run: `pnpm add pino pino-pretty`
Expected: success.

- [ ] **Step 2: Write `src/main/logger.ts`**

```ts
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
```

- [ ] **Step 3: Commit**

```bash
git add src/main/logger.ts package.json pnpm-lock.yaml
git commit -m "feat(main): pino logger with file + pretty output"
```

---

## Task 10: Main process bootstrap + secure window

**Files:**
- Create: `E:\Projects\VibeOps\src\main\window.ts`
- Create: `E:\Projects\VibeOps\src\main\ipc\index.ts`
- Create: `E:\Projects\VibeOps\src\main\ipc\handlers.ts`
- Create: `E:\Projects\VibeOps\src\main\index.ts`

- [ ] **Step 1: Write `src/main/ipc/handlers.ts`**

```ts
import { app, ipcMain } from 'electron';
import { IpcChannels } from '@shared/ipc-channels';
import type { AppInfo } from '@shared/types';

export function registerCoreHandlers(): void {
  ipcMain.handle(IpcChannels.ping, () => 'pong');
  ipcMain.handle(IpcChannels.appVersion, (): AppInfo => ({
    version: app.getVersion(),
    electronVersion: process.versions.electron,
    platform: process.platform
  }));
}
```

- [ ] **Step 2: Write `src/main/ipc/index.ts`**

```ts
export { registerCoreHandlers } from './handlers';
```

- [ ] **Step 3: Write `src/main/window.ts`**

```ts
import { BrowserWindow, shell } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function createMainWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1080,
    minHeight: 720,
    backgroundColor: '#0a0a0b',
    show: false,
    autoHideMenuBar: true,
    title: 'VibeOps',
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true
    }
  });

  win.once('ready-to-show', () => win.show());

  win.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: 'deny' };
  });

  win.webContents.on('will-navigate', (e, url) => {
    const devUrl = process.env.ELECTRON_RENDERER_URL;
    if (!devUrl || !url.startsWith(devUrl)) e.preventDefault();
  });

  if (process.env.ELECTRON_RENDERER_URL) {
    void win.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    void win.loadFile(path.join(__dirname, '../renderer/index.html'));
  }

  return win;
}
```

- [ ] **Step 4: Write `src/main/index.ts`**

```ts
import { app, BrowserWindow, session } from 'electron';
import { createMainWindow } from './window';
import { registerCoreHandlers } from './ipc';
import { resolveAppPaths } from './db/paths';
import { openDb } from './db/client';
import { runMigrations } from './db/migrate';
import { getLogger } from './logger';

let mainWindow: BrowserWindow | null = null;

async function bootstrap(): Promise<void> {
  await app.whenReady();

  const paths = resolveAppPaths();
  const log = getLogger(paths.logsDir);
  log.info({ root: paths.root }, 'app data root resolved');

  const handle = openDb(paths.dbFile);
  runMigrations(handle);
  log.info('database migrated');

  session.defaultSession.webRequest.onHeadersReceived((details, cb) => {
    cb({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [
          "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self' ws://localhost:5173 http://localhost:5173"
        ]
      }
    });
  });

  registerCoreHandlers();
  mainWindow = createMainWindow();

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      handle.close();
      app.quit();
    }
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      mainWindow = createMainWindow();
    }
  });
}

app.on('web-contents-created', (_e, contents) => {
  contents.on('will-attach-webview', (e) => e.preventDefault());
});

bootstrap().catch((err) => {
  console.error('bootstrap failed', err);
  app.exit(1);
});
```

- [ ] **Step 5: Commit**

```bash
git add src/main/window.ts src/main/index.ts src/main/ipc
git commit -m "feat(main): bootstrap with secure BrowserWindow, CSP, IPC handlers"
```

---

## Task 11: Preload bridge (typed `window.vibeops`)

**Files:**
- Create: `E:\Projects\VibeOps\src\preload\api.ts`
- Create: `E:\Projects\VibeOps\src\preload\index.ts`

- [ ] **Step 1: Write `src/preload/api.ts`**

```ts
import { ipcRenderer } from 'electron';
import { IpcChannels } from '@shared/ipc-channels';
import type { AppInfo } from '@shared/types';

export const api = {
  ping: (): Promise<string> => ipcRenderer.invoke(IpcChannels.ping),
  getAppInfo: (): Promise<AppInfo> => ipcRenderer.invoke(IpcChannels.appVersion)
};

export type VibeOpsApi = typeof api;
```

- [ ] **Step 2: Write `src/preload/index.ts`**

```ts
import { contextBridge } from 'electron';
import { api } from './api';

if (process.contextIsolated) {
  contextBridge.exposeInMainWorld('vibeops', api);
} else {
  // Dev fallback only — should never run in production with sandbox+isolation on.
  // @ts-expect-error window typing
  window.vibeops = api;
}
```

- [ ] **Step 3: Add renderer global type declaration**

Create `src/renderer/global.d.ts`:

```ts
import type { VibeOpsApi } from '../preload/api';

declare global {
  interface Window {
    vibeops: VibeOpsApi;
  }
}

export {};
```

- [ ] **Step 4: Add cross-tsconfig type reference**

Edit `tsconfig.web.json` `include` array to also list `src/preload/api.ts`:

Replace:
```json
"include": ["src/renderer/**/*.ts", "src/renderer/**/*.tsx", "src/shared/**/*.ts"]
```
With:
```json
"include": ["src/renderer/**/*.ts", "src/renderer/**/*.tsx", "src/shared/**/*.ts", "src/preload/api.ts"]
```

- [ ] **Step 5: Run typecheck**

Run: `pnpm build:typecheck`
Expected: exit 0.

- [ ] **Step 6: Commit**

```bash
git add src/preload tsconfig.web.json src/renderer/global.d.ts
git commit -m "feat(preload): expose typed vibeops API via contextBridge"
```

---

## Task 12: Renderer shell — App, sidebar, dashboard route

**Files:**
- Create: `E:\Projects\VibeOps\src\renderer\main.tsx`
- Create: `E:\Projects\VibeOps\src\renderer\App.tsx`
- Create: `E:\Projects\VibeOps\src\renderer\lib\api.ts`
- Create: `E:\Projects\VibeOps\src\renderer\components\layout\AppShell.tsx`
- Create: `E:\Projects\VibeOps\src\renderer\components\layout\Sidebar.tsx`
- Create: `E:\Projects\VibeOps\src\renderer\components\layout\Topbar.tsx`
- Create: 7 route stub files under `src/renderer/routes/`

- [ ] **Step 1: Write `src/renderer/lib/api.ts`**

```ts
import type { VibeOpsApi } from '../../preload/api';

export const api: VibeOpsApi = window.vibeops;
```

- [ ] **Step 2: Write `src/renderer/components/layout/Sidebar.tsx`**

```tsx
import { NavLink } from 'react-router-dom';
import { LayoutDashboard, FolderKanban, BookOpen, ShieldCheck, ListChecks, MessageSquare, Settings } from 'lucide-react';
import { cn } from '@/lib/utils';

const items = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/projects', label: 'Projects', icon: FolderKanban },
  { to: '/memory', label: 'Memory', icon: BookOpen },
  { to: '/audits', label: 'Audits', icon: ShieldCheck },
  { to: '/tasks', label: 'Tasks', icon: ListChecks },
  { to: '/chat', label: 'AI Chat', icon: MessageSquare },
  { to: '/settings', label: 'Settings', icon: Settings }
] as const;

export function Sidebar() {
  return (
    <aside className="flex h-full w-56 flex-col border-r border-border bg-card/40 px-3 py-4">
      <div className="mb-6 px-2">
        <div className="text-base font-semibold tracking-tight">VibeOps</div>
        <div className="text-xs text-muted-foreground">Project Intelligence</div>
      </div>
      <nav className="flex flex-col gap-1">
        {items.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors',
                isActive
                  ? 'bg-accent text-accent-foreground'
                  : 'text-muted-foreground hover:bg-secondary hover:text-foreground'
              )
            }
          >
            <Icon className="h-4 w-4" />
            <span>{label}</span>
          </NavLink>
        ))}
      </nav>
    </aside>
  );
}
```

- [ ] **Step 3: Write `src/renderer/components/layout/Topbar.tsx`**

```tsx
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import type { AppInfo } from '@shared/types';

export function Topbar() {
  const [info, setInfo] = useState<AppInfo | null>(null);
  useEffect(() => {
    api.getAppInfo().then(setInfo).catch(() => setInfo(null));
  }, []);
  return (
    <header className="flex h-12 items-center justify-between border-b border-border bg-card/30 px-4">
      <div className="text-sm text-muted-foreground">
        {info ? `v${info.version} · electron ${info.electronVersion}` : 'loading…'}
      </div>
    </header>
  );
}
```

- [ ] **Step 4: Write `src/renderer/components/layout/AppShell.tsx`**

```tsx
import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';

export function AppShell() {
  return (
    <div className="flex h-screen w-screen overflow-hidden">
      <Sidebar />
      <div className="flex flex-1 flex-col">
        <Topbar />
        <main className="flex-1 overflow-y-auto p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Write route stubs**

Create each of these with the same shape, swapping name/copy:

`src/renderer/routes/DashboardRoute.tsx`:

```tsx
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

const stats = [
  { label: 'Total Projects', value: '0' },
  { label: 'Needs Audit', value: '0' },
  { label: 'Critical Findings', value: '0' },
  { label: 'Memory Current', value: '0' }
];

export function DashboardRoute() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p className="text-sm text-muted-foreground">High-level view of all VibeOps projects.</p>
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        {stats.map((s) => (
          <Card key={s.label}>
            <CardHeader className="pb-2">
              <CardDescription>{s.label}</CardDescription>
              <CardTitle className="text-3xl">{s.value}</CardTitle>
            </CardHeader>
            <CardContent />
          </Card>
        ))}
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Project Workspace</CardTitle>
          <CardDescription>Project list will appear here once Phase 1 ships.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
            No projects yet.
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
```

`src/renderer/routes/ProjectsRoute.tsx`:

```tsx
export function ProjectsRoute() {
  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">Projects</h1>
      <p className="text-sm text-muted-foreground">Coming in Phase 1.</p>
    </div>
  );
}
```

Repeat the same minimal stub pattern for `MemoryRoute.tsx`, `AuditsRoute.tsx`, `TasksRoute.tsx`, `ChatRoute.tsx`, `SettingsRoute.tsx`, swapping the heading text. Show explicitly:

`src/renderer/routes/MemoryRoute.tsx`:

```tsx
export function MemoryRoute() {
  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">Memory</h1>
      <p className="text-sm text-muted-foreground">Coming in Phase 3.</p>
    </div>
  );
}
```

`src/renderer/routes/AuditsRoute.tsx`:

```tsx
export function AuditsRoute() {
  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">Audits</h1>
      <p className="text-sm text-muted-foreground">Coming in Phase 5.</p>
    </div>
  );
}
```

`src/renderer/routes/TasksRoute.tsx`:

```tsx
export function TasksRoute() {
  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">Tasks</h1>
      <p className="text-sm text-muted-foreground">Coming in V1.1.</p>
    </div>
  );
}
```

`src/renderer/routes/ChatRoute.tsx`:

```tsx
export function ChatRoute() {
  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">AI Chat</h1>
      <p className="text-sm text-muted-foreground">Coming in V1.1.</p>
    </div>
  );
}
```

`src/renderer/routes/SettingsRoute.tsx`:

```tsx
export function SettingsRoute() {
  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
      <p className="text-sm text-muted-foreground">Coming in Phase 4.</p>
    </div>
  );
}
```

- [ ] **Step 6: Write `src/renderer/App.tsx`**

```tsx
import { createHashRouter, RouterProvider } from 'react-router-dom';
import { AppShell } from '@/components/layout/AppShell';
import { DashboardRoute } from '@/routes/DashboardRoute';
import { ProjectsRoute } from '@/routes/ProjectsRoute';
import { MemoryRoute } from '@/routes/MemoryRoute';
import { AuditsRoute } from '@/routes/AuditsRoute';
import { TasksRoute } from '@/routes/TasksRoute';
import { ChatRoute } from '@/routes/ChatRoute';
import { SettingsRoute } from '@/routes/SettingsRoute';

const router = createHashRouter([
  {
    path: '/',
    element: <AppShell />,
    children: [
      { index: true, element: <DashboardRoute /> },
      { path: 'projects', element: <ProjectsRoute /> },
      { path: 'memory', element: <MemoryRoute /> },
      { path: 'audits', element: <AuditsRoute /> },
      { path: 'tasks', element: <TasksRoute /> },
      { path: 'chat', element: <ChatRoute /> },
      { path: 'settings', element: <SettingsRoute /> }
    ]
  }
]);

export function App() {
  return <RouterProvider router={router} />;
}
```

> **Note:** Hash router avoids file:// path issues in production Electron loadFile.

- [ ] **Step 7: Write `src/renderer/main.tsx`**

```tsx
import React from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { App } from './App';
import './index.css';

const qc = new QueryClient({ defaultOptions: { queries: { staleTime: 30_000, refetchOnWindowFocus: false } } });

const root = document.getElementById('root');
if (!root) throw new Error('root element missing');

createRoot(root).render(
  <React.StrictMode>
    <QueryClientProvider client={qc}>
      <App />
    </QueryClientProvider>
  </React.StrictMode>
);
```

- [ ] **Step 8: Run dev server**

Run: `pnpm dev`
Expected: Electron window opens, dashboard route renders, sidebar visible, version string shown in topbar (proves IPC bridge alive). Click each sidebar item: route swaps. Close window.

> **If `better-sqlite3` ABI mismatch error:** run `pnpm postinstall` (or `pnpm exec electron-builder install-app-deps`) and retry. This is the real Electron-ABI rebuild check that Task 2 deferred.

- [ ] **Step 9: Commit**

```bash
git add src/renderer
git commit -m "feat(renderer): app shell with sidebar, topbar, dashboard, route stubs"
```

---

## Task 13: electron-builder packaging config + smoke build

**Files:**
- Create: `E:\Projects\VibeOps\electron-builder.yml`
- Create: `E:\Projects\VibeOps\build\icon.ico` (placeholder — replace with real asset later)

- [ ] **Step 1: Write `electron-builder.yml`**

```yaml
appId: com.vibeops.app
productName: VibeOps
directories:
  buildResources: build
  output: release
files:
  - out/**/*
  - package.json
asarUnpack:
  - "**/*.node"
extraResources:
  - from: drizzle
    to: drizzle
win:
  target:
    - target: nsis
      arch:
        - x64
  icon: build/icon.ico
nsis:
  oneClick: false
  perMachine: false
  allowToChangeInstallationDirectory: true
  shortcutName: VibeOps
publish: null
```

- [ ] **Step 2: Add placeholder icon**

Run:
```bash
mkdir -p /e/Projects/VibeOps/build
# Use any 256x256 .ico file. If you do not have one yet, copy a default Electron icon:
cp node_modules/electron/dist/electron.exe.ico /e/Projects/VibeOps/build/icon.ico 2>/dev/null \
  || echo "TODO: drop a real icon.ico in build/ before shipping"
```

Expected: either the file exists or the TODO message prints. Either is OK — installer can build with default icon.

- [ ] **Step 3: Run vite build**

Run: `pnpm build`
Expected: `out/main`, `out/preload`, `out/renderer` populated. No TypeScript errors.

- [ ] **Step 4: Commit**

```bash
git add electron-builder.yml build/
git commit -m "chore(packaging): electron-builder config for windows nsis target"
```

---

## Task 14: Phase 0 acceptance check

**Files:** none (validation step)

- [ ] **Step 1: Run full quality gate**

Run: `pnpm build:typecheck && pnpm test && pnpm build`
Expected: all three exit 0.

- [ ] **Step 2: Run app and verify acceptance criteria from PRD §29.0**

Run: `pnpm dev`
Verify in app:
- Window opens on Windows.
- Dashboard route renders by default.
- Sidebar navigation works (each link changes main panel).
- Topbar shows version (proves IPC).
- DevTools console: zero errors, zero CSP violations, no `nodeIntegration` warnings.
- Terminal: `pino` log "database migrated" appeared on startup.
- File `%APPDATA%\VibeOps\vibeops.db` exists. Run from PowerShell: `Test-Path "$env:APPDATA\VibeOps\vibeops.db"` → `True`.

- [ ] **Step 3: Tag the milestone commit**

```bash
git tag -a phase-0 -m "Phase 0 complete: scaffold ready"
```

- [ ] **Step 4: Final commit (if anything dirty)**

```bash
git status
# if clean: nothing more to commit. if dirty:
git add -A
git commit -m "chore: phase 0 cleanup"
```

---

## Self-Review Notes

- **Spec coverage (PRD §29.0):** scaffold ✓, sidebar ✓, dashboard ✓, SQLite/Drizzle ✓, project schema ✓, placeholder workspace table ✓, secure preload ✓ (PRD §21.2). Acceptance: launches on Windows ✓, dashboard loads ✓, DB initializes ✓.
- **Phase 0 boundary:** Only `projects` table created. Scans/files/memories/audits deferred to their phase plans.
- **Type consistency:** `Project` shape in `src/shared/types.ts` matches `projects` columns; `tags` is JSON-stringified TEXT in DB, parsed to `string[]` at IPC boundary in Phase 1.
- **Risks:** `better-sqlite3` ABI rebuild (Task 12 Step 8 has fallback). Hash router chosen to avoid `file://` quirks. CSP intentionally permits `ws://localhost:5173` for HMR — production main process serves from filesystem, so connect-src remains restrictive.
