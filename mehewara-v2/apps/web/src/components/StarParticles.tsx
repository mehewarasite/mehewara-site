import React, { useEffect, useState } from 'react';

export default function StarParticles() {
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

  return (
    <div className="absolute inset-0 pointer-events-none opacity-50 z-[1]">
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
  );
}
