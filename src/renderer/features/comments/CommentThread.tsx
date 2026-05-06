import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { MessageSquare, Send, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useActiveWorkspaceId } from '@/features/workspaces/useWorkspaces';
import { useAuth } from '@/features/auth/useAuth';
import { getSupabase } from '@/lib/supabase';
import {
  createComment, deleteComment, listComments, type CommentTarget
} from '@/lib/data/comments';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface Props {
  target: CommentTarget;
  targetId: string;
}

function relativeTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const s = Math.floor(ms / 1000);
  if (s < 60) return 'just now';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function initials(email: string): string {
  const local = email.split('@')[0] ?? email;
  return ((local[0] ?? 'U') + (local.split(/[._-]/)[1]?.[0] ?? '')).toUpperCase().slice(0, 2);
}

export function CommentThread({ target, targetId }: Props) {
  const wsId = useActiveWorkspaceId();
  const { state } = useAuth();
  const qc = useQueryClient();
  const [body, setBody] = useState('');

  const isCloud = UUID_RE.test(targetId);
  const enabled = isCloud && state?.status === 'authenticated';

  const key = ['comments', target, targetId] as const;

  const { data: comments = [] } = useQuery({
    queryKey: key,
    queryFn: () => listComments(target, targetId),
    enabled
  });

  // realtime subscribe to comments for this target
  useEffect(() => {
    if (!enabled) return;
    const supabase = getSupabase();
    const ch = supabase
      .channel(`comments-${target}-${targetId}`)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'comments', filter: `target_id=eq.${targetId}` },
        () => qc.invalidateQueries({ queryKey: key }))
      .subscribe();
    return () => { void supabase.removeChannel(ch); };
  }, [enabled, target, targetId, qc]);

  const create = useMutation({
    mutationFn: (b: string) => createComment(wsId!, target, targetId, b),
    onSuccess: () => { setBody(''); qc.invalidateQueries({ queryKey: key }); }
  });
  const remove = useMutation({
    mutationFn: (id: string) => deleteComment(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: key })
  });

  if (!isCloud) {
    return (
      <div className="text-xs text-muted-foreground italic">
        Migrate this project to the cloud to enable comments.
      </div>
    );
  }
  if (!enabled) return null;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-1 text-xs text-muted-foreground">
        <MessageSquare className="h-3 w-3" /> {comments.length} {comments.length === 1 ? 'comment' : 'comments'}
      </div>
      <div className="space-y-2">
        {comments.map((c) => (
          <div key={c.id} className="flex gap-2 rounded-md border border-border/50 px-3 py-2 text-sm">
            <div className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-secondary text-[10px] font-bold">
              {initials(c.authorEmail)}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 text-xs">
                <span className="font-medium">{c.authorDisplayName ?? c.authorEmail.split('@')[0]}</span>
                <span className="text-muted-foreground">{relativeTime(c.createdAt)}</span>
                {c.authorUserId === state?.user?.id && (
                  <button
                    onClick={() => remove.mutate(c.id)}
                    className="ml-auto text-muted-foreground hover:text-destructive"
                    title="Delete"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                )}
              </div>
              <div className="mt-0.5 whitespace-pre-wrap">{c.body}</div>
            </div>
          </div>
        ))}
      </div>
      <div className="flex gap-2">
        <Textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Add a comment…"
          className="min-h-[56px] flex-1"
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && body.trim()) {
              create.mutate(body.trim());
            }
          }}
        />
        <Button
          onClick={() => create.mutate(body.trim())}
          disabled={!body.trim() || create.isPending}
        >
          <Send className="h-4 w-4" /> Send
        </Button>
      </div>
    </div>
  );
}
