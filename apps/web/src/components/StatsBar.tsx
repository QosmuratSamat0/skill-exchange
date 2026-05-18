import { CheckCircle, Star, Users } from 'lucide-react';
import type { MatchStats } from '@/types/index';

interface StatsBarProps {
  stats: MatchStats | null;
}

export function StatsBar({ stats }: StatsBarProps) {
  const total = stats?.total_matches ?? 0;
  const accepted = stats?.accepted_count ?? 0;
  const rating = stats?.rating ?? 0;

  return (
    <div className="hidden items-center gap-2 md:flex">
      <div className="flex items-center gap-2 rounded-lg border border-white/5 bg-zinc-900/70 px-3 py-1.5">
        <Users className="h-4 w-4 text-blue-400" />
        <span className="text-xs text-zinc-400">Обменов</span>
        <span className="text-sm font-bold text-zinc-50">{total}</span>
      </div>
      <div className="flex items-center gap-2 rounded-lg border border-white/5 bg-zinc-900/70 px-3 py-1.5">
        <CheckCircle className="h-4 w-4 text-emerald-400" />
        <span className="text-xs text-zinc-400">Принято</span>
        <span className="text-sm font-bold text-emerald-300">{accepted}</span>
      </div>
      <div className="flex items-center gap-2 rounded-lg border border-white/5 bg-zinc-900/70 px-3 py-1.5">
        <Star className="h-4 w-4 fill-amber-400/30 text-amber-400" />
        <span className="text-xs text-zinc-400">Рейтинг</span>
        <span className="text-sm font-bold text-zinc-50">
          {rating > 0 ? rating.toFixed(1) : '—'}
        </span>
      </div>
    </div>
  );
}
