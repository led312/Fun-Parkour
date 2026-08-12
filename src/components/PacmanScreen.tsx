// Motion-controlled mini Pac-Man. Body lean steers Pac-Man through the maze:
// lean left/right to move sideways, stretch up / crouch down to move
// vertically. Reuses the YOLO26 pose model and skeleton overlay from the
// main game; keyboard arrows work as fallback.

import React, { useEffect, useRef, useState } from 'react';
import { playButtonClick, playCoinSound, playVictorySound } from '../utils/audio';
import {
  averageBaseline,
  detectPose,
  drawSkeleton,
  measureBaseline,
  measureShoulderX,
  measureShoulderY,
  PoseBaseline,
} from '../utils/poseDetector';

interface PacmanScreenProps {
  poseBaseline?: PoseBaseline | null;
  onExit: () => void;
}

interface Dir {
  x: number;
  y: number;
}

const DIRS: Record<string, Dir> = {
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
};

const MAP = [
  '###############',
  '#.....#.......#',
  '#.###.#.#####.#',
  '#.#.......#...#',
  '#.#.#####.#.#.#',
  '#.....#.....#.#',
  '#.###.#.###.#.#',
  '#......G.G....#',
  '#.###.#.###.#.#',
  '#.#.....#.....#',
  '#.#.#####.###.#',
  '#...#.......#.#',
  '#.#####.###.#.#',
  '#......P......#',
  '###############',
];

const ROWS = MAP.length;
const COLS = MAP[0].length;
const PAC_SPEED = 0.085; // tiles per frame
const GHOST_SPEED = 0.068;
const GHOST_COLORS = ['#ff3b3b', '#ff9ff3'];

type GameStatus = 'playing' | 'won' | 'lost';

function buildLevel() {
  const dots = new Set<string>();
  let pac = { x: 7, y: 13 };
  const ghosts: { x: number; y: number }[] = [];
  MAP.forEach((row, y) => {
    row.split('').forEach((cell, x) => {
      if (cell === '.') dots.add(`${x},${y}`);
      else if (cell === 'P') pac = { x, y };
      else if (cell === 'G') ghosts.push({ x, y });
    });
  });
  return { dots, pac, ghosts };
}

