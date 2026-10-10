import { cn } from '@/lib/cn';

export function Skeleton({ className }: { className?: string }): JSX.Element {
  return <div className={cn('sf-skeleton h-3.5 w-full', className)} aria-hidden />;
}

export function SkeletonText({ lines = 3, className }: { lines?: number; className?: string }): JSX.Element {
  return (
    <div className={cn('space-y-2', className)} aria-hidden>
      {Array.from({ length: lines }).map((_, index) => (
        <Skeleton key={index} className={index === lines - 1 ? 'w-2/3' : 'w-full'} />
      ))}
    </div>
  );
}
