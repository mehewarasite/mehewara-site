import { useState, useEffect, useRef } from 'react';

/**
 * Hook to smoothly interpolate a numeric counter to a target value using requestAnimationFrame.
 * Employs an ease-out cubic curve so number shifts feel natural, organic, and fluid without snapping.
 */
export function useSmoothCounter(targetValue: number, duration: number = 1000): {
  displayedValue: number;
  isAnimating: boolean;
} {
  // Read last known count from localStorage to avoid jarring jump from 1 on reload
  const getInitialValue = (): number => {
    try {
      const saved = localStorage.getItem('mehewara_last_active_count');
      if (saved) {
        const parsed = parseInt(saved, 10);
        if (!isNaN(parsed) && parsed > 0) return parsed;
      }
    } catch {}
    return targetValue || 1;
  };

  const [displayedValue, setDisplayedValue] = useState<number>(getInitialValue);
  const [isAnimating, setIsAnimating] = useState<boolean>(false);
  
  const currentValRef = useRef<number>(displayedValue);
  const animationFrameRef = useRef<number | null>(null);

  // Keep localStorage updated when valid target values arrive
  useEffect(() => {
    if (typeof targetValue === 'number' && targetValue > 0) {
      try {
        localStorage.setItem('mehewara_last_active_count', String(targetValue));
      } catch {}
    }
  }, [targetValue]);

  useEffect(() => {
    const startValue = currentValRef.current;
    const endValue = targetValue;

    if (startValue === endValue) {
      setIsAnimating(false);
      return;
    }

    setIsAnimating(true);
    const startTime = performance.now();

    const animate = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);

      // Ease-out cubic: 1 - (1 - t)^3
      const easeProgress = 1 - Math.pow(1 - progress, 3);
      const nextValue = Math.round(startValue + (endValue - startValue) * easeProgress);

      currentValRef.current = nextValue;
      setDisplayedValue(nextValue);

      if (progress < 1) {
        animationFrameRef.current = requestAnimationFrame(animate);
      } else {
        currentValRef.current = endValue;
        setDisplayedValue(endValue);
        setIsAnimating(false);
      }
    };

    if (animationFrameRef.current !== null) {
      cancelAnimationFrame(animationFrameRef.current);
    }
    animationFrameRef.current = requestAnimationFrame(animate);

    return () => {
      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [targetValue, duration]);

  return { displayedValue, isAnimating };
}
