# Product Requirements Document

# VibeOps: Windows Native Project Intelligence App

## 1. Product Summary

**Product Name:** VibeOps  
**Platform:** Native Windows desktop application  
**Primary User:** Independent developer, MSP owner, software agency, AI-assisted builder, or product operator managing multiple AI/vibe-coded applications  
**Primary Purpose:** Organize, understand, audit, and maintain software projects created or modified using Claude Code, Codex, OpenCode, Replit, Cursor, or similar AI coding tools.

VibeOps is a local-first Windows desktop application that acts as a command center for AI-built software projects. It allows the user to register local project folders, scan and understand codebases, generate and maintain a `memory.md` file for each project, run code audits, identify technical debt, and generate safe next-step prompts for Claude Code, Codex, OpenCode, or other coding agents.

The core problem VibeOps solves is project drift. AI-assisted builders often create many apps quickly, but over time those projects become difficult to resume, understand, audit, and maintain. VibeOps gives every project a durable memory, clear technical profile, audit history, and actionable next steps.

---

## 2. Product Vision

VibeOps should become the operating system for managing AI-built applications.

The user should be able to open VibeOps, select any project, and instantly understand:

- What the app does
- Why it was created
- What stack it uses
- What files matter most
- What features are complete
- What features are incomplete
- What is broken
- What is risky
- What needs to be fixed next
- What prompt should be given to Claude Code, Codex, or OpenCode
- Whether the project has a current and useful `memory.md`

The product should not attempt to replace Claude Code or Codex. Instead, it should become the control layer above them.

**VibeOps = project memory + audit intelligence + prompt strategy**  
**Claude Code / Codex / OpenCode = implementation agents**

---

## 3. Goals

### 3.1 Business Goals

1. Create a native Windows application that organizes all local software projects.
2. Reduce the time required to resume work on an abandoned or stale app.
3. Make AI-generated projects easier to maintain, audit, and hand off.
4. Provide a repeatable project-memory standard across all apps.
5. Create a foundation for a future commercial product that can be sold to other developers, agencies, MSPs, and AI builders.

### 3.2 Product Goals

1. Let users register local project folders.
2. Automatically scan projects and detect app type, stack, frameworks, package manager, database, deployment configuration, and important files.
3. Generate and maintain a `memory.md` file inside each project.
4. Run local-first, read-only code audits.
5. Provide project-level dashboards, audit findings, and next-action recommendations.
6. Generate safe, scoped prompts for Claude Code, Codex, and OpenCode.
7. Maintain a searchable local project knowledge base.
8. Avoid storing raw secrets.
9. Keep the MVP fully local with no mandatory cloud dependency.

### 3.3 User Experience Goals

1. The app should feel premium, modern, and highly polished.
2. The app should feel like a native desktop command center, not a generic admin panel.
3. The user should be able to understand project health at a glance.
4. The user should be able to rehydrate a stale project in minutes.
5. All dangerous operations should require explicit approval.
6. The user should trust that secrets are not being exposed or stored.

---

## 4. Non-Goals for MVP

The first version should not include:

- Multi-user collaboration
- Cloud sync
- Hosted web dashboard
- Authentication
- Billing
- Team permissions
- Automated pull requests
- Fully autonomous code editing
- Production CI/CD automation
- Marketplace features
- Browser-only version
- Mobile app

These may be considered in later versions.

---

## 5. Target User Personas

### 5.1 Primary Persona: AI-Assisted Builder

**Profile:** A technical founder, consultant, MSP owner, or developer who has many projects created with Claude Code, Codex, Cursor, Replit, OpenCode, or similar tools.

**Pain Points:**

- Has many half-built apps
- Forgets what each app does
- Does not know which apps are production-ready
- Has inconsistent documentation
- Needs to safely resume projects after weeks or months
- Needs AI tools to understand context quickly
- Needs to prevent AI agents from over-editing or breaking things

**Needs:**

- Project dashboard
- `memory.md` per project
- Deep app summary
- Code audit
- Security findings
- Technical debt list
- Next best prompt

### 5.2 Secondary Persona: Software Agency / MSP

**Profile:** A small software or MSP team that builds apps for clients using AI-assisted development.

**Pain Points:**

- Needs clean handoff docs
- Needs client project organization
- Needs audit trails
- Needs reusable project context
- Needs to identify abandoned opportunities

**Needs:**

- Project registry
- Client/project tagging
- Handoff summaries
- Audit reports
- Status tracking

### 5.3 Future Persona: Product Operator

**Profile:** A founder or product manager managing multiple MVPs.

**Pain Points:**

- Needs to know what is viable
- Needs to prioritize fixes
- Needs project readiness scoring
- Needs technical summaries without reading the code

**Needs:**

- Product completeness audit
- MVP readiness score
- Roadmap extraction
- Risk analysis

---

## 6. Core Product Concept

VibeOps is a local Windows app that monitors and catalogs software projects. Each registered project gets:

- Project profile
- Detected tech stack
- File inventory
- Codebase map
- Memory document
- Audit history
- Task list
- AI chat context
- Recommended prompt library
- Technical risk score
- Product completion score

The main product action is:

## Rehydrate This Project

When clicked, VibeOps should analyze the selected project and produce:

1. Plain-English app summary
2. Architecture overview
3. Key files and directories
4. Current development status
5. Known bugs and risks
6. Security findings
7. Missing features
8. Recommended next action
9. Claude Code / Codex prompt
10. Updated `memory.md`

---

## 7. Platform Requirements

### 7.1 Primary Platform

