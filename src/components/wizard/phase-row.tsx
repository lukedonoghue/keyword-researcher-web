export function PhaseRow({ label, active, done }: { label: string; active: boolean; done: boolean }) {
  return (
    <div className="flex items-center gap-2">
      {done ? (
        <svg width="12" height="12" viewBox="0 0 12 12" className="text-green-500">
          <path d="M2.5 6L5 8.5L9.5 4" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" />
        </svg>
      ) : active ? (
        <div className="h-3 w-3 animate-spin rounded-full border border-primary border-t-transparent" />
      ) : (
        <div className="h-3 w-3 rounded-full border border-border" />
      )}
      <span className={`text-xs ${active ? 'text-foreground font-medium' : done ? 'text-muted-foreground' : 'text-muted-foreground/60'}`}>
        {label}
      </span>
    </div>
  );
}
