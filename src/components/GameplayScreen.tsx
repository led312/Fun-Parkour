import React, { useState, useEffect, useRef } from 'react';
import { playCoinSound, playJumpSound, playVictorySound, playButtonClick } from '../utils/audio';

interface GameplayScreenProps {
  onGameOver: (finalScore: number, starsEarned: number) => void;
  onPause: () => void;
}

interface Obstacle {
  id: number;
  lane: number; // 0: Left, 1: Center, 2: Right
  z: number; // 100 (far) to 0 (close)
  type: 'cone' | 'hurdle' | 'coin' | 'star' | 'bolt';
  collected?: boolean;
}

export const GameplayScreen: React.FC<GameplayScreenProps> = ({
  onGameOver,
  onPause,
}) => {
  const [score, setScore] = useState(2100);
  const [combo, setCombo] = useState(5);
  const [lane, setLane] = useState<number>(1); // 0, 1, 2
  const [isJumping, setIsJumping] = useState(false);
  const [isSliding, setIsSliding] = useState(false);
  const [hasShield, setHasShield] = useState(false);
  const [hasBoost, setHasBoost] = useState(false);
  const [showWebcam, setShowWebcam] = useState(true);
  const [webcamActive, setWebcamActive] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const obstaclesRef = useRef<Obstacle[]>([]);
  const frameRef = useRef<number>(0);
  const nextIdRef = useRef<number>(1);

  // Webcam init
  useEffect(() => {
    navigator.mediaDevices?.getUserMedia({ video: true })
      .then((stream) => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
        setWebcamActive(true);
      })
      .catch(() => {
        setWebcamActive(false);
      });

    return () => {
      if (videoRef.current && videoRef.current.srcObject) {
        const stream = videoRef.current.srcObject as MediaStream;
        stream.getTracks().forEach((t) => t.stop());
      }
    };
  }, []);

  // Keyboard controls
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') {
        setLane((prev) => Math.max(0, prev - 1));
      } else if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') {
        setLane((prev) => Math.min(2, prev + 1));
      } else if (e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W' || e.key === ' ') {
        if (!isJumping) {
          setIsJumping(true);
          playJumpSound();
          setTimeout(() => setIsJumping(false), 650);
        }
      } else if (e.key === 'ArrowDown' || e.key === 's' || e.key === 'S') {
        if (!isSliding) {
          setIsSliding(true);
          setTimeout(() => setIsSliding(false), 600);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isJumping, isSliding]);

  // Game loop & spawner
  useEffect(() => {
    let lastSpawn = Date.now();
    let scoreInterval = setInterval(() => {
      setScore((s) => s + 12);
    }, 100);

    const runLoop = () => {
      const now = Date.now();
      // Spawn items
      if (now - lastSpawn > 1100) {
        lastSpawn = now;
        const types: ('cone' | 'hurdle' | 'coin' | 'star' | 'bolt')[] = [
          'coin', 'star', 'cone', 'hurdle', 'coin', 'star', 'bolt',
        ];
        const randomType = types[Math.floor(Math.random() * types.length)];
        const randomLane = Math.floor(Math.random() * 3);

        obstaclesRef.current.push({
          id: nextIdRef.current++,
          lane: randomLane,
          z: 100,
          type: randomType,
        });
      }

      // Update positions
      const speed = hasBoost ? 2.5 : 1.6;
      obstaclesRef.current.forEach((obs) => {
        obs.z -= speed;
      });

      // Filter off-screen
      obstaclesRef.current = obstaclesRef.current.filter((obs) => {
        if (obs.z <= 5 && !obs.collected) {
          // Check collision at player z range (5 ~ 0)
          if (obs.lane === lane) {
            if (obs.type === 'coin') {
              obs.collected = true;
              playCoinSound();
              setScore((s) => s + 50);
              setCombo((c) => Math.min(10, c + 1));
            } else if (obs.type === 'star') {
              obs.collected = true;
              playCoinSound();
              setScore((s) => s + 100);
              setCombo((c) => Math.min(10, c + 1));
            } else if (obs.type === 'bolt') {
              obs.collected = true;
              playCoinSound();
              setHasBoost(true);
              setTimeout(() => setHasBoost(false), 3000);
            } else if (obs.type === 'cone' || obs.type === 'hurdle') {
              if (isJumping && obs.type === 'hurdle') {
                // Avoided hurdle by jumping!
                setScore((s) => s + 30);
              } else if (hasShield) {
                obs.collected = true;
                setHasShield(false);
              } else {
                // Minor hit
                setCombo(1);
              }
            }
          }
        }
        return obs.z > 0;
      });

      // Render canvas track
      const canvas = canvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext('2d');
        if (ctx) {
          const width = canvas.width;
          const height = canvas.height;

          // Sky gradient
          const skyGrad = ctx.createLinearGradient(0, 0, 0, height * 0.45);
          skyGrad.addColorStop(0, '#58b3ff');
          skyGrad.addColorStop(1, '#9cd6ff');
          ctx.fillStyle = skyGrad;
          ctx.fillRect(0, 0, width, height * 0.45);

          // Horizon hills
          ctx.fillStyle = '#64c852';
          ctx.beginPath();
          ctx.arc(width * 0.3, height * 0.45, width * 0.4, Math.PI, 0);
          ctx.arc(width * 0.8, height * 0.45, width * 0.5, Math.PI, 0);
          ctx.fill();

          // Stadium track perspective
          const trackGrad = ctx.createLinearGradient(0, height * 0.45, 0, height);
          trackGrad.addColorStop(0, '#0075ff');
          trackGrad.addColorStop(1, '#004db3');
          ctx.fillStyle = trackGrad;

          const vanishingX = width / 2;
          const vanishingY = height * 0.42;

          ctx.beginPath();
          ctx.moveTo(vanishingX - 40, vanishingY);
          ctx.lineTo(vanishingX + 40, vanishingY);
          ctx.lineTo(width + 120, height);
          ctx.lineTo(-120, height);
          ctx.closePath();
          ctx.fill();

          // Lane dividing lines (3 lanes)
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 4;
          for (let i = 1; i <= 2; i++) {
            const laneStartx = vanishingX - 40 + (i * 80) / 3;
            const laneEndX = -120 + (i * (width + 240)) / 3;

            ctx.beginPath();
            ctx.setLineDash([15, 15]);
            ctx.moveTo(laneStartx, vanishingY);
            ctx.lineTo(laneEndX, height);
            ctx.stroke();
            ctx.setLineDash([]);
          }

          // Orange track side borders
          ctx.fillStyle = '#ff7a00';
          ctx.beginPath();
          ctx.moveTo(-120, height);
          ctx.lineTo(-40, height);
          ctx.lineTo(vanishingX - 50, vanishingY);
          ctx.lineTo(vanishingX - 40, vanishingY);
          ctx.fill();

          ctx.beginPath();
          ctx.moveTo(width + 120, height);
          ctx.lineTo(width + 40, height);
          ctx.lineTo(vanishingX + 50, vanishingY);
          ctx.lineTo(vanishingX + 40, vanishingY);
          ctx.fill();

          // Draw obstacles & collectibles
          obstaclesRef.current.forEach((obs) => {
            if (obs.collected) return;

            const scale = (100 - obs.z) / 100; // 0 (far) to 1 (near)
            const objY = vanishingY + (height - vanishingY) * scale;

            // Lane X position calculation
            const laneLeftX = -120 + (obs.lane * (width + 240)) / 3;
            const laneRightX = -120 + ((obs.lane + 1) * (width + 240)) / 3;
            const objX = (laneLeftX + laneRightX) / 2 * scale + vanishingX * (1 - scale);

            const size = Math.max(12, 50 * scale);

            ctx.save();
            ctx.translate(objX, objY);

            if (obs.type === 'coin') {
              ctx.fillStyle = '#ffd700';
              ctx.strokeStyle = '#ffffff';
              ctx.lineWidth = 3 * scale;
              ctx.beginPath();
              ctx.arc(0, -size / 2, size / 2, 0, Math.PI * 2);
              ctx.fill();
              ctx.stroke();
              ctx.fillStyle = '#b39200';
              ctx.font = `bold ${Math.max(10, 18 * scale)}px sans-serif`;
              ctx.textAlign = 'center';
              ctx.fillText('$', 0, -size / 4);
            } else if (obs.type === 'star') {
              ctx.fillStyle = '#ffaa00';
              ctx.font = `${Math.max(16, 42 * scale)}px sans-serif`;
              ctx.textAlign = 'center';
              ctx.fillText('⭐', 0, -size / 3);
            } else if (obs.type === 'bolt') {
              ctx.fillStyle = '#39ff14';
              ctx.font = `${Math.max(16, 40 * scale)}px sans-serif`;
              ctx.textAlign = 'center';
              ctx.fillText('⚡', 0, -size / 3);
            } else if (obs.type === 'cone') {
              ctx.fillStyle = '#ff5500';
              ctx.beginPath();
              ctx.moveTo(0, -size);
              ctx.lineTo(-size / 2, 0);
              ctx.lineTo(size / 2, 0);
              ctx.closePath();
              ctx.fill();
            } else if (obs.type === 'hurdle') {
              ctx.fillStyle = '#ffffff';
              ctx.fillRect(-size, -size * 0.8, size * 2, size * 0.3);
              ctx.fillStyle = '#ff0000';
              ctx.fillRect(-size * 0.5, -size * 0.8, size * 0.4, size * 0.3);
              ctx.fillRect(size * 0.1, -size * 0.8, size * 0.4, size * 0.3);
            }

            ctx.restore();
          });

          // Draw Runner Character in Perspective
          const runnerScale = 0.9;
          const playerLaneLeftX = -120 + (lane * (width + 240)) / 3;
          const playerLaneRightX = -120 + ((lane + 1) * (width + 240)) / 3;
          const playerX = (playerLaneLeftX + playerLaneRightX) / 2;
          let playerY = height - 100;

          if (isJumping) {
            playerY -= 65;
          }

          // Runner Shadow
          ctx.fillStyle = 'rgba(0,0,0,0.25)';
          ctx.beginPath();
          ctx.ellipse(playerX, height - 25, 40 * runnerScale, 12 * runnerScale, 0, 0, Math.PI * 2);
          ctx.fill();

          // Runner Body (Orange Jersey with number 127, Blue shorts, brown hair ponytail)
          ctx.save();
          ctx.translate(playerX, playerY);

          // Head / Hair
          ctx.fillStyle = '#8b4513';
          ctx.beginPath();
          ctx.arc(0, -95, 26, 0, Math.PI * 2);
          ctx.fill();

          // Ponytail
          ctx.beginPath();
          ctx.arc(0, -122, 14, 0, Math.PI * 2);
          ctx.fill();

          // Headband
          ctx.fillStyle = '#006ef1';
          ctx.fillRect(-22, -100, 44, 8);

          // Jersey (Orange)
          ctx.fillStyle = '#ff7a00';
          ctx.fillRect(-24, -65, 48, 42);

          // Bib Number "127"
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(-18, -55, 36, 22);
          ctx.fillStyle = '#001a43';
          ctx.font = 'extrabold 15px sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText('127', 0, -38);

          // Blue Shorts
          ctx.fillStyle = '#0057c1';
          ctx.fillRect(-22, -23, 44, 20);

          // Running Legs
          ctx.fillStyle = '#f5c29b';
          const legOffset = (Math.sin(Date.now() / 60) * 15);
          ctx.fillRect(-16, -3, 12, 25 + legOffset);
          ctx.fillRect(4, -3, 12, 25 - legOffset);

          // Shoes
          ctx.fillStyle = '#ff7a00';
          ctx.fillRect(-18, 22 + legOffset, 16, 10);
          ctx.fillRect(2, 22 - legOffset, 16, 10);

          // GO! banner over runner
          ctx.fillStyle = '#ff5500';
          ctx.font = 'extrabold 32px sans-serif';
          ctx.textAlign = 'center';
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 4;
          ctx.strokeText('GO!', 0, -125);
          ctx.fillText('GO!', 0, -125);

          ctx.restore();
        }
      }

      frameRef.current = requestAnimationFrame(runLoop);
    };

    frameRef.current = requestAnimationFrame(runLoop);

    return () => {
      cancelAnimationFrame(frameRef.current);
      clearInterval(scoreInterval);
    };
  }, [lane, isJumping, isSliding, hasBoost, hasShield]);

  // Finish run after reaching goal or manual trigger
  const handleFinishRun = () => {
    playButtonClick();
    playVictorySound();
    onGameOver(score, 3);
  };

  return (
    <div className="relative h-[calc(100vh-70px)] w-full bg-[#58b3ff] overflow-hidden select-none">
      {/* Canvas Game Render */}
      <canvas
        ref={canvasRef}
        width={600}
        height={800}
        className="w-full h-full object-cover touch-none"
      />

      {/* Floating HUD Top Banner */}
      <div className="absolute top-4 left-4 right-4 flex justify-between items-start pointer-events-none z-20">
        {/* Left Health Badge */}
        <div className="bg-[#e8eff1]/90 backdrop-blur-md px-4 py-2 rounded-full border-4 border-[#0057c1] shadow-lg flex items-center gap-2">
          <span className="material-symbols-outlined text-red-500 text-2xl symbol-filled animate-pulse">
            favorite
          </span>
          <span className="font-extrabold text-[#0057c1] text-lg sm:text-xl">
            KID-RUN!
          </span>
        </div>

        {/* Center Combo Overlay */}
        <div className="bg-[#994700] text-white px-6 py-2 rounded-full border-4 border-white shadow-[0_6px_0_0_#5c2800] flex flex-col items-center animate-bounce">
          <span className="font-bold text-[11px] uppercase tracking-wider text-amber-200">
            COMBO
          </span>
          <span className="font-extrabold text-2xl sm:text-3xl leading-none">
            x{combo}
          </span>
        </div>

        {/* Right Score Badge */}
        <div className="bg-[#006ef1] text-white px-5 py-2 rounded-full border-4 border-white shadow-lg flex items-center gap-1.5">
          <span className="font-bold text-xs uppercase text-blue-100">SCORE</span>
          <span className="font-extrabold text-xl sm:text-2xl">{score.toLocaleString()}</span>
        </div>
      </div>

      {/* On-screen Controls Overlay (Touch & Quick Actions) */}
      <div className="absolute bottom-28 left-4 z-20 flex flex-col gap-3">
        <button
          onClick={() => {
            playButtonClick();
            setHasShield(true);
          }}
          className={`rounded-full p-3.5 border-4 border-white shadow-lg transition-transform active:scale-90 ${
            hasShield ? 'bg-[#20b900] text-white ring-4 ring-green-300' : 'bg-[#ff7a00] text-white'
          }`}
          title="Shield Boost"
        >
          <span className="material-symbols-outlined text-2xl sm:text-3xl symbol-filled">
            bolt
          </span>
        </button>

        <button
          onClick={() => setShowWebcam(!showWebcam)}
          className="bg-[#0057c1] text-white rounded-full p-3.5 border-4 border-white shadow-lg transition-transform active:scale-90"
          title="Toggle Motion Camera"
        >
          <span className="material-symbols-outlined text-2xl sm:text-3xl">
            qr_code_2
          </span>
        </button>
      </div>

      {/* Picture-in-Picture Motion Camera Feed Container */}
      {showWebcam && (
        <div className="absolute bottom-28 right-4 z-20 bg-slate-900 rounded-2xl overflow-hidden w-44 sm:w-56 h-32 sm:h-38 border-4 border-white shadow-2xl flex flex-col items-center justify-center">
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className={`w-full h-full object-cover scale-x-[-1] ${webcamActive ? 'block' : 'hidden'}`}
          />

          {!webcamActive && (
            <div className="flex flex-col items-center text-white/50 text-center p-2">
              <span className="material-symbols-outlined text-3xl text-emerald-400 animate-bounce">
                accessibility_new
              </span>
              <p className="font-bold text-[10px] uppercase mt-1">Simulating Motion Tracking</p>
            </div>
          )}

          <div className="scanline absolute inset-0 pointer-events-none" />

          {/* Stick Figure Skeleton Motion Overlay */}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <svg className="w-16 h-24 stroke-emerald-400 stroke-2 fill-none animate-pulse">
              <circle cx="32" cy="12" r="8" />
              <line x1="32" y1="20" x2="32" y2="50" />
              <line x1="12" y1="30" x2="52" y2="30" />
              <line x1="32" y1="50" x2="18" y2="80" />
              <line x1="32" y1="50" x2="46" y2="80" />
            </svg>
          </div>

          <div className="absolute top-2 left-2 flex items-center gap-1.5 bg-black/50 px-2 py-0.5 rounded-full">
            <div className="w-2 h-2 rounded-full bg-emerald-400 animate-ping"></div>
            <span className="text-white text-[9px] font-bold uppercase">GAMEPLAY ACTIVE</span>
          </div>

          <div className="absolute bottom-0 left-0 right-0 bg-[#106e00]/90 py-1 text-center">
            <p className="text-white text-[10px] font-extrabold uppercase tracking-tight">
              MOVE TO RUN!
            </p>
          </div>
        </div>
      )}

      {/* On-Screen Touch Lane Switches (Mobile Friendly) */}
      <div className="absolute bottom-28 left-1/2 -translate-x-1/2 z-20 flex gap-4">
        <button
          onClick={() => {
            playButtonClick();
            setLane((l) => Math.max(0, l - 1));
          }}
          className="bg-white/90 text-[#0057c1] font-extrabold px-5 py-3 rounded-2xl border-4 border-[#0057c1] shadow-lg active:scale-90"
        >
          ◀ LEFT
        </button>
        <button
          onClick={() => {
            if (!isJumping) {
              setIsJumping(true);
              playJumpSound();
              setTimeout(() => setIsJumping(false), 650);
            }
          }}
          className="bg-[#ff7a00] text-white font-extrabold px-8 py-3 rounded-2xl border-4 border-white shadow-lg active:scale-90 text-lg"
        >
          JUMP! ⬆
        </button>
        <button
          onClick={() => {
            playButtonClick();
            setLane((l) => Math.min(2, l + 1));
          }}
          className="bg-white/90 text-[#0057c1] font-extrabold px-5 py-3 rounded-2xl border-4 border-[#0057c1] shadow-lg active:scale-90"
        >
          RIGHT ▶
        </button>
      </div>

      {/* Pause Button & Quick Finish */}
      <div className="absolute top-20 right-4 z-30 flex items-center gap-2">
        <button
          onClick={handleFinishRun}
          className="bg-[#20b900] text-white font-extrabold px-4 py-2 rounded-full border-2 border-white shadow-md hover:scale-105 active:scale-95 transition-all text-xs"
        >
          Finish Run!
        </button>
        <button
          onClick={() => {
            playButtonClick();
            onPause();
          }}
          className="bg-[#0057c1] text-white rounded-full p-2.5 border-2 border-white shadow-md active:scale-90"
        >
          <span className="material-symbols-outlined text-2xl">pause</span>
        </button>
      </div>
    </div>
  );
};
