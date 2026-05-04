import type { AuditFinding, RiskLevel } from '@shared/types';

const RING_COLORS: Record<AuditFinding['severity'], string> = {
  critical: '#ef4444',
  high: '#f59e0b',
  medium: '#eab308',
  low: '#22c55e',
  info: '#64748b'
};

const RISK_COLOR: Record<RiskLevel, string> = {
  Strong: 'text-emerald-500',
  Good: 'text-emerald-400',
  'Needs Work': 'text-amber-500',
  Risky: 'text-orange-500',
  Critical: 'text-red-500'
};

export function AuditScoreDonut({ score, risk, findings }: { score: number; risk: RiskLevel; findings: AuditFinding[] }) {
  const radius = 44;
  const circumference = 2 * Math.PI * radius;
  const counts: Record<AuditFinding['severity'], number> = {
    critical: 0, high: 0, medium: 0, low: 0, info: 0
  };
  for (const f of findings) counts[f.severity]++;
  const total = findings.length || 1;

  let offset = 0;
  const arcs: Array<{ color: string; length: number; offset: number }> = [];
  for (const sev of ['critical', 'high', 'medium', 'low', 'info'] as const) {
    const length = (counts[sev] / total) * circumference;
    arcs.push({ color: RING_COLORS[sev], length, offset });
    offset += length;
  }

  return (
    <div className="flex items-center gap-4">
      <div className="relative inline-flex h-28 w-28 items-center justify-center">
        <svg width="112" height="112" viewBox="0 0 112 112" className="-rotate-90">
          <circle cx="56" cy="56" r={radius} fill="none" stroke="hsl(var(--secondary))" strokeWidth="10" />
          {arcs.map((a, i) => (
            <circle
              key={i}
              cx="56" cy="56" r={radius}
              fill="none"
              stroke={a.color}
              strokeWidth="10"
              strokeDasharray={`${a.length} ${circumference}`}
              strokeDashoffset={-a.offset}
              strokeLinecap="butt"
            />
          ))}
        </svg>
        <div className="absolute flex flex-col items-center">
          <div className={`text-3xl font-semibold ${RISK_COLOR[risk]}`}>{score}</div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{risk}</div>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
        {(['critical', 'high', 'medium', 'low'] as const).map((sev) => (
          <div key={sev} className="flex items-center gap-2">
            <span className="inline-block h-2 w-2 rounded-full" style={{ background: RING_COLORS[sev] }} />
            <span className="capitalize text-muted-foreground">{sev}</span>
            <span className="ml-auto font-medium">{counts[sev]}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
