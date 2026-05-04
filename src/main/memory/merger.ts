import { USER_BLOCK_OPEN, USER_BLOCK_CLOSE } from './template';

const SECTION_BODY_RE = /<!-- vibeops:section:([a-z-]+) -->([\s\S]*?)<!-- \/vibeops:section:\1 -->/g;

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const USER_BLOCK_RE = new RegExp(
  `${escapeRe(USER_BLOCK_OPEN)}([\\s\\S]*?)${escapeRe(USER_BLOCK_CLOSE)}`,
  'g'
);

export function extractSectionBodies(markdown: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const match of markdown.matchAll(SECTION_BODY_RE)) {
    const id = match[1];
    const body = match[2] ?? '';
    if (id) out.set(id, body);
  }
  return out;
}

function extractUserBlock(sectionBody: string): string | null {
  const m = USER_BLOCK_RE.exec(sectionBody);
  USER_BLOCK_RE.lastIndex = 0;
  return m ? (m[1] ?? '').trim() : null;
}

export function mergeUserEditableBlocks(fresh: string, existing: string): string {
  if (existing.trim().length === 0) return fresh;
  const existingSections = extractSectionBodies(existing);
  if (existingSections.size === 0) return fresh;

  return fresh.replace(SECTION_BODY_RE, (whole, id: string, body: string) => {
    if (!body.includes(USER_BLOCK_OPEN)) return whole;
    const existingBody = existingSections.get(id);
    if (!existingBody) return whole;
    const userBlock = extractUserBlock(existingBody);
    if (userBlock === null || userBlock.length === 0) return whole;
    const replaced = body.replace(
      USER_BLOCK_RE,
      `${USER_BLOCK_OPEN}\n${userBlock}\n${USER_BLOCK_CLOSE}`
    );
    return `<!-- vibeops:section:${id} -->${replaced}<!-- /vibeops:section:${id} -->`;
  });
}
