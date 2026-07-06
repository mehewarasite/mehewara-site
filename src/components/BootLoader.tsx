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

  // Sequence: 'init' -> 'reveal-logo' -> 'reveal-text' -> 'ready'
  const [phase, setPhase] = useState<'init' | 'reveal-logo' | 'reveal-text' | 'ready'>('init');

  useEffect(() => {
    // Generate background stars
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
    // Timing sequence for the smooth reveal
    const t1 = setTimeout(() => setPhase('reveal-logo'), 100);  // Start logo blur reveal
    const t2 = setTimeout(() => setPhase('reveal-text'), 1800); // Logo glides up, text appears
    const t3 = setTimeout(() => setPhase('ready'), 2800);       // Button appears
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  }, []);

  // Compute derived states for CSS transitions
  const isLogoRevealed = phase === 'reveal-logo' || phase === 'reveal-text' || phase === 'ready';
  const isTextRevealed = phase === 'reveal-text' || phase === 'ready';
  const isReady = phase === 'ready';

  return (
    <div className="relative w-full min-h-screen min-h-[100dvh] bg-[#030304] overflow-hidden flex flex-col justify-center items-center px-4 py-6 safe-bottom safe-top select-none font-sans">
      
      {/* Dynamic Ambient Background Glow */}
      <div 
        className="absolute inset-0 pointer-events-none transition-opacity duration-1000 ease-in-out"
        style={{
          opacity: isLogoRevealed ? 1 : 0,
          background: 'radial-gradient(circle at 50% 50%, rgba(255,255,255,0.06) 0%, rgba(255,255,255,0.02) 40%, transparent 80%)'
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
      <div className="relative z-10 flex flex-col items-center justify-center w-full max-w-[600px]">
        
        {/* LOGO CONTAINER */}
        <div 
          className="flex flex-col items-center justify-center relative"
          style={{
            // When text reveals, the logo container shrinks and moves up slightly
            transform: isTextRevealed ? 'translateY(0) scale(0.85)' : 'translateY(80px) scale(1.1)',
            transition: 'transform 1.2s cubic-bezier(0.2, 0.8, 0.2, 1)',
          }}
        >
          {/* Logo Glow Ring */}
          <div 
            className="absolute rounded-full pointer-events-none"
            style={{
              width: '180px', height: '180px',
              background: 'radial-gradient(circle, rgba(255,255,255,0.1) 0%, transparent 70%)',
              opacity: isLogoRevealed ? 1 : 0,
              transform: isLogoRevealed ? 'scale(1.5)' : 'scale(0.5)',
              transition: 'opacity 1.5s ease-out, transform 2s ease-out',
            }}
          />
          
          <img
            src="/image/mehewara logo.png"
            alt="Mehewara"
            draggable={false}
            style={{
              width: 'clamp(220px, 45vw, 340px)',
              height: 'auto',
              // The cinematic blur-in effect
              opacity: isLogoRevealed ? 1 : 0,
              filter: isLogoRevealed 
                ? 'blur(0px) drop-shadow(0 0 10px rgba(255,255,255,0.3)) brightness(1.1)' 
                : 'blur(20px) drop-shadow(0 0 0px rgba(255,255,255,0)) brightness(0)',
              transform: isLogoRevealed ? 'scale(1)' : 'scale(1.3)',
              transition: 'opacity 1.5s ease-out, filter 1.5s cubic-bezier(0.2, 0.8, 0.2, 1), transform 1.8s cubic-bezier(0.2, 0.8, 0.2, 1)',
              position: 'relative',
              zIndex: 10,
            }}
          />
        </div>

        {/* TEXT & BUTTON CONTAINER */}
        <div 
          className="flex flex-col items-center w-full text-center mt-4"
          style={{
            opacity: isTextRevealed ? 1 : 0,
            transform: isTextRevealed ? 'translateY(0)' : 'translateY(30px)',
            transition: 'opacity 1s ease-out 0.2s, transform 1s cubic-bezier(0.2, 0.8, 0.2, 1) 0.2s',
          }}
        >


          {/* Action Button */}
          <div 
            className="mt-4"
            style={{
              opacity: isReady ? 1 : 0,
              transform: isReady ? 'translateY(0) scale(1)' : 'translateY(15px) scale(0.95)',
              transition: 'opacity 0.8s ease-out, transform 0.8s cubic-bezier(0.2, 0.8, 0.2, 1)',
            }}
          >
            <button
              onClick={onBootComplete}
              className="group relative overflow-hidden rounded-md bg-slate-900/50 backdrop-blur-md border border-white/10 px-4 py-1.5 font-bold tracking-[0.1em] text-slate-200 shadow-[0_0_10px_rgba(255,255,255,0.05)] hover:shadow-[0_0_15px_rgba(255,255,255,0.15)] hover:border-white/30 hover:text-white transition-all duration-500 active:scale-95"
            >
              {/* Button sweep effect */}
              <div className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/10 to-transparent group-hover:animate-[sweep_1.5s_ease-in-out_infinite]" />
              
              <span className="relative z-10 text-[9px] sm:text-[10px]">පිවිසෙන්න / ENTER</span>
            </button>
          </div>
        </div>

      </div>

      <style>{`
        @keyframes sweep {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(200%); }
        }
      `}</style>
    </div>
  );
}


