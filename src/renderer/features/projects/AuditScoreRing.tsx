import type { RiskLevel } from '@shared/types';

const COLORS: Record<RiskLevel, string> = {
  Strong: 'text-emerald-500',
  Good: 'text-emerald-400',
  'Needs Work': 'text-amber-500',
  Risky: 'text-orange-500',
  Critical: 'text-red-500'
};

export function AuditScoreRing({ score, risk }: { score: number; risk: RiskLevel }) {
  const radius = 36;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - score / 100);

  return (
    <div className="relative inline-flex items-center justify-center">
      <svg width="96" height="96" viewBox="0 0 96 96" className="-rotate-90">
        <circle cx="48" cy="48" r={radius} fill="none" stroke="hsl(var(--secondary))" strokeWidth="8" />
        <circle
          cx="48" cy="48" r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth="8"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          className={COLORS[risk]}
        />
      </svg>
      <div className="absolute flex flex-col items-center">
        <div className="text-2xl font-semibold">{score}</div>
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{risk}</div>
      </div>
    </div>
  );
}
