export function UserFooter() {
  return (
    <div className="mt-auto rounded-md border border-border bg-card/40 px-3 py-2">
      <div className="flex items-center gap-2">
        <div className="grid h-8 w-8 place-items-center rounded-full bg-secondary text-xs font-bold">U</div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium truncate">Local User</div>
          <div className="text-xs text-muted-foreground truncate">single-user mode</div>
        </div>
      </div>
    </div>
  );
}