- Windows 10 and Windows 11
- 64-bit installer
- Local filesystem access
- Local database
- Optional shell command execution with explicit approval

### 7.2 Recommended MVP Desktop Framework

**Recommended MVP:** Electron + React + TypeScript

Reasons:

- Fastest path to a working Windows desktop app
- Strong Node.js filesystem support
- Easier integration with Git, package managers, local shell commands, SDKs, and local workers
- Easier for Claude Code/Codex to build and maintain
- Mature packaging options

### 7.3 Future Desktop Framework Option

**Future Option:** Tauri + React + Rust

Reasons:

- Smaller app size
- Stronger native security model
- Fine-grained permission control
- More efficient runtime

The MVP should be built with Electron unless the user specifically chooses to optimize for app size and native permission control from day one.

---

## 8. Recommended Technical Stack

### 8.1 Frontend

- React
- TypeScript
- Tailwind CSS
- shadcn/ui
- Lucide icons
- TanStack Table
- TanStack Query
- Zustand or Jotai for local UI state
- React Router or TanStack Router

### 8.2 Desktop Shell

- Electron
- Secure preload bridge
- Context isolation enabled
- Node integration disabled in renderer
- IPC allowlist for approved local operations

### 8.3 Backend / Local Worker

- Node.js worker process
- TypeScript
- Fast-glob for file scanning
- simple-git for Git metadata
- ignore package for `.gitignore`-style filtering
- dotenv parser for variable-name extraction only
- dependency parsers for `package.json`, `requirements.txt`, `pyproject.toml`, etc.

### 8.4 Local Database

- SQLite
- Drizzle ORM
- Local migrations
- Optional SQLCipher or encrypted storage for sensitive local app settings

### 8.5 Vector Search / Semantic Index

MVP options:

- LanceDB
- Chroma
- SQLite FTS for lightweight text search first

Recommendation:

- Use SQLite FTS for MVP search.
- Add LanceDB later for embeddings and semantic code search.

### 8.6 AI Providers

The app should support multiple AI providers through an internal adapter interface:

- Anthropic Claude API
- Claude Agent SDK / Claude Code SDK integration
- OpenAI API
- OpenAI Agents SDK
- OpenAI Codex SDK
- Local model adapter in the future

The app should not be hardcoded to one provider.

---

## 9. System Architecture

```text
VibeOps Windows Desktop App
│
├── Electron Main Process
│   ├── Window lifecycle
│   ├── Secure IPC handlers
│   ├── Native file dialogs
│   ├── Shell command approval gateway
│   └── Local worker orchestration
│
├── Renderer Process
│   ├── React UI
│   ├── Dashboard
│   ├── Project Workspace
│   ├── Memory Viewer/Editor
│   ├── Audit Viewer
│   ├── AI Chat UI
│   └── Settings
│
├── Preload Bridge
│   ├── Approved project APIs
│   ├── Approved scan APIs
│   ├── Approved memory APIs
│   ├── Approved audit APIs
│   └── No direct filesystem exposure
│
├── Local Worker Service
│   ├── Project scanner
│   ├── Stack detector
│   ├── File summarizer
│   ├── Memory generator
│   ├── Audit engine
│   ├── Dependency analyzer
│   └── Prompt generator
│
├── Local Database
│   ├── Projects
│   ├── Files
│   ├── Memories
│   ├── Audits
│   ├── Findings
│   ├── Tasks
│   ├── Sessions
│   └── Settings
│
└── AI Provider Layer
    ├── Anthropic provider
    ├── Claude Agent provider
    ├── OpenAI provider
    ├── Codex provider
    └── Local provider placeholder
```

---

## 10. Main Features

# Feature 1: Project Registry

## 10.1 Description

The user can add local project folders to VibeOps. Each project becomes a managed record inside the local database.

## 10.2 User Stories

- As a user, I want to add a local project folder so I can manage it in VibeOps.
- As a user, I want to see all my projects in a dashboard so I can prioritize work.
- As a user, I want to tag projects by client, product, status, and category.
- As a user, I want to open a project in Explorer, VS Code, Cursor, or terminal.

## 10.3 Functional Requirements

1. App must provide an **Add Project** button.
2. User must be able to select a local folder through a native Windows folder picker.
3. App must store:
   - Project name
   - Local path
   - Description
   - Status
   - Tags
   - Category
   - Created date
   - Last scanned date
   - Last audited date
4. App must detect duplicate project paths.
5. App must allow editing project metadata.
6. App must allow archiving a project without deleting local files.
7. App must allow removing a project from VibeOps without deleting local files.

## 10.4 Acceptance Criteria

- User can add a folder as a project.
- Project appears on dashboard immediately.
- Project persists after app restart.
- Duplicate folder cannot be added twice without confirmation.
- Removing a project from VibeOps does not delete the source folder.

---

# Feature 2: Project Scanner

## 11.1 Description

The project scanner inspects the selected project folder and builds a structured understanding of the app.

## 11.2 Scanner Must Detect

- Project type
- Programming languages
- Frameworks
- Package manager
- Database
- Auth system
- Deployment target
- Docker usage
- Supabase usage
- API routes
- Important configs
- Existing documentation
- Existing AI instruction files

## 11.3 Important Files to Scan

```text
package.json
pnpm-lock.yaml
yarn.lock
package-lock.json
README.md
memory.md
CLAUDE.md
AGENTS.md
.env.example
.env.local.example
supabase/config.toml
supabase/migrations/*
schema.sql
prisma/schema.prisma
docker-compose.yml
Dockerfile
vite.config.ts
next.config.js
next.config.ts
tsconfig.json
jsconfig.json
tailwind.config.js
src/**
app/**
pages/**
components/**
server/**
api/**
```

