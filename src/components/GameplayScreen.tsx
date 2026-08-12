import React, { useState, useEffect, useRef, useCallback } from 'react';
import { playCoinSound, playJumpSound, playVictorySound } from '../utils/audio';
import { usePoseControl } from '../hooks/usePoseControl';
import { PoseBaseline } from '../utils/poseDetector';
import { assetUrl } from '../utils/assets';

interface GameplayScreenProps {
  onGameOver: (finalScore: number, coinsCollected: number, trialShieldsUsed: number) => void;
  onPause: () => void;
  poseBaseline?: PoseBaseline | null;
  hasJetpack?: boolean; // owned shop powerup: 5s opening flight through a coin sky
  hasSuperShield?: boolean; // owned shop powerup: +1 shield charge this run
  hasScoreDoubler?: boolean; // owned shop powerup: 10s of 2x score at run start
  shieldTrials?: number; // lifetime free shield charges left
  jetpackDurationMs?: number; // upgraded opening flight duration
  shieldDurationMs?: number; // upgraded shield duration
  boostDurationMs?: number; // upgraded score-doubler duration
  onConsumeJetpack?: () => void; // called when the one-time jetpack fires
}

// Runner sprite images (transparent PNGs in /public/assets). Running
// alternates between two frames; any missing sprite falls back to the
// vector-drawn runner.
const RUNNER_SPRITES = {
  'run-1': assetUrl('/assets/runner-run-1.png'),
  'run-2': assetUrl('/assets/runner-run-2.png'),
  jump: assetUrl('/assets/runner-jump.png'),
  slide: assetUrl('/assets/runner-slide.png'),
  fly: assetUrl('/assets/runner-fly.png'),
} as const;

interface Obstacle {
  id: number;
  lane: number; // 0: Left, 1: Center, 2: Right
  z: number; // 100 (far) to 0 (close)
  type: 'cone' | 'hurdle' | 'coin';
  collected?: boolean;
}

