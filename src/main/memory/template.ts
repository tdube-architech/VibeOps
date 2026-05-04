export const USER_BLOCK_OPEN = '<!-- vibeops:user-editable -->';
export const USER_BLOCK_CLOSE = '<!-- /vibeops:user-editable -->';

export interface MemorySectionMeta {
  id: string;
  title: string;
  userEditable: boolean;
}

export const MEMORY_SECTIONS: readonly MemorySectionMeta[] = [
  { id: 'identity', title: '1. Project Identity', userEditable: false },
  { id: 'summary', title: '2. Product Summary', userEditable: true },
  { id: 'users', title: '3. Primary Users', userEditable: true },
  { id: 'stack', title: '4. Current Stack', userEditable: false },
  { id: 'architecture', title: '5. Architecture Overview', userEditable: true },
  { id: 'directories', title: '6. Key Directories', userEditable: false },
  { id: 'files', title: '7. Key Files', userEditable: false },
  { id: 'database', title: '8. Database / Schema Notes', userEditable: true },
  { id: 'apis', title: '9. APIs and Integrations', userEditable: true },
  { id: 'env', title: '10. Environment Variables', userEditable: false },
  { id: 'security', title: '11. Security Notes', userEditable: true },
  { id: 'deployment', title: '12. Deployment Notes', userEditable: true },
  { id: 'issues', title: '13. Known Issues', userEditable: true },
  { id: 'debt', title: '14. Technical Debt', userEditable: true },
  { id: 'roadmap', title: '15. Product Roadmap', userEditable: true },
  { id: 'lastAudit', title: '16. Last Audit Summary', userEditable: false },
  { id: 'aiInstructions', title: '17. Instructions for Future AI Agents', userEditable: true }
];

export function sectionAnchor(id: string): string {
  return `<!-- vibeops:section:${id} -->`;
}

export function sectionAnchorEnd(id: string): string {
  return `<!-- /vibeops:section:${id} -->`;
}

export function wrapUserEditable(body: string): string {
  return `${USER_BLOCK_OPEN}\n${body.trim()}\n${USER_BLOCK_CLOSE}`;
}