## 11.4 Default Ignore Rules

The scanner must ignore:

```text
node_modules
.git
.next
dist
build
coverage
.cache
.turbo
.vercel
.netlify
.env
.env.local
.env.production
*.pem
*.key
*.pfx
*.sqlite
*.db
*.log
```

## 11.5 Secret Handling

The scanner may detect that secret-like files exist, but it must not store raw secret values.

For `.env.example`, it may store variable names.

For `.env`, `.env.local`, and production secret files:

- Do not read full contents by default.
- Do not store values.
- Flag existence as a security-sensitive file.
- Allow user to enable a controlled secret audit mode later.

## 11.6 Scanner Output

The scan should produce:

```json
{
  "projectType": "Next.js Application",
  "languages": ["TypeScript", "JavaScript"],
  "frameworks": ["Next.js", "React", "Tailwind CSS"],
  "packageManager": "pnpm",
  "database": "Supabase Postgres",
  "auth": "Supabase Auth",
  "deployment": "Vercel",
  "importantFiles": [],
  "importantDirectories": [],
  "environmentVariables": [],
  "warnings": [],
  "summary": "..."
}
```

## 11.7 Acceptance Criteria

- Scanner completes successfully on a typical React/Next/Supabase project.
- Scanner ignores large/generated folders.
- Scanner does not store raw `.env` values.
- Scanner identifies package manager correctly.
- Scanner identifies major frameworks correctly.
- Scanner saves results to local database.

---

# Feature 3: `memory.md` Generator

## 12.1 Description

Each project should have a durable `memory.md` file stored at the root of the project.

This file acts as the long-term memory for humans and AI coding agents.

## 12.2 Memory File Location

```text
/project-root/memory.md
```

## 12.3 Memory File Purpose

The `memory.md` should explain:

- What the project is
- Why it exists
- Who it is for
- What stack it uses
- How the app is structured
- What files matter most
- What is complete
- What is incomplete
- Known risks
- Security notes
- Deployment notes
- AI coding instructions
- Recommended next actions

## 12.4 Default Memory Template

```md
# Project Memory: [Project Name]

## 1. Project Identity
- Name:
- Owner:
- Client:
- Category:
- Current Status:
- Local Path:
- Repository:

## 2. Product Summary
Short plain-English explanation of what this app does.

## 3. Primary Users
- User type 1
- User type 2

## 4. Current Stack
- Frontend:
- Backend:
- Database:
- Auth:
- Storage:
- Payments:
- AI:
- Hosting:

## 5. Architecture Overview
Explain the major parts of the app and how they work together.

## 6. Key Directories
| Path | Purpose |
|---|---|

## 7. Key Files
| File | Purpose |
|---|---|

## 8. Database / Schema Notes
Tables, relationships, migrations, RLS notes, known risks.

## 9. APIs and Integrations
External services, internal endpoints, webhooks, SDKs.

## 10. Environment Variables
Store variable names only. Do not store secret values.

| Variable | Purpose | Required |
|---|---|---|

## 11. Security Notes
Authentication, authorization, RLS, exposed endpoints, secret handling.

## 12. Deployment Notes
Build command, hosting provider, deployment risks, required services.

## 13. Known Issues
| Severity | Issue | Area | Recommendation |
|---|---|---|---|

## 14. Technical Debt
List duplicated code, weak architecture, missing tests, brittle modules.

## 15. Product Roadmap
### Next
### Later
### Backlog

## 16. Last Audit Summary
- Last audit date:
- Overall score:
- Critical findings:
- Recommended next action:

## 17. Instructions for Future AI Agents
- Read this file first.
- Do not make broad rewrites unless asked.
- Prefer small, targeted changes.
- Do not change database schema without explaining why.
- Do not remove existing features without approval.
- Summarize all modified files.
```

## 12.5 Memory Generation Modes

### Mode 1: Create New Memory

Used when no `memory.md` exists.

### Mode 2: Refresh Memory

Used when a `memory.md` exists and the app needs to update stale sections.

### Mode 3: Merge Memory

Used when existing memory contains user-authored notes that should be preserved.

### Mode 4: Export Agent Files

Generate:

```text
CLAUDE.md
AGENTS.md
README.md
docs/architecture.md
docs/deployment.md
docs/audit-history.md
docs/roadmap.md
```

## 12.6 Acceptance Criteria

- App can generate `memory.md` for a project.
- App asks before overwriting existing memory.
- App preserves custom user notes where possible.
- App stores memory versions in local database.
- App can open memory in internal editor.
- App can open memory in external editor.

---

# Feature 4: Deep Code Audit Engine

## 13.1 Description

VibeOps should run a structured audit of each project. The first version should be read-only.

## 13.2 Audit Types

### Architecture Audit

Determines:

- App purpose
- Core modules
- Folder structure
- Data flow
- Auth flow
- State management
- API boundaries
- Major dependencies
- Areas of poor organization

### Security Audit

Checks for:

- Hardcoded secrets
- Service role keys in frontend code
- Unsafe API routes
- Missing auth checks
- Weak authorization
- Supabase RLS risks
- Public storage risk
- CORS issues
- Missing rate limits
- Unsafe command execution
- Dangerous file upload handling

### Dependency Audit

Checks:

- Outdated packages
- Known vulnerable packages
- Unused packages
- Multiple package managers
- Deprecated libraries
- Lockfile mismatch

### Product Completeness Audit

Determines:

- Which features appear complete
- Which features are partially implemented
- Which features are only UI mockups
- Which workflows are broken or missing
- Whether the app is production-ready

