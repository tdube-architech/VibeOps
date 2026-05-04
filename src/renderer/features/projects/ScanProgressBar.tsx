import type { ScanProgressEvent } from '@shared/scan-events';

const STAGE_LABEL: Record<ScanProgressEvent['stage'], string> = {
  walking: 'Walking project tree',
  classifying: 'Classifying files',
  detecting: 'Detecting stack',
  persisting: 'Saving file inventory',
  summarizing: 'Generating summary',
  completed: 'Completed',
  failed: 'Failed'
};

const STAGE_PCT: Record<ScanProgressEvent['stage'], number> = {
  walking: 20, classifying: 45, detecting: 65, persisting: 80, summarizing: 92, completed: 100, failed: 100
};

export function ScanProgressBar({ event }: { event: ScanProgressEvent | null }) {
  if (!event) return null;
  const pct = STAGE_PCT[event.stage];
  const failed = event.stage === 'failed';
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>{STAGE_LABEL[event.stage]} · {event.filesSeen} files seen</span>
        <span>{pct}%</span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-secondary">
        <div
          className={failed ? 'h-full bg-destructive' : 'h-full bg-primary'}
          style={{ width: `${pct}%`, transition: 'width 250ms ease-out' }}
        />
      </div>
      {event.errorMessage && <div className="text-xs text-destructive">{event.errorMessage}</div>}
    </div>
  );
}
