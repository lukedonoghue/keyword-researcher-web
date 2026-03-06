export function PhaseRow({ label, active, done }: { label: string; active: boolean; done: boolean }) {
  return (
    <div className="flex items-center gap-2">
      {done ? (
        <div className="animate-check-pop">
          <svg width="14" height="14" viewBox="0 0 12 12" className="text-green-500">
            <path d="M2.5 6L5 8.5L9.5 4" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" />
          </svg>
        </div>
      ) : active ? (
        <div className="h-3.5 w-3.5 animate-spin rounded-full border border-brand-accent border-t-transparent" />
      ) : (
        <div className="h-3.5 w-3.5 rounded-full border border-border" />
      )}
      <span className={`text-xs ${active ? 'text-foreground font-medium' : done ? 'text-muted-foreground' : 'text-muted-foreground/60'}`}>
        {label}
      </span>
    </div>
  );
}