### Vibe-Code Quality Audit

Checks for AI-generated project problems:

- Duplicate components
- Orphaned files
- Conflicting patterns
- Mock data left in production
- TODO-heavy sections
- No error handling
- Inconsistent naming
- Dead routes
- Incomplete backend wiring
- UI that exists without real logic

### Deployment Audit

Checks:

- Build command
- Start command
- Hosting target
- Missing environment variables
- Docker configuration
- Vercel/Netlify config
- Supabase config
- CI/CD files

## 13.3 Audit Output

Each audit run should produce:

```json
{
  "overallScore": 74,
  "riskLevel": "Medium",
  "summary": "...",
  "criticalFindings": [],
  "highFindings": [],
  "mediumFindings": [],
  "lowFindings": [],
  "recommendedNextAction": "...",
  "generatedPrompt": "..."
}
```

## 13.4 Finding Model

Each finding must include:

- Severity
- Category
- Title
- Description
- File path
- Optional line range
- Why it matters
- Recommendation
- Suggested Claude/Codex prompt
- Status

## 13.5 Acceptance Criteria

- User can run an audit from the project detail page.
- Audit result is saved locally.
- Audit findings display in the UI.
- Critical/high/medium/low findings are visually distinct.
- Audit does not modify code.
- Audit produces a recommended next action.
- Audit produces a scoped prompt for Claude Code or Codex.

---

# Feature 5: AI Provider Wrapper

## 14.1 Description

The app must use a provider abstraction for AI calls. This prevents vendor lock-in and allows the app to use Claude, OpenAI, Codex, and future providers.

## 14.2 Provider Interface

```ts
export interface AIProvider {
  id: string;
  name: string;

  analyzeProject(input: AnalyzeProjectInput): Promise<ProjectAnalysisResult>;
  generateMemory(input: GenerateMemoryInput): Promise<MemoryGenerationResult>;
  runAudit(input: AuditInput): Promise<AuditResult>;
  generatePrompt(input: PromptGenerationInput): Promise<PromptGenerationResult>;
  chatWithProject(input: ProjectChatInput): Promise<ProjectChatResult>;
}
```

## 14.3 Providers to Support

### MVP Provider

- OpenAI API or Anthropic API direct SDK

### V1.1 Providers

- Claude Agent SDK provider
- Codex SDK provider
- OpenAI Agents SDK provider

### Future Providers

- Local LLM provider
- Azure OpenAI provider
- Ollama provider

## 14.4 AI Operations

The provider layer should support:

- Project summary generation
- File summary generation
- Folder summary generation
- Memory generation
- Audit generation
- Prompt generation
- Project chat
- Structured JSON outputs

## 14.5 AI Safety Requirements

- Do not send ignored files.
- Do not send `.env` secret values.
- Redact detected secrets before AI calls.
- Show provider/model selected.
- Show estimated token/cost usage if possible.
- Allow user to disable cloud AI calls per project.
- Allow local-only mode.

## 14.6 Acceptance Criteria

- App can configure at least one AI provider.
- App can run a test AI call.
- App can generate a project summary using configured provider.
- Provider can be swapped without changing audit UI.
- Failed AI calls show clear errors.

---

# Feature 6: Safe Prompt Generator

## 15.1 Description

VibeOps should generate scoped, safe prompts that can be copied into Claude Code, Codex, or OpenCode.

## 15.2 Prompt Types

- Fix a bug
- Implement a feature
- Refactor safely
- Audit a module
- Review security
- Generate tests
- Update documentation
- Finish incomplete workflow
- Prepare deployment

## 15.3 Prompt Structure

```md
You are working inside [Project Name].

Before doing anything:
1. Read memory.md.
2. Inspect only the relevant files listed below.
3. Do not make broad rewrites.

Goal:
[Specific goal]

Rules:
- Do not redesign the UI unless asked.
- Do not change authentication unless required.
- Do not modify database schema without explaining why.
- Do not remove existing functionality.
- Make the smallest safe change.
- Summarize every modified file.

Relevant Files:
- file/path/one.ts
- file/path/two.tsx

Expected Behavior:
[Expected result]

Validation:
- Run typecheck if available.
- Run tests if available.
- Report any commands that fail.
```

## 15.4 Acceptance Criteria

- Every audit should generate at least one recommended prompt.
- User can copy prompt to clipboard.
- User can save prompt to project prompt history.
- User can mark prompt as used.
- User can record outcome notes.

---

# Feature 7: Project Chat

## 16.1 Description

The user can chat with an AI assistant using the selected project context.

## 16.2 Example Questions

- What does this app do?
- What is broken?
- Is this production-ready?
- What should I fix first?
- Explain the database schema.
- What are the riskiest files?
- Generate a Claude Code prompt to finish this feature.
- What files should I avoid touching?

## 16.3 Requirements

- Chat must use project scan summaries and memory.
- Chat should not blindly send entire codebase every time.
- Chat should retrieve relevant project context.
- Chat should cite file paths internally in responses.
- Chat history should be stored locally.

## 16.4 Acceptance Criteria

- User can ask a project question.
- AI responds using project context.
- Response references relevant files.
- Chat history persists locally.

---

# Feature 8: Dashboard

## 17.1 Description

The dashboard gives the user a high-level view of all projects.

## 17.2 Dashboard Cards

- Total Projects
- Needs Audit
- Critical Findings
- Memory Current
- Active Projects
- Archived Projects
- Last Scanned
- Highest Risk Project

## 17.3 Project Table Columns

- Project
- Stack
- Status
- Audit Score
- Last Scan
- Memory Status
- Next Action

