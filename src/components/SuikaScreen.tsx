// Motion-controlled Suika (watermelon merge) mini game. Lean left/right to
// move the drop point, squat to drop the fruit. Identical fruits merge into
// the next bigger one. Challenge: merge up to the level-6 fruit within one
// minute — succeed and you win; run out of time (or overflow the box) and
// the challenge fails. Keyboard arrows + space work as fallback, tap/click
// drops too.

import React, { useEffect, useRef, useState } from 'react';
import { playButtonClick, playJumpSound, playVictorySound } from '../utils/audio';
import {
  averageBaseline,
  detectPose,
  drawSkeleton,
  measureBaseline,
  measureHeadY,
  measureHipY,
  measureShoulderX,
  measureShoulderY,
  PoseBaseline,
} from '../utils/poseDetector';

interface SuikaScreenProps {
  poseBaseline?: PoseBaseline | null;
}

const W = 400;
const H = 560;
const WALL = 10;
const LINE_Y = 90; // game-over deadline near the top
const DROP_Y = 50;
const GRAVITY = 0.35;
const DROP_COOLDOWN_MS = 700;

// 6 levels total: merging two level-5 fruits creates the level-6 goal fruit
// and wins the challenge
const FRUITS = [
  { r: 14, color: '#ff6b6b', edge: '#c92a2a', score: 1 }, // 樱桃 (1级)
  { r: 20, color: '#ffa94d', edge: '#d9480f', score: 3 }, // 橘子 (2级)
  { r: 28, color: '#ffd43b', edge: '#f08c00', score: 6 }, // 柠檬 (3级)
  { r: 36, color: '#69db7c', edge: '#2f9e44', score: 10 }, // 猕猴桃 (4级)
  { r: 45, color: '#ff8787', edge: '#e03131', score: 15 }, // 苹果 (5级)
  { r: 55, color: '#4dabf7', edge: '#1971c2', score: 21 }, // 梨 (6级,目标!)
];
const GOAL_LEVEL = FRUITS.length - 1; // merging up to this level wins
const DROPPABLE = 4; // only levels 1-4 fall from the dropper: levels 5-6 must
// be earned by merging, so the goal always takes some work

interface Body {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  level: number;
  bornAt: number;
  merging?: boolean;
}

type GameStatus = 'playing' | 'won' | 'lost';

