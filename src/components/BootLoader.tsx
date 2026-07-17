import React, { useEffect, useState } from 'react';

interface BootLoaderProps {
  onBootComplete: () => void;
}

export default function BootLoader({ onBootComplete }: BootLoaderProps) {
  const [stars, setStars] = useState<Array<{
    id: number;
    size: string;
    left: string;
    top: string;
    moveX: string;
    moveY: string;
    duration: string;
    moveDuration: string;
    delay: string;
  }>>([]);

  const [phase, setPhase] = useState<'init' | 'reveal-logo' | 'reveal-text' | 'zoom-through' | 'done'>('init');

  useEffect(() => {
    const generatedStars = [];
    for (let i = 0; i < 150; i++) {
      generatedStars.push({
        id: i,
        size: (Math.random() * 2 + 1) + 'px',
        left: (Math.random() * 100) + '%',
        top: (Math.random() * 100) + '%',
        moveX: (Math.random() * 200 - 100) + 'px',
        moveY: (Math.random() * 200 - 100) + 'px',
        duration: (Math.random() * 4 + 3) + 's',
        moveDuration: (Math.random() * 12 + 15) + 's',
        delay: (Math.random() * 3) + 's'
      });
    }
    setStars(generatedStars);
  }, []);

  useEffect(() => {
    // Timing sequence for background fade
    const t1 = setTimeout(() => setPhase('reveal-logo'), 100);
    const t2 = setTimeout(() => setPhase('reveal-text'), 1600);
    const t3 = setTimeout(() => setPhase('zoom-through'), 2800);  // Start the background fade
    const t4 = setTimeout(() => {
      setPhase('done');
      onBootComplete();
    }, 4400);  
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); clearTimeout(t4); };
  }, [onBootComplete]);

  const isZooming = phase === 'zoom-through' || phase === 'done';

  return (
    <div
      className="fixed inset-0 z-[5] overflow-hidden select-none pointer-events-none"
      style={{
        opacity: isZooming ? 0 : 1,
        transition: 'opacity 1.6s ease-in-out',
      }}
    >
      {/* BACKGROUND LAYER that fades out to reveal the slideshow */}
      <div
        className="absolute inset-0"
        style={{
          backgroundColor: '#030304',
        }}
      >
        {/* Star Particles */}
        <div className="absolute inset-0 pointer-events-none opacity-40">
          {stars.map((star) => (
            <div
              key={star.id}
              className="star-particle bg-white rounded-full absolute"
              style={{
                width: star.size,
                height: star.size,
                left: star.left,
                top: star.top,
                '--moveX': star.moveX,
                '--moveY': star.moveY,
                '--duration': star.duration,
                '--move-duration': star.moveDuration,
                '--delay': star.delay,
              } as React.CSSProperties}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