## 17.4 Recent Findings Panel

Show the latest critical/high/medium findings across all projects.

## 17.5 AI Chat Preview

Provide quick question entry:

- Explain selected project
- What should I fix next?
- Generate next prompt

## 17.6 Acceptance Criteria

- Dashboard loads within 2 seconds for 100 projects.
- User can search projects.
- User can filter by status, tag, risk, and stack.
- User can select project and view details.

---

# Feature 9: Project Detail Page

## 18.1 Tabs

Each project should have these tabs:

1. Overview
2. Memory.md
3. Code Map
4. Audits
5. Findings
6. Tasks
7. AI Chat
8. Prompts
9. Git
10. Deployment
11. Settings

## 18.2 Overview Tab

Shows:

- Project summary
- Stack
- Status
- Local path
- Repository
- Last scan
- Last audit
- Memory freshness
- Risk score
- Next action

## 18.3 Memory Tab

Shows:

- Rendered memory
- Edit memory
- Generate memory
- Refresh memory
- Version history
- Export files

## 18.4 Code Map Tab

Shows:

- Directory tree
- Important files
- File summaries
- Architecture overview
- Optional diagram later

## 18.5 Audits Tab

Shows:

- Audit history
- Audit scores
- Run new audit
- Compare audits

## 18.6 Tasks Tab

Shows:

- Generated tasks
- Manual tasks
- Priority
- Status
- Source finding

## 18.7 Prompts Tab

Shows:

- Generated prompts
- Used prompts
- Outcomes
- Prompt templates

---

# Feature 10: Local Task System

## 19.1 Description

Audit findings can become tasks.

## 19.2 Task Fields

- Title
- Description
- Project
- Priority
- Source
- Status
- Related files
- Related audit finding
- Suggested prompt
- Created date
- Completed date

## 19.3 Task Statuses

- Backlog
- Next
- In Progress
- Blocked
- Done
- Ignored

## 19.4 Acceptance Criteria

- User can create tasks manually.
- User can convert audit finding into task.
- User can mark tasks complete.
- User can filter tasks by project and priority.

---

# Feature 11: Git Awareness

## 20.1 Description

VibeOps should read Git metadata where available.

## 20.2 Requirements

- Detect Git repository
- Show branch
- Show latest commit
- Show dirty working tree status
- Show recent commits
- Detect uncommitted changes before scanning or agent operation

## 20.3 MVP Constraints

VibeOps should not commit, push, pull, or modify Git state in MVP.

## 20.4 Acceptance Criteria

- App detects whether project is a Git repo.
- App shows current branch.
- App warns if project has uncommitted changes.

---

# 21. Security Requirements

## 21.1 Core Security Principles

1. Local-first by default.
2. Read-only scanning by default.
3. No raw secret storage.
4. Explicit user approval before shell commands.
5. Explicit user approval before writing files.
6. Renderer process must not have unrestricted filesystem access.
7. All privileged operations go through secure IPC.
8. Audit logs should track sensitive operations.

## 21.2 Electron Security Requirements

- Enable context isolation.
- Disable Node integration in renderer.
- Use preload scripts for limited IPC APIs.
- Validate all IPC inputs.
- Do not expose arbitrary shell execution.
- Disable remote module.
- Apply Content Security Policy.
- Sanitize rendered markdown.
- Avoid loading remote content in privileged windows.

## 21.3 File Safety

- Never delete project files from VibeOps MVP.
- Ask before writing `memory.md`.
- Ask before overwriting `CLAUDE.md` or `AGENTS.md`.
- Keep memory version history.
- Use file backups before overwriting generated files.

## 21.4 Shell Command Safety

Supported command modes:

| Mode | Description |
|---|---|
| Disabled | No commands allowed |
| Approval Required | User approves each command |
| Trusted Project | User can approve recurring safe commands |

MVP should default to command execution disabled.

## 21.5 AI Safety

- Redact secrets before AI context is sent.
- Display list of files included in AI context.
- Allow local-only mode.
- Allow per-project AI provider disable.
- Do not send ignored directories.

---

# 22. Data Model

## 22.1 projects

```sql
CREATE TABLE projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  description TEXT,
  local_path TEXT NOT NULL UNIQUE,
  repo_url TEXT,
  category TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  primary_stack TEXT,
  tags TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  last_scanned_at TEXT,
  last_audited_at TEXT
);
```

## 22.2 project_scans

```sql
CREATE TABLE project_scans (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  status TEXT NOT NULL,
  summary TEXT,
  detected_stack TEXT,
  detected_frameworks TEXT,
  detected_package_manager TEXT,
  detected_database TEXT,
  detected_auth TEXT,
  warnings TEXT,
  started_at TEXT NOT NULL,
  completed_at TEXT,
  FOREIGN KEY(project_id) REFERENCES projects(id)
);
```

## 22.3 project_files

```sql
CREATE TABLE project_files (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  path TEXT NOT NULL,
  file_type TEXT,
  size_bytes INTEGER,
  hash TEXT,
  importance_score INTEGER DEFAULT 0,
  summary TEXT,
  last_seen_at TEXT NOT NULL,
  FOREIGN KEY(project_id) REFERENCES projects(id)
);
```

## 22.4 project_memories

```sql
CREATE TABLE project_memories (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  version INTEGER NOT NULL,
  content TEXT NOT NULL,
  source TEXT NOT NULL,
  file_written INTEGER DEFAULT 0,
  created_at TEXT NOT NULL,
  FOREIGN KEY(project_id) REFERENCES projects(id)
);
```

