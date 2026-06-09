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

  // Generate background starry particles
  useEffect(() => {
    const generatedStars = [];
    for (let i = 0; i < 70; i++) {
      const size = (Math.random() * 2 + 1) + 'px';
      const moveX = (Math.random() * 200 - 100) + 'px';
      const moveY = (Math.random() * 200 - 100) + 'px';
      const duration = (Math.random() * 3 + 2) + 's';
      const moveDuration = (Math.random() * 10 + 12) + 's';
      const delay = (Math.random() * 4) + 's';

      generatedStars.push({
        id: i,
        size,
        left: (Math.random() * 100) + '%',
        top: (Math.random() * 100) + '%',
        moveX,
        moveY,
        duration,
        moveDuration,
        delay
      });
    }
    setStars(generatedStars);
  }, []);

  return (
    <div className="relative w-full min-h-screen min-h-[100dvh] bg-[#030304] overflow-hidden flex flex-col justify-center items-center px-4 py-6 safe-bottom safe-top select-none">
      {/* Background Star Particles */}
      <div className="absolute inset-0 pointer-events-none">
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

      <div className="relative z-10 w-full max-w-[550px] text-center flex flex-col items-center">

        {/* GLOWING BOOT HEADER WITH "මෙහෙවර" TITLE */}
        <div className="mt-8 mb-4">
          <h1 className="text-4xl sm:text-5xl md:text-6xl font-extrabold tracking-widest font-display text-transparent bg-clip-text bg-gradient-to-r from-sky-450 via-cyan-300 to-sky-400 drop-shadow-[0_0_15px_rgba(56,189,248,0.5)]">
            මෙහෙවර
          </h1>
          <p className="mt-2 text-[10px] sm:text-xs md:text-sm font-mono tracking-[0.25em] sm:tracking-[0.4em] text-cyan-400 uppercase opacity-95">
            M E H E W A R A &nbsp;&nbsp; P L A T F O R M
          </p>
        </div>

        {/* ENTER PLATFORM BTN - IMMEDIATELY ACTIVE */}
        <div className="mt-8 h-12 flex justify-center items-center">
          <button
            onClick={onBootComplete}
            className="w-full max-w-xs sm:w-auto min-h-[48px] px-8 py-3 bg-gradient-to-r from-sky-500 via-sky-400 to-blue-600 hover:from-sky-400 hover:to-blue-500 text-white rounded-lg font-bold tracking-[0.15em] sm:tracking-[0.2em] font-sans text-sm shadow-[0_0_20px_rgba(56,189,248,0.4)] hover:shadow-[0_0_30px_rgba(56,189,248,0.6)] sm:hover:scale-105 active:scale-95 transition-all duration-300 cursor-pointer"
          >
            පිවිසෙන්න / ENTER
          </button>
        </div>
      </div>
    </div>
  );
}
