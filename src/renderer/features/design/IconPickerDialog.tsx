import { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  TECH_LIBRARY, CATEGORY_META, iconUrl, searchTech,
  type TechCategory, type TechEntry
} from './techLibrary';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onPick: (entry: TechEntry) => void;
  /** Constrain the picker to a single category, or null to allow all. */
  category?: TechCategory | null;
}

export function IconPickerDialog({ open, onOpenChange, onPick, category }: Props) {
  const [query, setQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState<TechCategory | null>(category ?? null);

  const results = searchTech(query, activeCategory ?? undefined);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Pick an icon</DialogTitle>
          <DialogDescription>
            Choose a technology to apply its logo + colour to this block. Selecting also updates the
            block label.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <Input
            placeholder="Search react, postgres, kafka…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoFocus
          />

          <div className="flex flex-wrap gap-1">
            <Button
              size="sm"
              variant={activeCategory === null ? 'default' : 'outline'}
              onClick={() => setActiveCategory(null)}
            >
              All
            </Button>
            {(Object.keys(CATEGORY_META) as TechCategory[]).map((c) => (
              <Button
                key={c}
                size="sm"
                variant={activeCategory === c ? 'default' : 'outline'}
                onClick={() => setActiveCategory(c)}
              >
                {CATEGORY_META[c].label}
              </Button>
            ))}
          </div>

          <div className="grid max-h-[420px] grid-cols-3 gap-2 overflow-auto rounded-md border border-border p-2 sm:grid-cols-4 md:grid-cols-5">
            {results.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => { onPick(t); onOpenChange(false); }}
                className="flex flex-col items-center gap-1 rounded-md border border-border bg-background/40 p-2 text-xs hover:border-foreground"
                title={t.label}
              >
                {t.iconSlug ? (
                  <img
                    src={iconUrl(t.iconSlug, t.color)}
                    alt=""
                    className="h-8 w-8"
                    draggable={false}
                    onError={(e) => {
                      const img = e.currentTarget;
                      const fallback = document.createElement('div');
                      fallback.className = 'h-8 w-8 rounded grid place-items-center text-[10px] uppercase';
                      fallback.style.background = '#1f2937';
                      fallback.style.color = `#${t.color}`;
                      fallback.textContent = t.id.slice(0, 3);
                      img.replaceWith(fallback);
                    }}
                  />
                ) : (
                  <div
                    className="h-8 w-8 rounded grid place-items-center text-[10px] uppercase"
                    style={{ background: '#1f2937', color: `#${t.color}` }}
                  >
                    {t.id.slice(0, 3)}
                  </div>
                )}
                <span className="truncate w-full text-center font-medium">{t.label}</span>
                <span className="text-[10px] uppercase text-muted-foreground">
                  {CATEGORY_META[t.category].label}
                </span>
              </button>
            ))}
            {results.length === 0 && (
              <div className="col-span-full text-center text-xs text-muted-foreground">
                No matches. Try a different keyword.
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export { TECH_LIBRARY };