## 22.5 audit_runs

```sql
CREATE TABLE audit_runs (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  audit_type TEXT NOT NULL,
  provider TEXT,
  model TEXT,
  status TEXT NOT NULL,
  score INTEGER,
  summary TEXT,
  started_at TEXT NOT NULL,
  completed_at TEXT,
  FOREIGN KEY(project_id) REFERENCES projects(id)
);
```

## 22.6 audit_findings

```sql
CREATE TABLE audit_findings (
  id TEXT PRIMARY KEY,
  audit_run_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  severity TEXT NOT NULL,
  category TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  file_path TEXT,
  line_start INTEGER,
  line_end INTEGER,
  recommendation TEXT,
  suggested_prompt TEXT,
  status TEXT NOT NULL DEFAULT 'open',
  created_at TEXT NOT NULL,
  FOREIGN KEY(audit_run_id) REFERENCES audit_runs(id),
  FOREIGN KEY(project_id) REFERENCES projects(id)
);
```

## 22.7 project_tasks

```sql
CREATE TABLE project_tasks (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  source_finding_id TEXT,
  title TEXT NOT NULL,
  description TEXT,
  priority TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'backlog',
  suggested_prompt TEXT,
  created_at TEXT NOT NULL,
  completed_at TEXT,
  FOREIGN KEY(project_id) REFERENCES projects(id)
);
```

## 22.8 ai_sessions

```sql
CREATE TABLE ai_sessions (
  id TEXT PRIMARY KEY,
  project_id TEXT,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  purpose TEXT NOT NULL,
  title TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY(project_id) REFERENCES projects(id)
);
```

## 22.9 ai_messages

```sql
CREATE TABLE ai_messages (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY(session_id) REFERENCES ai_sessions(id)
);
```

## 22.10 generated_prompts

```sql
CREATE TABLE generated_prompts (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  title TEXT NOT NULL,
  prompt_type TEXT NOT NULL,
  content TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'unused',
  outcome_notes TEXT,
  created_at TEXT NOT NULL,
  used_at TEXT,
  FOREIGN KEY(project_id) REFERENCES projects(id)
);
```

---

# 23. UI / UX Requirements

## 23.1 Visual Design

The app should use:

- Dark mode first
- Premium developer-tool aesthetic
- Purple/blue accent system
- Rounded cards
- Clear status colors
- Compact but readable tables
- High information density without clutter
- Command-center feel

## 23.2 Navigation

Left sidebar:

- Dashboard
- Projects
- Memory
- Audits
- Tasks
- AI Chat
- Settings

## 23.3 Status Colors

| Status | Color |
|---|---|
| Active | Green |
| Planning | Blue |
| Needs Cleanup | Orange |
| Critical | Red |
| Archived | Gray |
| Memory Current | Purple/Blue |

## 23.4 Main Dashboard Layout

Top row:

- Total Projects
- Needs Audit
- Critical Findings
- Memory Current

Middle:

- Project Workspace table
- Selected Project panel

Bottom:

- Recent Audit Findings
- AI Chat preview
- Audit score widget

## 23.5 Empty States

When no projects exist:

- Show friendly onboarding
- Explain what VibeOps does
- Provide Add Project button
- Show example project card

## 23.6 Loading States

- Scanning project
- Generating memory
- Running audit
- Loading AI response

Each should show progress and current stage.

---

# 24. Project Scanner Algorithm

## 24.1 Step-by-Step

1. User selects folder.
2. App checks folder exists and is readable.
3. App checks duplicate path.
4. App creates project record.
5. Scanner loads ignore rules.
6. Scanner walks file tree.
7. Scanner filters ignored folders and files.
8. Scanner hashes important files.
9. Scanner reads small text config files.
10. Scanner detects frameworks.
11. Scanner detects package manager.
12. Scanner detects database/auth/deploy.
13. Scanner extracts environment variable names from safe files.
14. Scanner stores file inventory.
15. Scanner generates summary.
16. Scanner updates project metadata.

## 24.2 Framework Detection Rules

Examples:

- `next` dependency or `next.config.*` = Next.js
- `vite.config.*` = Vite
- `expo` dependency = Expo / React Native
- `react-native` dependency = React Native
- `supabase` folder or dependency = Supabase
- `prisma/schema.prisma` = Prisma
- `docker-compose.yml` = Docker Compose
- `vercel.json` = Vercel
- `netlify.toml` = Netlify
- `tauri.conf.json` = Tauri
- `electron` dependency = Electron

---

# 25. Audit Scoring Model

## 25.1 Overall Score

Score from 0 to 100.

Suggested weighting:

| Category | Weight |
|---|---:|
| Security | 30% |
| Architecture | 20% |
| Product Completeness | 20% |
| Code Quality | 15% |
| Deployment Readiness | 10% |
| Documentation / Memory | 5% |

## 25.2 Severity Impact

| Severity | Score Impact |
|---|---:|
| Critical | -15 each |
| High | -8 each |
| Medium | -4 each |
| Low | -1 each |
| Info | 0 |

Scores should never go below 0 or above 100.

## 25.3 Readiness Labels

| Score | Label |
|---|---|
| 90-100 | Strong |
| 75-89 | Good |
| 60-74 | Needs Work |
| 40-59 | Risky |
| 0-39 | Critical |

---

# 26. Settings

## 26.1 Settings Sections

- General
- AI Providers
- Scanner Rules
- Security
- Appearance
- External Tools
- Data Management

## 26.2 AI Provider Settings

Fields:

- Provider enabled/disabled
- API key
- Default model
- Max tokens
- Temperature
- Local-only mode
- Test connection button

