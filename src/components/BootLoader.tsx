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

  // Sequence: 'init' -> 'reveal-logo' -> 'reveal-text' -> 'zoom-through' -> 'done'
  const [phase, setPhase] = useState<'init' | 'reveal-logo' | 'reveal-text' | 'zoom-through' | 'done'>('init');

  useEffect(() => {
    const generatedStars = [];
    for (let i = 0; i < 60; i++) {
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
    // Timing sequence: reveal → text → cinematic zoom-through → done
    const t1 = setTimeout(() => setPhase('reveal-logo'), 100);
    const t2 = setTimeout(() => setPhase('reveal-text'), 1600);
    const t3 = setTimeout(() => setPhase('zoom-through'), 2800);  // Start the cinematic zoom
    const t4 = setTimeout(() => {
      setPhase('done');
      onBootComplete();
    }, 4400);  // Allow zoom to fully complete
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); clearTimeout(t4); };
  }, [onBootComplete]);

  const isLogoRevealed = phase !== 'init';
  const isTextRevealed = phase === 'reveal-text' || phase === 'zoom-through' || phase === 'done';
  const isZooming = phase === 'zoom-through' || phase === 'done';

  return (
    <div
      className="fixed inset-0 z-[9999] overflow-hidden select-none font-sans"
      style={{
        perspective: '1200px',
        perspectiveOrigin: '50% 50%',
        // When done, hide completely
        pointerEvents: isZooming ? 'none' : 'auto',
      }}
    >
      {/* THE ENTIRE SPLASH LAYER — zooms toward the camera */}
      <div
        className="absolute inset-0 flex flex-col justify-center items-center"
        style={{
          backgroundColor: '#030304',
          transformStyle: 'preserve-3d',
          // The cinematic zoom-through: scale up + translate forward in Z-space + fade
          transform: isZooming
            ? 'scale(3) translate3d(0, 0, 600px)'
            : 'scale(1) translate3d(0, 0, 0)',
          opacity: isZooming ? 0 : 1,
          filter: isZooming ? 'blur(16px)' : 'blur(0px)',
          transition: isZooming
            ? 'transform 1.8s cubic-bezier(0.22, 1, 0.36, 1), opacity 1.6s cubic-bezier(0.4, 0, 1, 1) 0.3s, filter 1.4s cubic-bezier(0.22, 1, 0.36, 1)'
            : 'none',
          willChange: 'transform, opacity, filter',
        }}
      >
        {/* Ambient Background Glow */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            opacity: isLogoRevealed ? 1 : 0,
            background: 'radial-gradient(circle at 50% 50%, rgba(255,255,255,0.06) 0%, rgba(255,255,255,0.02) 40%, transparent 80%)',
            transition: 'opacity 1s ease-in-out',
          }}
        />

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

        {/* Main Content Container */}
        <div className="relative z-10 flex flex-col items-center justify-center w-full max-w-[600px] px-4">

          {/* LOGO CONTAINER */}
          <div
            className="flex flex-col items-center justify-center relative"
            style={{
              transform: isTextRevealed ? 'translateY(0) scale(0.85)' : 'translateY(80px) scale(1.1)',
              transition: 'transform 1.2s cubic-bezier(0.2, 0.8, 0.2, 1)',
            }}
          >
            {/* Logo Glow Ring */}
            <div
              className="absolute rounded-full pointer-events-none"
              style={{
                width: '200px', height: '200px',
                background: 'radial-gradient(circle, rgba(255,255,255,0.12) 0%, transparent 70%)',
                opacity: isLogoRevealed ? 1 : 0,
                transform: isLogoRevealed ? 'scale(1.8)' : 'scale(0.5)',
                transition: 'opacity 1.5s ease-out, transform 2s ease-out',
              }}
            />

            <img
              src="/image/mehewara%20logo.png"
              alt="Mehewara"
              draggable={false}
              style={{
                width: 'clamp(220px, 45vw, 340px)',
                height: 'auto',
                opacity: isLogoRevealed ? 1 : 0,
                filter: isLogoRevealed
                  ? 'blur(0px) drop-shadow(0 0 20px rgba(255,255,255,0.4))'
                  : 'blur(20px)',
                transform: isLogoRevealed ? 'scale(1) translate3d(0,0,0)' : 'scale(1.4) translate3d(0,0,0)',
                transition: 'opacity 1.6s ease-out, filter 1.6s cubic-bezier(0.22, 1, 0.36, 1), transform 1.8s cubic-bezier(0.22, 1, 0.36, 1)',
                position: 'relative',
                zIndex: 10,
              }}
            />
          </div>

          {/* SUBTITLE TEXT */}
          <div
            className="flex flex-col items-center w-full text-center mt-6"
            style={{
              opacity: isTextRevealed ? 1 : 0,
              transform: isTextRevealed ? 'translateY(0)' : 'translateY(30px)',
              transition: 'opacity 1s ease-out 0.2s, transform 1s cubic-bezier(0.22, 1, 0.36, 1) 0.2s',
            }}
          >
            <p className="text-[10px] sm:text-xs font-mono tracking-[0.25em] text-slate-500 uppercase">
              Mehewara Educational Platform
            </p>
          </div>

        </div>
      </div>
    </div>
  );
}
