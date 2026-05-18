import { X } from 'lucide-react';
import { clsx } from 'clsx';

interface SkillTagProps {
  skill: string;
  variant: 'teach' | 'learn' | 'neutral';
  onRemove?: () => void;
}

export function SkillTag({ skill, variant, onRemove }: SkillTagProps) {
  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium leading-none transition-colors',
        variant === 'teach' && 'border-emerald-500/20 bg-emerald-500/10 text-emerald-300',
        variant === 'learn' && 'border-blue-500/20 bg-blue-500/10 text-blue-300',
        variant === 'neutral' && 'border-white/5 bg-zinc-800/70 text-zinc-400',
      )}
    >
      {skill}
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          className="ml-0.5 opacity-60 transition-opacity hover:opacity-100"
          aria-label={`Remove ${skill}`}
        >
          <X className="h-3 w-3" />
        </button>
      )}
    </span>
  );
}