## 26.3 External Tools

Allow configuring paths for:

- VS Code
- Cursor
- Claude Code
- Codex
- OpenCode
- Windows Terminal
- Git

## 26.4 Data Management

- Export database backup
- Import backup
- Clear audit history
- Rebuild search index
- Reset app

---

# 27. Permissions and Safety Modes

## 27.1 Project Permission Modes

| Mode | Read Files | Write Files | Run Commands | AI Cloud Calls |
|---|---:|---:|---:|---:|
| Local Catalog | Yes | No | No | No |
| Safe Audit | Yes | No | No | Yes |
| Deep Audit | Yes | No | Approval | Yes |
| Assisted Fix | Yes | Approval | Approval | Yes |
| Autonomous | Yes | Yes | Yes | Yes |

MVP should support:

- Local Catalog
- Safe Audit

Future versions can support the rest.

---

# 28. MVP Scope

## 28.1 MVP Must Include

1. Windows desktop app shell
2. Dashboard
3. Add project folder
4. Project registry
5. Local SQLite database
6. Project scanner
7. Stack detection
8. Project detail page
9. `memory.md` generator
10. Memory viewer/editor
11. Basic audit runner
12. Audit findings list
13. Safe prompt generator
14. Settings for AI provider
15. Local-only security posture

## 28.2 MVP Should Include If Time Allows

1. Git status detection
2. Project chat
3. Prompt history
4. Task generation from findings
5. Markdown export
6. Open in VS Code/Cursor

## 28.3 MVP Should Not Include

1. Cloud sync
2. Team accounts
3. Billing
4. Automated code edits
5. Auto-fix mode
6. Hosted API
7. Mobile app

---

# 29. Implementation Phases

## Phase 0: Repository Setup

Deliverables:

- Electron + React + TypeScript scaffold
- Tailwind configured
- shadcn/ui configured
- SQLite + Drizzle configured
- Basic routing
- Basic shell layout

Acceptance:

- App launches on Windows.
- Dashboard route loads.
- Database initializes.

## Phase 1: Project Registry

Deliverables:

- Add Project button
- Folder picker
- Project table
- Project detail route
- Edit project metadata
- Archive/remove project

Acceptance:

- User can add local folder.
- Project persists after restart.

## Phase 2: Scanner

Deliverables:

- File tree walker
- Ignore rules
- Stack detection
- Important file detection
- Safe env variable extraction
- Scan result storage

Acceptance:

- Scan works on Next.js, React, Python, and Supabase projects.

## Phase 3: Memory System

Deliverables:

- Generate `memory.md`
- Memory preview
- Memory editor
- Version history
- Write confirmation

Acceptance:

- App creates `memory.md` safely.
- Existing file is not overwritten without approval.

## Phase 4: AI Provider MVP

Deliverables:

- AI provider settings
- Provider interface
- OpenAI or Anthropic provider
- Test connection
- Project summary generation

Acceptance:

- User can configure provider.
- App can generate AI project summary.

## Phase 5: Audit Engine MVP

Deliverables:

- Audit run UI
- Basic architecture audit
- Basic security audit
- Findings table
- Audit score
- Generated next prompt

Acceptance:

- User can run read-only audit.
- Findings are saved and displayed.

## Phase 6: Polish and Packaging

Deliverables:

- Windows installer
- App icon
- Error handling
- Empty states
- Loading states
- Auto-update placeholder
- Documentation

Acceptance:

- App can be installed and launched on Windows.

---

# 30. Claude Code Build Instructions

Use Claude Code to build this in small phases. Do not ask it to build the whole product in one pass.

## 30.1 Master Prompt for Claude Code

```md
You are building a Windows desktop application called VibeOps.

VibeOps is a local-first project intelligence app for organizing AI/vibe-coded software projects. It scans local project folders, detects the stack, generates memory.md files, runs read-only audits, and creates safe prompts for Claude Code, Codex, and OpenCode.

Tech stack:
- Electron
- React
- TypeScript
- Tailwind CSS
- shadcn/ui
- SQLite
- Drizzle ORM
- Node worker for scanning

Security rules:
- Renderer must not have direct filesystem access.
- Use a secure preload bridge.
- Context isolation must be enabled.
- Node integration must be disabled in renderer.
- Do not read or store raw .env values.
- Do not delete files.
- Ask before writing memory.md.
- No shell command execution in MVP.

Build Phase 0 only:
1. Create app shell.
2. Add sidebar navigation.
3. Add dashboard page.
4. Configure SQLite/Drizzle.
5. Create project schema.
6. Add placeholder Project Workspace table.

Before editing, inspect the repository and propose the folder architecture.
After editing, summarize all changed files.
```

## 30.2 Phase 1 Prompt

```md
Implement Phase 1: Project Registry.

Requirements:
- Add Project button.
- Use native folder picker through Electron main process.
- Save project name and local path to SQLite.
- Prevent duplicate paths.
- Display projects in dashboard table.
- Add project detail page.
- Allow edit project metadata.
- Allow remove from VibeOps without deleting files.

Security:
- Renderer cannot directly access filesystem.
- All folder selection must go through approved IPC.
- Do not scan project yet.
```

## 30.3 Phase 2 Prompt

```md
Implement Phase 2: Project Scanner.

Requirements:
- Create Node scanner service.
- Walk project tree safely.
- Ignore node_modules, .git, .next, dist, build, coverage, .env, .env.local.
- Detect package manager.
- Detect frameworks.
- Detect important files.
- Extract environment variable names only from .env.example files.
- Store scan result in SQLite.
- Display scan summary on project detail page.

Do not send anything to AI yet.
Do not read raw .env values.
Do not run shell commands.
```

