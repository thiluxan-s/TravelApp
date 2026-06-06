import type { Annotation } from '@/lib/itinerary/types';

export function AnnotationPill({ annotation }: { annotation: Annotation }) {
  const isConflict = annotation.kind === 'conflict';
  return (
    <div className="flex justify-center py-1">
      <span
        className={
          isConflict
            ? 'inline-flex items-center gap-1.5 rounded-full border border-destructive/60 bg-destructive/10 px-3 py-1 text-xs text-destructive'
            : 'inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/50 px-3 py-1 text-xs text-muted-foreground'
        }
      >
        {isConflict && <span aria-hidden>⚠</span>}
        {annotation.message}
      </span>
    </div>
  );
}