export const SuikaScreen: React.FC<SuikaScreenProps> = ({ poseBaseline = null }) => {
  const [score, setScore] = useState(0);
  const [status, setStatus] = useState<GameStatus>('playing');
  const [timeLeft, setTimeLeft] = useState(60);
  const [webcamActive, setWebcamActive] = useState(false);
  const [poseStatus, setPoseStatus] = useState<'loading' | 'active' | 'unavailable'>('loading');
  const [runId, setRunId] = useState(0);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const skeletonCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const dropXRef = useRef(W / 2);
  const bodiesRef = useRef<Body[]>([]);
  const nextIdRef = useRef(1);
  const currentRef = useRef(Math.floor(Math.random() * DROPPABLE));
  const nextRef = useRef(Math.floor(Math.random() * DROPPABLE));
  const lastDropRef = useRef(0);
  const statusRef = useRef<GameStatus>('playing');
  statusRef.current = status;

  const dropFruit = () => {
    const now = Date.now();
    if (statusRef.current !== 'playing' || now - lastDropRef.current < DROP_COOLDOWN_MS) return;
    lastDropRef.current = now;
    const level = currentRef.current;
    const r = FRUITS[level].r;
    bodiesRef.current.push({
      id: nextIdRef.current++,
      x: Math.min(W - WALL - r, Math.max(WALL + r, dropXRef.current)),
      y: DROP_Y,
      vx: 0,
      // Starts at rest and accelerates under gravity: reads as a natural
      // fall instead of an instant plunge, and keeps same-level fruits in
      // contact long enough to merge mid-air
      vy: 0,
      level,
      bornAt: now,
    });
    playJumpSound();
    currentRef.current = nextRef.current;
    nextRef.current = Math.floor(Math.random() * DROPPABLE);
  };
  const dropFruitRef = useRef(dropFruit);
  dropFruitRef.current = dropFruit;

  // Match skeleton overlay resolution to its displayed size
  useEffect(() => {
    const canvas = skeletonCanvasRef.current;
    if (!canvas) return;
    canvas.width = canvas.clientWidth;
    canvas.height = canvas.clientHeight;
  }, []);

  // Webcam init
  useEffect(() => {
    navigator.mediaDevices?.getUserMedia({ video: { width: { ideal: 640 }, height: { ideal: 480 } } })
      .then((stream) => {
        if (videoRef.current) videoRef.current.srcObject = stream;
        setWebcamActive(true);
      })
      .catch(() => setWebcamActive(false));
    return () => {
      const stream = videoRef.current?.srcObject as MediaStream | null;
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  // Pose steering: shoulder X slides the drop point, a jump drops the fruit
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const baselineRef = { current: poseBaseline as PoseBaseline | null };
    const samples: PoseBaseline[] = [];
    let calibrationStart = 0;
    let squatFrames = 0;
    let squatArmed = true;

    const tick = async () => {
      if (cancelled) return;
      const video = videoRef.current;
      if (video && video.readyState >= 2) {
        try {
          const kps = await detectPose(video);
          if (cancelled) return;
          setPoseStatus('active');
          const canvas = skeletonCanvasRef.current;
          if (canvas) drawSkeleton(canvas, video, kps);

          if (kps) {
            if (!baselineRef.current) {
              const m = measureBaseline(kps);
              if (m) {
                if (samples.length === 0) calibrationStart = Date.now();
                samples.push(m);
                if (Date.now() - calibrationStart >= 1000 && samples.length >= 3) {
                  baselineRef.current = averageBaseline(samples);
                }
              }
            } else {
              const b = baselineRef.current;
              const sx = measureShoulderX(kps);
              if (sx !== null) {
                const dxN = (sx - b.centerX) / b.shoulderW;
                dropXRef.current = Math.min(W - WALL, Math.max(WALL, W / 2 + dxN * W * 1.4));
              }
              // Squat to drop: majority vote across the available body cues
              // (head / shoulders / hips) clearly below baseline for 2 ticks,
              // so a single jittery keypoint can't drop a fruit by itself;
              // re-armed after an upper-body cue shows the player standing
              const headY = measureHeadY(kps);
              const sy = measureShoulderY(kps);
              const hy = measureHipY(kps);
              const squatVotes =
                (headY !== null && headY > b.headY + 0.2 * b.torso ? 1 : 0) +
                (sy !== null && sy > b.shoulderY + 0.18 * b.torso ? 1 : 0) +
                (hy !== null && hy > b.hipY + 0.12 * b.torso ? 1 : 0);
              const cuesAvailable =
                (headY !== null ? 1 : 0) + (sy !== null ? 1 : 0) + (hy !== null ? 1 : 0);
              const squatting = cuesAvailable >= 2 && squatVotes >= 2;
              if (squatting) {
                squatFrames += 1;
                if (squatFrames >= 2 && squatArmed) {
                  squatArmed = false;
                  dropFruitRef.current();
                }
              } else {
                squatFrames = 0;
                const recovered =
                  (headY !== null && headY < b.headY + 0.08 * b.torso) ||
                  (sy !== null && sy < b.shoulderY + 0.08 * b.torso);
                if (recovered) squatArmed = true;
              }
            }
          }
        } catch (e) {
          console.warn('Pose detection unavailable in Suika:', e);
          if (!cancelled) {
            setPoseStatus('unavailable');
            timer = setTimeout(tick, 3000);
          }
          return;
        }
      }
      timer = setTimeout(tick, 40);
    };
    tick();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keyboard fallback: arrows aim, space drops
  useEffect(() => {
    const held = new Set<string>();
    const onDown = (e: KeyboardEvent) => {
      if (e.key === ' ' || e.key === 'ArrowDown') {
        e.preventDefault();
        dropFruitRef.current();
        return;
      }
      held.add(e.key.toLowerCase());
    };
    const onUp = (e: KeyboardEvent) => held.delete(e.key.toLowerCase());
    const move = setInterval(() => {
      if (held.has('arrowleft') || held.has('a')) dropXRef.current -= 8;
      if (held.has('arrowright') || held.has('d')) dropXRef.current += 8;
      dropXRef.current = Math.min(W - WALL, Math.max(WALL, dropXRef.current));
    }, 30);
    window.addEventListener('keydown', onDown);
    window.addEventListener('keyup', onUp);
    return () => {
      clearInterval(move);
      window.removeEventListener('keydown', onDown);
      window.removeEventListener('keyup', onUp);
    };
  }, []);

  // Physics + render loop
  useEffect(() => {
    bodiesRef.current = [];
    let raf = 0;
    let overLineFrames = 0;
    const endAt = Date.now() + 60000; // one-minute round

    const loop = () => {
      const bodies = bodiesRef.current;
      const now = Date.now();

      // Countdown drives the end of the round: one minute, then it's over
      const left = Math.max(0, Math.ceil((endAt - now) / 1000));
      setTimeLeft((prev) => (prev === left ? prev : left));
      if (left <= 0 && statusRef.current === 'playing') {
        statusRef.current = 'lost';
        setStatus('lost');
      }

      if (statusRef.current === 'playing') {
        // Integrate + walls, 2 substeps for stability
        for (let sub = 0; sub < 2; sub++) {
          bodies.forEach((b) => {
            b.vy += GRAVITY / 2;
            b.vx *= 0.995;
            b.vy *= 0.999;
            b.x += b.vx / 2;
            b.y += b.vy / 2;
            const r = FRUITS[b.level].r;
            if (b.x < WALL + r) {
              b.x = WALL + r;
              b.vx = Math.abs(b.vx) * 0.3;
            } else if (b.x > W - WALL - r) {
              b.x = W - WALL - r;
              b.vx = -Math.abs(b.vx) * 0.3;
            }
            if (b.y > H - r) {
              b.y = H - r;
              b.vy = -Math.abs(b.vy) * 0.2;
              b.vx *= 0.9;
            }
          });

          // Circle collisions; same-level contact schedules a merge
          const merges: [Body, Body][] = [];
          for (let i = 0; i < bodies.length; i++) {
            for (let j = i + 1; j < bodies.length; j++) {
              const a = bodies[i];
              const b = bodies[j];
              const ra = FRUITS[a.level].r;
              const rb = FRUITS[b.level].r;
              const dx = b.x - a.x;
              const dy = b.y - a.y;
              const dist = Math.hypot(dx, dy) || 0.01;
              const minDist = ra + rb;
              // Merge on contact, not just on overlap: positional correction
              // leaves resting pairs exactly touching (dist == minDist),
              // which the old overlap-only check treated as "no collision",
              // so same-level fruits brushing past each other in mid-air
              // never merged. A small tolerance counts touching as contact.
              if (
                a.level === b.level &&
                a.level < FRUITS.length - 1 &&
                !a.merging &&
                !b.merging &&
                dist < minDist * 1.08
              ) {
                a.merging = true;
                b.merging = true;
                merges.push([a, b]);
                continue;
              }
              if (dist >= minDist) continue;
              // Positional correction + soft velocity exchange
              const nx = dx / dist;
              const ny = dy / dist;
              const overlap = (minDist - dist) / 2;
              a.x -= nx * overlap;
              a.y -= ny * overlap;
              b.x += nx * overlap;
              b.y += ny * overlap;
              const relVx = b.vx - a.vx;
              const relVy = b.vy - a.vy;
              const rel = relVx * nx + relVy * ny;
              if (rel < 0) {
                const impulse = -rel * 0.35;
                a.vx -= nx * impulse;
                a.vy -= ny * impulse;
                b.vx += nx * impulse;
                b.vy += ny * impulse;
              }
            }
          }

          // Apply merges: the pair becomes one fruit of the next level;
          // reaching the level-6 fruit wins the challenge on the spot
          merges.forEach(([a, b]) => {
            const level = a.level + 1;
            setScore((s) => s + FRUITS[level].score);
            playVictorySound();
            bodiesRef.current.push({
              id: nextIdRef.current++,
              x: (a.x + b.x) / 2,
              y: (a.y + b.y) / 2,
              vx: (a.vx + b.vx) / 2,
              vy: (a.vy + b.vy) / 2,
              level,
              bornAt: now,
            });
            if (level === GOAL_LEVEL && statusRef.current === 'playing') {
              statusRef.current = 'won';
              setStatus('won');
            }
          });
          if (merges.length > 0) {
            bodiesRef.current = bodiesRef.current.filter((b) => !b.merging);
          }
        }

        // Overflow also ends the round: a settled fruit stays above the
        // deadline line
        const danger = bodiesRef.current.some(
          (b) => now - b.bornAt > 1000 && b.y - FRUITS[b.level].r < LINE_Y && Math.abs(b.vy) < 1.5,
        );
        overLineFrames = danger ? overLineFrames + 1 : 0;
        if (overLineFrames > 90) {
          statusRef.current = 'lost';
          setStatus('lost');
        }
      }

      // Render
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext('2d');
      if (canvas && ctx) {
        ctx.fillStyle = '#fff8e1';
        ctx.fillRect(0, 0, W, H);

        // Deadline line
        ctx.strokeStyle = '#e03131';
        ctx.lineWidth = 3;
        ctx.setLineDash([10, 8]);
        ctx.beginPath();
        ctx.moveTo(WALL, LINE_Y);
        ctx.lineTo(W - WALL, LINE_Y);
        ctx.stroke();
        ctx.setLineDash([]);

        // Walls & floor
        ctx.fillStyle = '#8c7263';
        ctx.fillRect(0, 0, WALL, H);
        ctx.fillRect(W - WALL, 0, WALL, H);
        ctx.fillRect(0, H - 6, W, 6);

        // Fruits
        bodiesRef.current.forEach((b) => {
          const f = FRUITS[b.level];
          ctx.fillStyle = f.color;
          ctx.strokeStyle = f.edge;
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.arc(b.x, b.y, f.r, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
          // Gloss highlight
          ctx.fillStyle = 'rgba(255,255,255,0.35)';
          ctx.beginPath();
          ctx.arc(b.x - f.r * 0.3, b.y - f.r * 0.35, f.r * 0.22, 0, Math.PI * 2);
          ctx.fill();
        });

        // Dropper: guide line + current fruit + next preview
        if (statusRef.current === 'playing') {
          const level = currentRef.current;
          const r = FRUITS[level].r;
          const x = Math.min(W - WALL - r, Math.max(WALL + r, dropXRef.current));
          ctx.strokeStyle = 'rgba(0,0,0,0.15)';
          ctx.lineWidth = 2;
          ctx.setLineDash([6, 6]);
          ctx.beginPath();
          ctx.moveTo(x, DROP_Y + r);
          ctx.lineTo(x, H);
          ctx.stroke();
          ctx.setLineDash([]);
          ctx.fillStyle = FRUITS[level].color;
          ctx.strokeStyle = FRUITS[level].edge;
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.arc(x, DROP_Y, r, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();

          const nf = FRUITS[nextRef.current];
          ctx.fillStyle = 'rgba(0,0,0,0.4)';
          ctx.font = 'bold 13px sans-serif';
          ctx.textAlign = 'right';
          ctx.fillText('下一个', W - 20, 24);
          ctx.fillStyle = nf.color;
          ctx.strokeStyle = nf.edge;
          ctx.lineWidth = 2.5;
          ctx.beginPath();
          ctx.arc(W - 24 - nf.r * 0.4, 44, nf.r * 0.4, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
        }
      }

      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [runId]);

  const restart = () => {
    playButtonClick();
    setScore(0);
    setTimeLeft(60);
    setStatus('playing');
    currentRef.current = Math.floor(Math.random() * DROPPABLE);
    nextRef.current = Math.floor(Math.random() * DROPPABLE);
    setRunId((n) => n + 1);
  };

  return (
    <div className="relative min-h-[calc(100vh-70px)] w-full flex flex-col items-center px-4 py-6 select-none">
      {/* Score + Goal HUD */}
      <div className="w-full max-w-md flex items-center justify-between mb-4 z-10">
        <div className="bg-[#ff7a00] text-white px-4 py-1.5 rounded-full border-4 border-white shadow-lg flex items-center gap-1.5">
          <span className="font-bold text-xs uppercase">得分</span>
          <span className="font-extrabold text-xl">{score}</span>
        </div>
        <div className="bg-[#1971c2] text-white px-4 py-1.5 rounded-full border-4 border-white shadow-lg font-extrabold text-sm">
          目标: 合成 6 级大球
        </div>
      </div>

      {/* Playfield */}
      <div className="relative w-full max-w-md rounded-2xl overflow-hidden border-4 border-white shadow-2xl">
        {/* Round Countdown (top-left) */}
        <div
          className={`absolute top-2 left-2 z-10 px-3 py-1 rounded-full border-2 border-white shadow-lg font-extrabold text-sm ${
            timeLeft <= 10 ? 'bg-[#e03131] text-white animate-pulse' : 'bg-black/50 text-white'
          }`}
        >
          {Math.floor(timeLeft / 60)}:{String(timeLeft % 60).padStart(2, '0')}
        </div>
        <canvas
          ref={canvasRef}
          width={W}
          height={H}
          className="w-full block touch-none"
          onPointerDown={(e) => {
            const rect = (e.target as HTMLCanvasElement).getBoundingClientRect();
            dropXRef.current = ((e.clientX - rect.left) / rect.width) * W;
            dropFruitRef.current();
          }}
        />

        {status !== 'playing' && (
          <div className="absolute inset-0 bg-black/70 flex flex-col items-center justify-center gap-4 z-10">
            <p className="font-extrabold text-4xl text-white drop-shadow-[0_4px_0_rgba(0,0,0,0.5)]">
              {status === 'won' ? '挑战成功!' : '挑战失败,再试一次吧!'}
            </p>
            <p className="font-extrabold text-xl text-[#ffd700]">得分 {score}</p>
            <button
              onClick={restart}
              className="bg-[#ff7a00] text-[#5c2800] px-6 py-3 rounded-2xl border-b-4 border-[#753400] font-extrabold active:scale-95"
            >
              再来一次
            </button>
          </div>
        )}
      </div>

      <p className="mt-4 text-sm font-bold text-[#584235] text-center z-10">
        左右移动身体 = 移动落点,蹲一下 = 丢水果(限时 1 分钟合成 6 级大球!)
      </p>

      {/* Picture-in-Picture Motion Camera */}
      <div className="absolute top-4 left-4 z-20 bg-slate-900 rounded-2xl overflow-hidden w-36 h-26 border-4 border-white shadow-2xl flex items-center justify-center">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className={`w-full h-full object-cover scale-x-[-1] ${webcamActive ? 'block' : 'hidden'}`}
        />
        {!webcamActive && (
          <span className="material-symbols-outlined text-3xl text-emerald-400">accessibility_new</span>
        )}
        <canvas ref={skeletonCanvasRef} className="absolute inset-0 w-full h-full pointer-events-none" />
        <div className="absolute top-1.5 left-1.5 flex items-center gap-1 bg-black/50 px-1.5 py-0.5 rounded-full">
          <div
            className={`w-1.5 h-1.5 rounded-full ${
              poseStatus === 'active'
                ? 'bg-emerald-400 animate-ping'
                : poseStatus === 'loading'
                  ? 'bg-amber-400 animate-pulse'
                  : 'bg-red-400'
            }`}
          />
          <span className="text-white text-[8px] font-bold">
            {poseStatus === 'active' ? '体感追踪中' : poseStatus === 'loading' ? '加载 AI...' : '键盘模式'}
          </span>
        </div>
      </div>
    </div>
  );
};