## 30.4 Phase 3 Prompt

```md
Implement Phase 3: memory.md Generator.

Requirements:
- Add Memory tab to project detail page.
- Generate memory.md content from project metadata and scan result.
- Preview memory before writing.
- Ask for confirmation before writing file.
- If memory.md exists, show options: View Existing, Merge, Replace, Cancel.
- Save every generated memory version to SQLite.
- Add markdown viewer/editor.

Do not overwrite files without confirmation.
```

## 30.5 Phase 4 Prompt

```md
Implement Phase 4: AI Provider MVP.

Requirements:
- Create AIProvider interface.
- Add Settings page for provider config.
- Support one provider first: OpenAI or Anthropic.
- Store API key securely if possible; otherwise warn user it is stored locally.
- Add Test Connection button.
- Add function generateProjectSummary(projectId).
- Use scan summaries, not full codebase, for first AI call.
- Redact secrets.

Do not add autonomous code editing.
```

## 30.6 Phase 5 Prompt

```md
Implement Phase 5: Read-Only Audit MVP.

Requirements:
- Add Audits tab.
- Add Run Audit button.
- Audit should include architecture, security, dependency, product completeness, and vibe-code quality sections.
- Save audit run to SQLite.
- Save findings to SQLite.
- Show severity badges.
- Generate an overall score.
- Generate a recommended next action.
- Generate a Claude Code/Codex prompt for the top issue.

Read-only only.
Do not modify project files.
Do not run shell commands.
```

---

# 31. Codex Review Prompts

Use Codex as a second-pass reviewer after each phase.

## 31.1 Security Review Prompt

```md
Review this Electron + React + TypeScript app for security.

Focus on:
- Electron context isolation
- Node integration
- IPC exposure
- Filesystem access
- Secret handling
- Markdown rendering safety
- Local database handling
- Shell command risks

Do not modify files.
Return a prioritized list of issues and recommended fixes.
```

## 31.2 Architecture Review Prompt

```md
Review the architecture of this VibeOps app.

Focus on:
- Separation between renderer, main process, preload, and local worker
- Database schema quality
- Maintainability
- TypeScript organization
- Scalability for future AI providers
- Scanner design

Do not modify files.
Return what is good, what is risky, and what should be refactored before the next phase.
```

## 31.3 Code Quality Review Prompt

```md
Audit this codebase for maintainability.

Look for:
- Duplicated components
- Weak typing
- Overly large files
- Mixed concerns
- Poor error handling
- Missing loading states
- Inconsistent naming
- Dead code

Do not modify files.
Return prioritized recommendations.
```

---

# 32. Testing Requirements

## 32.1 Unit Tests

Test:

- Scanner ignore rules
- Framework detection
- Package manager detection
- Env variable extraction
- Memory generation
- Audit scoring
- Prompt generation

## 32.2 Integration Tests

Test:

- Add project flow
- Scan project flow
- Generate memory flow
- Save audit flow
- Read project detail flow

## 32.3 Manual Test Projects

Create sample projects:

- Next.js + Supabase
- React + Vite
- Python FastAPI
- Electron app
- React Native / Expo

Use these to test detection logic.

---

# 33. Packaging Requirements

## 33.1 Windows Installer

MVP should produce:

- `.exe` installer
- App shortcut
- App icon
- Local data folder
- Uninstall support

## 33.2 Local Data Path

Use Windows app data path:

```text
%APPDATA%/VibeOps
```

Store:

```text
vibeops.db
logs/
backups/
indexes/
settings.json
```

## 33.3 Logs

App should keep local logs for:

- Scan errors
- AI provider errors
- File write errors
- Database migration errors

Do not log secrets.

---

# 34. Success Metrics

## 34.1 MVP Success Criteria

The MVP is successful when:

1. User can add at least 20 local projects.
2. App scans projects without reading secrets.
3. App generates useful `memory.md` files.
4. App identifies stack and important files accurately.
5. App runs read-only audits.
6. App generates useful next-step prompts.
7. App feels faster and easier than manually opening each repo.

## 34.2 Product Quality Metrics

- Time to add project: under 30 seconds
- Time to scan medium project: under 2 minutes
- Dashboard load time: under 2 seconds
- Memory generation usefulness: user rates 4/5 or better
- Audit findings usefulness: user rates 4/5 or better

---

# 35. Future Roadmap

## V1.1

- Project chat
- Git status
- Prompt history
- Task board
- Better audit scoring
- Export handoff docs

## V1.2

- Claude Agent SDK integration
- Codex SDK integration
- OpenAI Agents SDK integration
- AI provider comparison
- Cost tracking
- File-level semantic search

## V2

- Background project watching
- Auto-refresh memory after Git commits
- Compare audits over time
- Generate release notes
- Generate client handoff reports
- Generate investor/product summaries

## V3

- Optional cloud sync
- Team workspaces
- Shared project library
- Role permissions
- Hosted project dashboard
- Commercial SaaS offering

---

# 36. Final MVP Definition

The MVP is complete when a user can:

1. Install VibeOps on Windows.
2. Add local software projects.
3. View all projects in a polished dashboard.
4. Scan each project safely.
5. Detect stack and important files.
6. Generate and write a `memory.md` file.
7. Run a read-only audit.
8. View audit findings.
9. Generate a safe Claude Code/Codex prompt.
10. Resume work on an old project with clear context.

The first release should focus on making the user say:

> “I can finally see all my AI-built apps, understand what state they are in, and know exactly what to do next.”