export const GameplayScreen: React.FC<GameplayScreenProps> = ({
  onGameOver,
  poseBaseline = null,
  hasJetpack = false,
  hasSuperShield = false,
  hasScoreDoubler = false,
  shieldTrials = 0,
  jetpackDurationMs = 5000,
  shieldDurationMs = 10000,
  boostDurationMs = 10000,
  onConsumeJetpack,
}) => {
  const [score, setScore] = useState(0);
  const [lane, setLane] = useState<number>(1); // 0, 1, 2
  const [isJumping, setIsJumping] = useState(false);
  const [isSliding, setIsSliding] = useState(false);
  const [hasShield, setHasShield] = useState(false);
  const [webcamActive, setWebcamActive] = useState(false);
  const [shieldCharges, setShieldCharges] = useState(shieldTrials + (hasSuperShield ? 1 : 0));
  const [shieldRemaining, setShieldRemaining] = useState(0);
  const [isFlying, setIsFlying] = useState(false);
  const [coinsCollected, setCoinsCollected] = useState(0);
  const [scoreBoost, setScoreBoost] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const skeletonCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const obstaclesRef = useRef<Obstacle[]>([]);
  const frameRef = useRef<number>(0);
  const nextIdRef = useRef<number>(1);
  const scoreRef = useRef<number>(score);
  const gameOverRef = useRef<boolean>(false);
  const jumpingRef = useRef(false);
  const slidingRef = useRef(false);
  const hasShieldRef = useRef(false);
  const shieldChargesRef = useRef(shieldTrials + (hasSuperShield ? 1 : 0));
  const shieldsUsedRef = useRef(0); // charges activated this run
  const shieldEndRef = useRef(0);
  const flyingRef = useRef(false);
  const coinsRef = useRef(0);
  const scoreMultRef = useRef(1);
  const coinRainUntilRef = useRef(0); // jetpack opening flight window
  const laneRef = useRef(1); // live lane for the render loop (state mirror)
  const flyStartRef = useRef(0); // flight takeoff/landing animation timestamps
  const flyEndRef = useRef(0);
  const onGameOverRef = useRef(onGameOver);
  onGameOverRef.current = onGameOver;
  const runnerImgsRef = useRef<Partial<Record<keyof typeof RUNNER_SPRITES, HTMLImageElement>>>({});

  // Preload runner sprites once; missing files just keep the vector fallback
  useEffect(() => {
    (Object.keys(RUNNER_SPRITES) as (keyof typeof RUNNER_SPRITES)[]).forEach((key) => {
      const img = new Image();
      img.src = RUNNER_SPRITES[key];
      img.onload = () => {
        runnerImgsRef.current[key] = img;
      };
    });
  }, []);

  // Purchased powerups kick in at run start: jetpack = 5s opening flight
  // through a sky full of coins, score doubler = 10s of double score.
  // Mount-only: the jetpack is consumed the moment it fires, so the prop
  // flips false mid-run and must not re-run this effect.
  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];
    if (hasJetpack) {
      flyingRef.current = true;
      setIsFlying(true);
      flyStartRef.current = Date.now();
      coinRainUntilRef.current = Date.now() + jetpackDurationMs;
      onConsumeJetpack?.();
      timers.push(
        setTimeout(() => {
          flyingRef.current = false;
          setIsFlying(false);
          flyEndRef.current = Date.now(); // landing animation starts
        }, jetpackDurationMs),
      );
    }
    if (hasScoreDoubler) {
      scoreMultRef.current = 2;
      setScoreBoost(true);
      timers.push(
        setTimeout(() => {
          scoreMultRef.current = 1;
          setScoreBoost(false);
        }, boostDurationMs),
      );
    }
    return () => timers.forEach(clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep a live copy of score so the game loop can report it on game over
  useEffect(() => {
    scoreRef.current = score;
  }, [score]);

  // Mirror lane into a ref so the render loop never restarts on lane change
  useEffect(() => {
    laneRef.current = lane;
  }, [lane]);

  // Match canvas resolution to its displayed size so nothing is cropped
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const resize = () => {
      canvas.width = canvas.clientWidth;
      canvas.height = canvas.clientHeight;
    };
    resize();
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, []);

  // Match skeleton overlay resolution to its displayed size
  useEffect(() => {
    const canvas = skeletonCanvasRef.current;
    if (!canvas) return;
    const resize = () => {
      canvas.width = canvas.clientWidth;
      canvas.height = canvas.clientHeight;
    };
    resize();
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, []);

  // Webcam init
  useEffect(() => {
    navigator.mediaDevices?.getUserMedia({ video: { width: { ideal: 640 }, height: { ideal: 480 } } })
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

  // Shared action triggers (keyboard + pose control)
  const triggerJump = useCallback(() => {
    if (flyingRef.current || jumpingRef.current) return;
    jumpingRef.current = true;
    setIsJumping(true);
    playJumpSound();
    setTimeout(() => {
      jumpingRef.current = false;
      setIsJumping(false);
    }, 650);
  }, []);

  const triggerSlide = useCallback(() => {
    if (slidingRef.current) return;
    slidingRef.current = true;
    setIsSliding(true);
    setTimeout(() => {
      slidingRef.current = false;
      setIsSliding(false);
    }, 600);
  }, []);

  // Shield: charges come from the lifetime trial (3 free) plus any purchased
  // super shield; each activation lasts 10s and blocks one hit
  const activateShield = useCallback(() => {
    if (hasShieldRef.current || shieldChargesRef.current <= 0) return;
    shieldChargesRef.current -= 1;
    shieldsUsedRef.current += 1;
    setShieldCharges(shieldChargesRef.current);
    hasShieldRef.current = true;
    setHasShield(true);
    shieldEndRef.current = Date.now() + shieldDurationMs;
    playVictorySound();
  }, [shieldDurationMs]);

  // Shield countdown / expiry
  useEffect(() => {
    if (!hasShield) return;
    const interval = setInterval(() => {
      const remaining = Math.max(0, shieldEndRef.current - Date.now());
      setShieldRemaining(Math.ceil(remaining / 1000));
      if (remaining <= 0) {
        hasShieldRef.current = false;
        setHasShield(false);
      }
    }, 200);
    return () => clearInterval(interval);
  }, [hasShield]);

  // Pose control: webcam gestures drive the same actions as the keyboard.
  // When the calibration screen captured a baseline, reuse it directly.
  const poseStatus = usePoseControl(
    videoRef,
    skeletonCanvasRef,
    {
      onJump: triggerJump,
      onSlide: triggerSlide,
      onLane: setLane,
      onShield: activateShield,
    },
    poseBaseline,
  );

  // Keyboard controls
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') {
        setLane((prev) => Math.max(0, prev - 1));
      } else if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') {
        setLane((prev) => Math.min(2, prev + 1));
      } else if (e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W' || e.key === ' ') {
        triggerJump();
      } else if (e.key === 'ArrowDown' || e.key === 's' || e.key === 'S') {
        triggerSlide();
      } else if (e.key === 'q' || e.key === 'Q') {
        activateShield();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [triggerJump, triggerSlide, activateShield]);

  // Game loop & spawner
  useEffect(() => {
    let lastSpawn = Date.now();
    let lastCoinRain = 0;
    // Queued spawns: coin strings trickle in one coin at a time (same lane)
    const spawnQueue: { type: Obstacle['type']; lane: number; at: number }[] = [];
    // Score ticks every 200ms: halves React re-renders versus a 100ms tick
    let scoreInterval = setInterval(() => {
      setScore((s) => s + 40 * scoreMultRef.current);
    }, 200);

    const runLoop = () => {
      const now = Date.now();

      // Drain queued coin-string spawns
      while (spawnQueue.length && spawnQueue[0].at <= now) {
        const item = spawnQueue.shift()!;
        obstaclesRef.current.push({
          id: nextIdRef.current++,
          lane: item.lane,
          z: 100,
          type: item.type,
        });
      }

      // Spawn items
      if (now - lastSpawn > 900) {
        lastSpawn = now;
        const roll = Math.random();
        const randomLane = Math.floor(Math.random() * 3);
        if (roll < 0.55) {
          // Obstacle (cone or hurdle)
          obstaclesRef.current.push({
            id: nextIdRef.current++,
            lane: randomLane,
            z: 100,
            type: Math.random() < 0.5 ? 'cone' : 'hurdle',
          });
        } else {
          // Coin string: 6 coins trickling down the same lane
          for (let i = 0; i < 6; i++) {
            spawnQueue.push({ type: 'coin', lane: randomLane, at: now + i * 150 });
          }
        }
      }

      // Jetpack opening flight: rain coins across all three lanes so the
      // sky is full of pickups while airborne
      if (now < coinRainUntilRef.current && now - lastCoinRain > 150) {
        lastCoinRain = now;
        for (let laneIdx = 0; laneIdx < 3; laneIdx++) {
          obstaclesRef.current.push({
            id: nextIdRef.current++,
            lane: laneIdx,
            z: 100,
            type: 'coin',
          });
        }
      }

      // Update positions
      const speed = 0.865;
      obstaclesRef.current.forEach((obs) => {
        obs.z -= speed;
      });

      // Collide when an object reaches the runner's row: the runner is drawn
      // at height-160, which maps to z = 100*160/(height-vanishingY). Using a
      // smaller fixed window (old: z<=5) let coins visibly fly through the
      // runner before being collected.
      const canvas = canvasRef.current;
      const collideZ = canvas ? (100 * 160) / (canvas.height - canvas.height / 6) : 24;

      // Filter off-screen
      obstaclesRef.current = obstaclesRef.current.filter((obs) => {
        if (obs.z <= collideZ && !obs.collected && !gameOverRef.current) {
          // Check collision at player z range (5 ~ 0)
          if (obs.lane === laneRef.current) {
            if (obs.type === 'coin') {
              obs.collected = true;
              playCoinSound();
              coinsRef.current += 1;
              setCoinsCollected(coinsRef.current);
              setScore((s) => s + 50 * scoreMultRef.current);
            } else if (obs.type === 'cone' || obs.type === 'hurdle') {
              if (flyingRef.current) {
                // Jetpack flight carries the runner over everything
              } else if (jumpingRef.current && obs.type === 'hurdle') {
                // Avoided hurdle by jumping!
                setScore((s) => s + 30 * scoreMultRef.current);
              } else if (hasShieldRef.current) {
                // Shield absorbs one hit, then breaks
                obs.collected = true;
                hasShieldRef.current = false;
                setHasShield(false);
              } else {
                // Hit an obstacle: run ends. The purchased charge is counted
                // as used first; the rest drains the lifetime trial pool.
                gameOverRef.current = true;
                const trialUsed = Math.max(
                  0,
                  shieldsUsedRef.current - (hasSuperShield ? 1 : 0),
                );
                onGameOverRef.current(scoreRef.current, coinsRef.current, trialUsed);
              }
            }
          }
        }
        return obs.z > 0;
      });

      // Render canvas track
      if (canvas) {
        const ctx = canvas.getContext('2d');
        if (ctx) {
          const width = canvas.width;
          const height = canvas.height;

          // Flight takeoff/landing animation progress (0 = on the ground,
          // 1 = fully airborne). Ramps up over 700ms after takeoff and back
          // down over 700ms after the jetpack cuts out.
          const nowMs = Date.now();
          let flyP = 0;
          if (flyingRef.current && flyStartRef.current) {
            flyP = Math.min(1, (nowMs - flyStartRef.current) / 700);
          } else if (flyEndRef.current) {
            flyP = Math.max(0, 1 - (nowMs - flyEndRef.current) / 700);
            if (flyP <= 0) flyEndRef.current = 0;
          }

          // Sky + small horizon hills: the green band stays within the top
          // 1/6 of the screen so the track gets everything below it
          const horizon = height / 6;

          const skyGrad = ctx.createLinearGradient(0, 0, 0, horizon);
          skyGrad.addColorStop(0, '#58b3ff');
          skyGrad.addColorStop(1, '#9cd6ff');
          ctx.fillStyle = skyGrad;
          ctx.fillRect(0, 0, width, horizon);

          // Hills sized relative to *height* (width-scaled hills ballooned
          // over the whole screen on wide displays)
          ctx.fillStyle = '#64c852';
          ctx.beginPath();
          ctx.arc(width * 0.25, horizon, horizon * 0.55, Math.PI, 0);
          ctx.arc(width * 0.75, horizon, horizon * 0.75, Math.PI, 0);
          ctx.fill();

          // Clouds rushing past while airborne: sells the sense of altitude
          if (flyP > 0.02) {
            ctx.fillStyle = `rgba(255,255,255,${0.85 * flyP})`;
            for (let i = 0; i < 3; i++) {
              const cx = width - ((nowMs / 3 + i * 260) % (width + 240)) + 120;
              const cy = horizon * 0.35 + i * horizon * 0.3;
              ctx.beginPath();
              ctx.ellipse(cx, cy, 46, 15, 0, 0, Math.PI * 2);
              ctx.ellipse(cx + 36, cy + 6, 28, 11, 0, 0, Math.PI * 2);
              ctx.fill();
            }
          }

          // Stadium track: three parallel, equally wide lanes (no perspective
          // convergence, so kids can tell the lanes apart at a glance)
          const trackGrad = ctx.createLinearGradient(0, horizon, 0, height);
          trackGrad.addColorStop(0, '#0075ff');
          trackGrad.addColorStop(1, '#004db3');
          ctx.fillStyle = trackGrad;

          const vanishingY = horizon;
          const laneW = width / 3;

          ctx.fillRect(0, vanishingY, width, height - vanishingY);

          // Lane dividing lines (3 equal lanes)
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 4;
          for (let i = 1; i <= 2; i++) {
            ctx.beginPath();
            ctx.setLineDash([15, 15]);
            ctx.moveTo(i * laneW, vanishingY);
            ctx.lineTo(i * laneW, height);
            ctx.stroke();
            ctx.setLineDash([]);
          }

          // Orange track side borders
          ctx.fillStyle = '#ff7a00';
          ctx.fillRect(0, vanishingY, 10, height - vanishingY);
          ctx.fillRect(width - 10, vanishingY, 10, height - vanishingY);

          // Draw obstacles & collectibles
          obstaclesRef.current.forEach((obs) => {
            if (obs.collected) return;

            const scale = (100 - obs.z) / 100; // 0 (far) to 1 (near)
            // While airborne the track compresses toward the horizon and
            // everything shrinks a bit, like the camera pulled up
            const objY = vanishingY + (height - vanishingY) * scale * (1 - 0.22 * flyP);

            // Lane X position: lane centers stay fixed on parallel lanes
            const objX = (obs.lane + 0.5) * laneW;

            const size = Math.max(22, 85 * scale) * (1 - 0.15 * flyP);

            ctx.save();
            ctx.translate(objX, objY);

            if (obs.type === 'coin') {
              // Coins are drawn smaller than obstacles so they read as pickups
              const r = Math.max(9, size * 0.26);
              ctx.fillStyle = '#ffd700';
              ctx.strokeStyle = '#ffffff';
              ctx.lineWidth = Math.max(1.5, 3 * scale);
              ctx.beginPath();
              ctx.arc(0, -r, r, 0, Math.PI * 2);
              ctx.fill();
              ctx.stroke();
              ctx.fillStyle = '#b39200';
              ctx.font = `bold ${Math.max(8, r)}px sans-serif`;
              ctx.textAlign = 'center';
              ctx.fillText('$', 0, -r * 0.66);
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
          const playerX = (laneRef.current + 0.5) * laneW;
          let playerY = height - 160;

          if (jumpingRef.current) {
            playerY -= 65;
          }
          // Flying lifts the runner smoothly; shrinking reads as "higher up"
          playerY -= 150 * flyP;
          const airScale = 1 - 0.3 * flyP;

          // Runner Shadow stays on the ground, fading and shrinking as the
          // runner gains altitude
          ctx.fillStyle = `rgba(0,0,0,${0.25 * (1 - 0.75 * flyP)})`;
          ctx.beginPath();
          ctx.ellipse(
            playerX,
            height - 160 + 75,
            40 * runnerScale * (1 - 0.4 * flyP),
            12 * runnerScale * (1 - 0.4 * flyP),
            0,
            0,
            Math.PI * 2,
          );
          ctx.fill();

          // Runner sprite by state; falls back to the vector-drawn runner
          // until the PNG assets exist in /public/assets. Running alternates
          // between the two run frames every 150ms.
          const runFrame = Math.floor(Date.now() / 150) % 2 === 0 ? 'run-1' : 'run-2';
          const spriteKey = slidingRef.current
            ? 'slide'
            : flyP > 0.3
              ? 'fly'
              : jumpingRef.current
                ? 'jump'
                : runFrame;
          const sprite = runnerImgsRef.current[spriteKey];

          ctx.save();
          ctx.translate(playerX, playerY);
          ctx.scale(airScale, airScale);
          if (sprite) {
            // Feet anchor matches the old vector runner (~32px below playerY)
            const h = 170;
            const w = (h * sprite.naturalWidth) / sprite.naturalHeight;
            // Gentle bob while running on the ground
            const bob = spriteKey.startsWith('run') ? Math.abs(Math.sin(Date.now() / 120)) * 6 : 0;
            ctx.drawImage(sprite, -w / 2, -h + 32 - bob, w, h);
          } else {
            // Vector Runner Body (Orange Jersey with number 127, Blue shorts,
            // brown hair ponytail)
            if (isSliding) {
              // Squash & stretch crouch pose while sliding
              ctx.scale(1.15, 0.6);
            }

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
          }

          // Jetpack flame while airborne (fades out with the landing ramp)
          if (flyP > 0.3) {
            ctx.fillStyle = '#ff5500';
            ctx.beginPath();
            ctx.moveTo(-12, 34);
            ctx.lineTo(12, 34);
            ctx.lineTo(0, 66 + Math.sin(Date.now() / 40) * 8);
            ctx.closePath();
            ctx.fill();
          }

          // GO! banner over runner
          ctx.fillStyle = '#ff5500';
          ctx.font = 'extrabold 32px sans-serif';
          ctx.textAlign = 'center';
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 4;
          ctx.strokeText('冲!', 0, -125);
          ctx.fillText('冲!', 0, -125);

          ctx.restore();

          // Shield bubble around the runner while active
          if (hasShieldRef.current) {
            const pulse = 1 + Math.sin(Date.now() / 150) * 0.05;
            ctx.save();
            ctx.translate(playerX, playerY - 60);
            ctx.scale(pulse, pulse);
            ctx.strokeStyle = 'rgba(127, 212, 255, 0.9)';
            ctx.fillStyle = 'rgba(127, 212, 255, 0.15)';
            ctx.lineWidth = 4;
            ctx.beginPath();
            ctx.arc(0, 0, 90, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
            ctx.restore();
          }
        }
      }

      frameRef.current = requestAnimationFrame(runLoop);
    };

    frameRef.current = requestAnimationFrame(runLoop);

    return () => {
      cancelAnimationFrame(frameRef.current);
      clearInterval(scoreInterval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="relative h-[calc(100vh-70px)] w-full bg-[#58b3ff] overflow-hidden select-none">
      {/* Canvas Game Render */}
      <canvas
        ref={canvasRef}
        className="w-full h-full touch-none"
      />

      {/* Floating HUD Top Banner */}
      <div className="absolute top-4 left-4 right-4 pointer-events-none z-20">
        {/* Right Score Badge */}
        <div className="absolute right-0 bg-[#006ef1] text-white px-5 py-2 rounded-full border-4 border-white shadow-lg flex items-center gap-1.5">
          <span className="font-bold text-xs uppercase text-blue-100">得分</span>
          <span className="font-extrabold text-xl sm:text-2xl">{score.toLocaleString()}</span>
        </div>
        {/* Score Doubler Badge (first 10s after purchase) */}
        {scoreBoost && (
          <div className="absolute right-0 top-14 bg-[#ff7a00] text-[#5c2800] px-4 py-1 rounded-full border-4 border-white shadow-lg font-extrabold text-sm">
            得分 x2
          </div>
        )}
      </div>

      {/* Coin Counter (top-left, below the camera feed) */}
      <div className="absolute top-[10.5rem] left-4 z-20 bg-[#ffd700] text-[#5c2800] px-4 py-1.5 rounded-full border-4 border-white shadow-lg flex items-center gap-1.5 pointer-events-none">
        <span className="material-symbols-outlined text-lg symbol-filled">monetization_on</span>
        <span className="font-extrabold text-lg">{coinsCollected}</span>
      </div>

      {/* Picture-in-Picture Motion Camera Feed Container */}
      <div className="absolute top-4 left-4 z-20 bg-slate-900 rounded-2xl overflow-hidden w-44 sm:w-56 h-32 sm:h-38 border-4 border-white shadow-2xl flex flex-col items-center justify-center">
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
              <p className="font-bold text-[10px] uppercase mt-1">摄像头关闭 - 键盘模式</p>
            </div>
          )}

          <div className="scanline absolute inset-0 pointer-events-none" />

          {/* Real YOLO26 Pose Skeleton Overlay (keypoints already mirrored) */}
          <canvas
            ref={skeletonCanvasRef}
            className="absolute inset-0 w-full h-full pointer-events-none"
          />

          <div className="absolute top-2 left-2 flex items-center gap-1.5 bg-black/50 px-2 py-0.5 rounded-full">
            <div
              className={`w-2 h-2 rounded-full ${
                poseStatus === 'active'
                  ? 'bg-emerald-400 animate-ping'
                  : poseStatus === 'loading'
                    ? 'bg-amber-400 animate-pulse'
                    : 'bg-red-400'
              }`}
            ></div>
            <span className="text-white text-[9px] font-bold uppercase">
              {poseStatus === 'active'
                ? '体感追踪中'
                : poseStatus === 'loading'
                  ? '加载 AI...'
                  : '键盘模式'}
            </span>
          </div>

          <div className="absolute bottom-0 left-0 right-0 bg-[#106e00]/90 py-1 text-center">
            <p className="text-white text-[10px] font-extrabold uppercase tracking-tight">
              动起来,开跑!
            </p>
          </div>
      </div>

      {/* Shield HUD: remaining free charges + 10s countdown while active */}
      <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 flex flex-col items-center gap-1 pointer-events-none">
        <div
          className={`px-4 py-1.5 rounded-full border-4 shadow-lg flex items-center gap-2 transition-colors ${
            hasShield
              ? 'bg-[#0057c1] border-[#7fd4ff] text-white'
              : 'bg-slate-800/80 border-slate-500 text-slate-300'
          }`}
        >
          <span className="material-symbols-outlined text-lg symbol-filled">shield</span>
          <span className="font-extrabold text-sm uppercase">
            {hasShield ? `护盾 ${shieldRemaining}秒` : `护盾 x${shieldCharges}`}
          </span>
        </div>
        {hasShield && (
          <div className="w-32 h-2 bg-slate-800/70 rounded-full overflow-hidden">
            <div
              className="h-full bg-[#7fd4ff] transition-all duration-200"
              style={{ width: `${(shieldRemaining / (shieldDurationMs / 1000)) * 100}%` }}
            />
          </div>
        )}
      </div>
    </div>
  );
};
