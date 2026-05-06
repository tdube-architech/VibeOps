import { useEffect, useState } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { iconUrl, CATEGORY_META, type TechCategory } from './techLibrary';

export interface TechBlockData extends Record<string, unknown> {
  label?: string;
  iconSlug?: string | null;
  iconColor?: string | null;
  category?: TechCategory;
}

interface Props extends NodeProps {
  data: TechBlockData;
  /** Notified when the user edits the label inline. */
  onLabelChange?: (id: string, label: string) => void;
  /** Open the icon picker dialog targeted at this node. */
  onOpenIconPicker?: (id: string) => void;
}

export function TechBlockNode({ id, data, selected, onLabelChange, onOpenIconPicker }: Props) {
  const category = (data.category ?? 'service') as TechCategory;
  const meta = CATEGORY_META[category];
  const tone = `#${data.iconColor ?? meta.color}`;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(data.label ?? meta.label);

  useEffect(() => { setDraft(data.label ?? meta.label); }, [data.label, meta.label]);

  const commit = (): void => {
    const next = draft.trim() || meta.label;
    setEditing(false);
    if (next !== (data.label ?? meta.label)) onLabelChange?.(id, next);
  };

  const isNote = category === 'note';

  return (
    <div
      className="rounded-lg border bg-[#0a0a0b] text-foreground shadow-sm"
      style={{
        borderColor: tone,
        borderWidth: selected ? 2 : 1,
        minWidth: isNote ? 180 : 160
      }}
    >
      <Handle type="target" position={Position.Left} style={{ background: tone }} />
      <Handle type="source" position={Position.Right} style={{ background: tone }} />

      <div className="flex items-center gap-2 px-2 py-1.5">
        {!isNote && (
          <button
            type="button"
            className="grid h-8 w-8 place-items-center rounded bg-black/40 hover:bg-black/60"
            onClick={(e) => { e.stopPropagation(); onOpenIconPicker?.(id); }}
            title="Change icon"
          >
            {data.iconSlug ? (
              <img
                src={iconUrl(data.iconSlug, (data.iconColor ?? meta.color) as string)}
                alt=""
                className="h-5 w-5"
                draggable={false}
                onError={(e) => {
                  // Slug missing on simpleicons → fall back to the category-coloured tile.
                  const img = e.currentTarget;
                  const parent = img.parentElement;
                  img.remove();
                  if (parent) {
                    const span = document.createElement('span');
                    span.className = 'text-[10px] uppercase';
                    span.style.color = tone;
                    span.textContent = category.slice(0, 3);
                    parent.appendChild(span);
                  }
                }}
              />
            ) : (
              <span className="text-[10px] uppercase" style={{ color: tone }}>
                {category.slice(0, 3)}
              </span>
            )}
          </button>
        )}
        <div className="min-w-0 flex-1">
          <div className="text-[10px] uppercase tracking-wide" style={{ color: tone }}>
            {meta.label}
          </div>
          {editing ? (
            <input
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={commit}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commit();
                if (e.key === 'Escape') { setDraft(data.label ?? meta.label); setEditing(false); }
              }}
              className="w-full bg-transparent text-sm font-medium outline-none"
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            <button
              type="button"
              className="block w-full truncate text-left text-sm font-medium"
              onDoubleClick={(e) => { e.stopPropagation(); setEditing(true); }}
              title="Double-click to rename"
            >
              {data.label ?? meta.label}
            </button>
          )}
        </div>
      </div>

      {isNote && (
        <div className="border-t border-border/40 px-2 py-1 text-[11px] text-muted-foreground">
          Double-click to edit
        </div>
      )}
    </div>
  );
}
