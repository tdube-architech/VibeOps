# VibeOps rule-pack generator

Builds, signs, and publishes the rule pack consumed by the VibeOps audit engine.
Runs on the maintainer side. Customers never run this.

## One-time setup

```bash
cd tools/rule-pack-generator
pnpm install
pnpm gen:keypair
```

`gen:keypair` writes to `keypair.out/`:

- `public.b64` — embed as `RULE_PACK_PUBLIC_KEY_B64` in `src/main/audit/rule-pack/pubkey.ts`. Commit.
- `private.b64` — paste into GitHub Actions secret `VIBEOPS_PACK_PRIVATE_KEY`. Then DELETE the local file.
- `pubkey.ts` — copy verbatim to `src/main/audit/rule-pack/pubkey.ts`.

## Manual run

```bash
# dry-run, skip AI to save tokens
pnpm gen:pack --dry-run --no-ai

# real run, publish to GitHub Releases
GITHUB_REPOSITORY=youruser/vibeops VIBEOPS_PACK_PRIVATE_KEY=<b64> ANTHROPIC_API_KEY=<key> \
  pnpm gen:pack --publish
```

Flags: `--dry-run`, `--no-ai`, `--no-osv`, `--no-ghsa`, `--publish`,
`--out <dir>`, `--version YYYY.MM.DD`, `--key-env <ENV_NAME>`.

## Sources merged

1. Manual seed — `resources/rule-packs/builtin.json` (curated 51).
2. OSV.dev — popular npm packages, severity ≥ medium.
3. GitHub Security Advisories — npm ecosystem, sorted by published.
4. AI patterns — Claude generates regex/pattern rules per CWE topic, validated.

Dedup by id. Validator runs ReDoS bench (50ms budget) on every regex.

## Output

- `packs-out/vibeops-pack-YYYY.MM.DD.json` — signed pack (consumer asset).
- `packs-out/latest.json` — small manifest pointer with `sha256`, `signature`, download URL.

## Publishing

`gh release create` creates tag `rule-pack-YYYY.MM.DD`, uploads pack + manifest.
Also overwrites `rule-pack-latest` release with just the manifest, so clients
have a stable URL to poll.

## Cron

`.github/workflows/rule-pack-publish.yml` runs Mondays 06:00 UTC.
Manual `workflow_dispatch` supports `dry_run` + `no_ai` inputs.

## Validation

`pnpm validate <pack.json>` checks schema + regex compilability + ReDoS budget.
Add `--pubkey-env VIBEOPS_PACK_PUBLIC_KEY` to also verify signature.
