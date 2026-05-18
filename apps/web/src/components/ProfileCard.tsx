import { Send, Star } from 'lucide-react';
import { clsx } from 'clsx';
import { SkillTag } from './SkillTag';
import type { MatchProfile } from '@/types/index';

interface ProfileCardProps {
  profile: MatchProfile;
  onSendRequest: (userId: string) => void;
  isLoading?: boolean;
  onClick?: () => void;
}

function getInitials(name: string) {
  return name
    .split(' ')
    .filter(Boolean)
    .map((word) => word[0])
    .join('')
    .toUpperCase()
    .slice(0, 2) || '??';
}

export function ProfileCard({ profile, onSendRequest, isLoading, onClick }: ProfileCardProps) {
  const name = profile.name || 'Без имени';
  const teachSkills = profile.i_have ?? [];
  const learnSkills = profile.i_want ?? [];
  const match = Math.max(64, Math.min(96, 72 + ((teachSkills.length + learnSkills.length) % 5) * 5));

  return (
    <div
      className="group cursor-pointer rounded-2xl border border-white/5 bg-zinc-900 p-5 transition-all duration-150 hover:-translate-y-0.5 hover:border-white/10 hover:bg-zinc-900/90"
      onClick={onClick}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-12 w-12 shrink-0 select-none items-center justify-center rounded-full border border-white/5 bg-gradient-to-br from-blue-500 to-emerald-500 text-base font-bold text-white">
            {getInitials(name)}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="truncate text-base font-semibold leading-tight text-zinc-50">{name}</h3>
              <span className="h-2 w-2 shrink-0 rounded-full bg-emerald-500" aria-label="online" />
            </div>
            <p className="mt-1 text-xs text-zinc-500">Skill exchanger</p>
          </div>
        </div>

        <div className="shrink-0 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-1 text-xs font-semibold text-emerald-300">
          {match}% match
        </div>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl bg-zinc-800/40 p-3">
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Учит</p>
          <div className="flex flex-wrap gap-1.5">
            {teachSkills.length ? (
              teachSkills.slice(0, 4).map((skill) => (
                <SkillTag key={skill} skill={skill} variant="teach" />
              ))
            ) : (
              <span className="text-xs text-zinc-500">Не указано</span>
            )}
          </div>
        </div>
        <div className="rounded-xl bg-zinc-800/40 p-3">
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Изучает</p>
          <div className="flex flex-wrap gap-1.5">
            {learnSkills.length ? (
              learnSkills.slice(0, 4).map((skill) => (
                <SkillTag key={skill} skill={skill} variant="learn" />
              ))
            ) : (
              <span className="text-xs text-zinc-500">Не указано</span>
            )}
          </div>
        </div>
      </div>

      {profile.bio ? (
        <p className="mt-4 line-clamp-2 text-sm leading-relaxed text-zinc-400">{profile.bio}</p>
      ) : (
        <p className="mt-4 text-sm leading-relaxed text-zinc-500">
          Пока нет описания, но навыки уже готовы к обмену.
        </p>
      )}

      <div className="mt-4 flex items-center justify-between gap-3">
        {profile.rating != null && profile.rating > 0 ? (
          <div className="flex items-center gap-1 text-xs text-zinc-400">
            <Star className="h-3.5 w-3.5 fill-amber-400/50 text-amber-400" />
            {profile.rating.toFixed(1)}
          </div>
        ) : (
          <span className="text-xs text-zinc-500">Новый участник</span>
        )}

        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onSendRequest(profile.user_id);
          }}
          disabled={isLoading}
          className={clsx(
            'inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-3.5 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-500 active:bg-blue-700',
            'disabled:cursor-not-allowed disabled:opacity-50',
          )}
        >
          <Send className="h-4 w-4" />
          Запросить обмен
        </button>
      </div>
    </div>
  );
}