export const PacmanScreen: React.FC<PacmanScreenProps> = ({ poseBaseline = null, onExit }) => {
  const [score, setScore] = useState(0);
  const [status, setStatus] = useState<GameStatus>('playing');
  const [webcamActive, setWebcamActive] = useState(false);
  const [poseStatus, setPoseStatus] = useState<'loading' | 'active' | 'unavailable'>('loading');
  const [runId, setRunId] = useState(0); // bump to restart

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const skeletonCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const dirRef = useRef<Dir>(DIRS.left);
  const statusRef = useRef<GameStatus>('playing');
  statusRef.current = status;

  // Match skeleton overlay resolution to its displayed size
  useEffect(() => {
    const canvas = skeletonCanvasRef.current;
    if (!canvas) return;
    canvas.width = canvas.clientWidth;
    canvas.height = canvas.clientHeight;
  }, []);

  // Webcam init
  useEffect(() => {
    navigator.mediaDevices?.getUserMedia({ video: true })
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

  // Pose steering: dominant body-lean axis becomes Pac-Man's desired direction
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const baselineRef = { current: poseBaseline as PoseBaseline | null };
    const samples: PoseBaseline[] = [];
    let calibrationStart = 0;

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
            // Self-calibrate during the first second if no baseline was
            // captured on the calibration screen
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
              const sy = measureShoulderY(kps);
              if (sx !== null && sy !== null) {
                const dxN = (sx - b.centerX) / b.shoulderW; // + = lean right
                const dyN = (sy - b.shoulderY) / b.torso; // + = crouch, - = stretch up
                if (Math.abs(dxN) > 0.35 && Math.abs(dxN) >= Math.abs(dyN)) {
                  dirRef.current = dxN > 0 ? DIRS.right : DIRS.left;
                } else if (Math.abs(dyN) > 0.3) {
                  dirRef.current = dyN > 0 ? DIRS.down : DIRS.up;
                }
              }
            }
          }
        } catch (e) {
          console.warn('Pose detection unavailable in Pac-Man:', e);
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

  // Keyboard fallback
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') dirRef.current = DIRS.left;
      else if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') dirRef.current = DIRS.right;
      else if (e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') dirRef.current = DIRS.up;
      else if (e.key === 'ArrowDown' || e.key === 's' || e.key === 'S') dirRef.current = DIRS.down;
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Game loop
  useEffect(() => {
    const level = buildLevel();
    const pac = { ...level.pac, dir: DIRS.left };
    const ghosts = level.ghosts.map((g) => ({ ...g, dir: DIRS.up }));
    const dots = new Set(level.dots);
    const totalDots = dots.size;
    let frame = 0;
    let raf = 0;

    const canGo = (x: number, y: number, d: Dir) =>
      MAP[y + d.y]?.[x + d.x] !== undefined && MAP[y + d.y][x + d.x] !== '#';

    const step = (m: { x: number; y: number; dir: Dir }, want: Dir, speed: number) => {
      // Instant reverse is always allowed
      if (want.x === -m.dir.x && want.y === -m.dir.y) m.dir = want;
      const cx = Math.round(m.x);
      const cy = Math.round(m.y);
      if (Math.abs(m.x - cx) <= speed && Math.abs(m.y - cy) <= speed) {
        m.x = cx;
        m.y = cy;
        if (canGo(cx, cy, want)) m.dir = want;
        if (!canGo(cx, cy, m.dir)) return;
      }
      m.x += m.dir.x * speed;
      m.y += m.dir.y * speed;
    };

    const loop = () => {
      frame += 1;
      const canvas = canvasRef.current;

      if (statusRef.current === 'playing') {
        step(pac, dirRef.current, PAC_SPEED);

        // Eat the dot on Pac-Man's tile
        const key = `${Math.round(pac.x)},${Math.round(pac.y)}`;
        if (Math.abs(pac.x - Math.round(pac.x)) < 0.3 && Math.abs(pac.y - Math.round(pac.y)) < 0.3 && dots.has(key)) {
          dots.delete(key);
          playCoinSound();
          setScore(totalDots - dots.size);
          if (dots.size === 0) {
            setStatus('won');
            playVictorySound();
          }
        }

        // Ghosts: at tile centers pick the direction that closes in on
        // Pac-Man (never reversing), with a dash of randomness
        ghosts.forEach((g) => {
          const cx = Math.round(g.x);
          const cy = Math.round(g.y);
          let want = g.dir;
          if (Math.abs(g.x - cx) <= GHOST_SPEED && Math.abs(g.y - cy) <= GHOST_SPEED) {
            const options = Object.values(DIRS).filter(
              (d) => !(d.x === -g.dir.x && d.y === -g.dir.y) && canGo(cx, cy, d),
            );
            if (options.length > 0) {
              want =
                Math.random() < 0.75
                  ? options.reduce((best, d) =>
                      Math.abs(cx + d.x - pac.x) + Math.abs(cy + d.y - pac.y) <
                      Math.abs(cx + best.x - pac.x) + Math.abs(cy + best.y - pac.y)
                        ? d
                        : best,
                    )
                  : options[Math.floor(Math.random() * options.length)];
            }
          }
          step(g, want, GHOST_SPEED);

          // Caught!
          if (Math.abs(g.x - pac.x) < 0.55 && Math.abs(g.y - pac.y) < 0.55) {
            setStatus('lost');
          }
        });
      }

      // Render
      if (canvas) {
        const ctx = canvas.getContext('2d');
        if (ctx) {
          const tile = canvas.width / COLS;
          ctx.fillStyle = '#0a0a2e';
          ctx.fillRect(0, 0, canvas.width, canvas.height);

          MAP.forEach((row, y) => {
            row.split('').forEach((cell, x) => {
              if (cell === '#') {
                ctx.fillStyle = '#1d4ed8';
                ctx.fillRect(x * tile, y * tile, tile, tile);
                ctx.fillStyle = '#0a0a2e';
                ctx.fillRect(x * tile + 2, y * tile + 2, tile - 4, tile - 4);
              }
            });
          });

          ctx.fillStyle = '#ffd700';
          dots.forEach((key) => {
            const [x, y] = key.split(',').map(Number);
            ctx.beginPath();
            ctx.arc((x + 0.5) * tile, (y + 0.5) * tile, tile * 0.12, 0, Math.PI * 2);
            ctx.fill();
          });

          // Pac-Man with an animated mouth pointing along his direction
          const mouth = 0.22 + 0.18 * Math.abs(Math.sin(frame / 6));
          const angle = Math.atan2(pac.dir.y, pac.dir.x);
          ctx.fillStyle = '#ffe600';
          ctx.beginPath();
          ctx.moveTo((pac.x + 0.5) * tile, (pac.y + 0.5) * tile);
          ctx.arc(
            (pac.x + 0.5) * tile,
            (pac.y + 0.5) * tile,
            tile * 0.42,
            angle + Math.PI * mouth,
            angle + Math.PI * (2 - mouth),
          );
          ctx.closePath();
          ctx.fill();

          // Ghosts
          ghosts.forEach((g, i) => {
            const gx = (g.x + 0.5) * tile;
            const gy = (g.y + 0.5) * tile;
            ctx.fillStyle = GHOST_COLORS[i % GHOST_COLORS.length];
            ctx.beginPath();
            ctx.arc(gx, gy - tile * 0.08, tile * 0.36, Math.PI, 0);
            ctx.rect(gx - tile * 0.36, gy - tile * 0.08, tile * 0.72, tile * 0.42);
            ctx.fill();
            ctx.fillStyle = '#ffffff';
            ctx.beginPath();
            ctx.arc(gx - tile * 0.13, gy - tile * 0.12, tile * 0.09, 0, Math.PI * 2);
            ctx.arc(gx + tile * 0.13, gy - tile * 0.12, tile * 0.09, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#1d4ed8';
            ctx.beginPath();
            ctx.arc(gx - tile * 0.13 + g.dir.x * 3, gy - tile * 0.12 + g.dir.y * 3, tile * 0.045, 0, Math.PI * 2);
            ctx.arc(gx + tile * 0.13 + g.dir.x * 3, gy - tile * 0.12 + g.dir.y * 3, tile * 0.045, 0, Math.PI * 2);
            ctx.fill();
          });
        }
      }

      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [runId]);

  return (
    <div className="relative min-h-[calc(100vh-70px)] w-full flex flex-col items-center px-4 py-6 select-none">
      {/* Score HUD */}
      <div className="w-full max-w-md flex items-center justify-between mb-4 z-10">
        <div className="bg-[#ffd700] text-[#5c2800] px-4 py-1.5 rounded-full border-4 border-white shadow-lg flex items-center gap-1.5">
          <span className="material-symbols-outlined text-lg symbol-filled">stars</span>
          <span className="font-extrabold text-lg">{score} 豆</span>
        </div>
        <button
          onClick={() => {
            playButtonClick();
            onExit();
          }}
          className="bg-[#0057c1] text-white px-4 py-1.5 rounded-full border-4 border-white shadow-lg font-extrabold text-sm active:scale-95"
        >
          返回商店
        </button>
      </div>

      {/* Maze Canvas */}
      <div className="relative w-full max-w-md aspect-square rounded-2xl overflow-hidden border-4 border-white shadow-2xl">
        <canvas ref={canvasRef} width={450} height={450} className="w-full h-full" />

        {status !== 'playing' && (
          <div className="absolute inset-0 bg-black/70 flex flex-col items-center justify-center gap-4 z-10">
            <p className="font-extrabold text-4xl text-white drop-shadow-[0_4px_0_rgba(0,0,0,0.5)]">
              {status === 'won' ? '全部吃光,太棒了!' : '被幽灵抓到啦!'}
            </p>
            <p className="font-extrabold text-xl text-[#ffd700]">吃到 {score} 颗豆</p>
            <div className="flex gap-3">
              <button
                onClick={() => {
                  playButtonClick();
                  setScore(0);
                  setStatus('playing');
                  setRunId((n) => n + 1);
                }}
                className="bg-[#ff7a00] text-[#5c2800] px-6 py-3 rounded-2xl border-b-4 border-[#753400] font-extrabold active:scale-95"
              >
                再来一次
              </button>
              <button
                onClick={() => {
                  playButtonClick();
                  onExit();
                }}
                className="bg-[#0057c1] text-white px-6 py-3 rounded-2xl border-b-4 border-[#001a43] font-extrabold active:scale-95"
              >
                返回商店
              </button>
            </div>
          </div>
        )}
      </div>

      <p className="mt-4 text-sm font-bold text-[#584235] text-center z-10">
        左右倾斜身体 = 左右移动,向上跳 = 上移,蹲下 = 下移
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
