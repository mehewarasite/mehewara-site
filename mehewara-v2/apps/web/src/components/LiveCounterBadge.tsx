import React from 'react';
import { useSmoothCounter } from '../hooks/useSmoothCounter';

interface LiveCounterBadgeProps {
  count: number;
  variant?: 'compact' | 'header' | 'card';
  className?: string;
  showLabel?: boolean;
}

export const LiveCounterBadge: React.FC<LiveCounterBadgeProps> = ({
  count,
  variant = 'compact',
  className = '',
  showLabel = true,
}) => {
  const { displayedValue, isAnimating } = useSmoothCounter(count, 800);

  if (variant === 'card') {
    return (
      <div className={`flex items-baseline gap-2 ${className}`}>
        <span
          className={`font-display font-black tracking-tight tabular-nums transition-transform duration-300 ${
            isAnimating ? 'scale-105 text-emerald-400' : ''
          }`}
        >
          {displayedValue}
        </span>
      </div>
    );
  }

  return (
    <div
      title={`Live: ${displayedValue} ${displayedValue === 1 ? 'user' : 'users'} active on Mehewara`}
      className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-semibold select-none border transition-all duration-300 ${
        variant === 'header'
          ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-500 hover:bg-emerald-500/15'
          : 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
      } ${className}`}
    >
      {/* Real-time radar pulsing beacon */}
      <span className="relative flex h-2 w-2 shrink-0">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
        <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.8)]" />
      </span>

      {showLabel && (
        <span className="text-[11px] font-medium tracking-wide text-emerald-500/90 hidden sm:inline">
          Live:
        </span>
      )}

      {/* Smoothly animated tabular number */}
      <span
        className={`font-mono font-bold tabular-nums transition-all duration-200 ${
          isAnimating ? 'text-emerald-300 scale-110' : 'text-emerald-400'
        }`}
      >
        {displayedValue}
      </span>
    </div>
  );
};

export default LiveCounterBadge;
