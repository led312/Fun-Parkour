// Casual mini Pac-Man: swipe on the maze (touch or mouse drag) to steer,
// arrow keys / WASD work too. No webcam, no pose tracking.

import React, { useEffect, useRef, useState } from 'react';
import { playButtonClick, playCoinSound, playVictorySound } from '../utils/audio';

interface PacmanScreenProps {
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

export const PacmanScreen: React.FC<PacmanScreenProps> = ({ onExit }) => {
  const [score, setScore] = useState(0);
  const [status, setStatus] = useState<GameStatus>('playing');
  const [runId, setRunId] = useState(0); // bump to restart

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const dirRef = useRef<Dir>(DIRS.left);
  const swipeRef = useRef<{ x: number; y: number } | null>(null);
  const statusRef = useRef<GameStatus>('playing');
  statusRef.current = status;

  // Keyboard + swipe steering. A swipe sets the desired direction along its
  // dominant axis; re-anchoring after every turn keeps long drags steerable.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      let handled = true;
      if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') dirRef.current = DIRS.left;
      else if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') dirRef.current = DIRS.right;
      else if (e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') dirRef.current = DIRS.up;
      else if (e.key === 'ArrowDown' || e.key === 's' || e.key === 'S') dirRef.current = DIRS.down;
      else handled = false;
      if (handled) e.preventDefault(); // arrows would otherwise scroll the page
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const onSwipeStart = (e: React.PointerEvent) => {
    // Capture the pointer so a drag that leaves the maze keeps steering
    (e.target as Element).setPointerCapture?.(e.pointerId);
    swipeRef.current = { x: e.clientX, y: e.clientY };
  };
  const onSwipeMove = (e: React.PointerEvent) => {
    const start = swipeRef.current;
    if (!start) return;
    const dx = e.clientX - start.x;
    const dy = e.clientY - start.y;
    if (Math.abs(dx) < 24 && Math.abs(dy) < 24) return;
    dirRef.current =
      Math.abs(dx) > Math.abs(dy)
        ? dx > 0
          ? DIRS.right
          : DIRS.left
        : dy > 0
          ? DIRS.down
          : DIRS.up;
    swipeRef.current = { x: e.clientX, y: e.clientY };
  };
  const onSwipeEnd = () => {
    swipeRef.current = null;
  };

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

      {/* Maze Canvas (swipe to steer) */}
      <div className="relative w-full max-w-md aspect-square rounded-2xl overflow-hidden border-4 border-white shadow-2xl">
        <canvas
          ref={canvasRef}
          width={450}
          height={450}
          className="w-full h-full touch-none"
          onPointerDown={onSwipeStart}
          onPointerMove={onSwipeMove}
          onPointerUp={onSwipeEnd}
          onPointerCancel={onSwipeEnd}
        />

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

      {/* On-screen D-pad: big tap targets for touch screens */}
      <div className="mt-4 z-10 grid grid-cols-3 gap-2">
        {(
          [
            { dir: null, icon: '' },
            { dir: DIRS.up, icon: 'arrow_upward' },
            { dir: null, icon: '' },
            { dir: DIRS.left, icon: 'arrow_back' },
            { dir: DIRS.down, icon: 'arrow_downward' },
            { dir: DIRS.right, icon: 'arrow_forward' },
          ] as const
        ).map(({ dir, icon }, i) =>
          dir === null ? (
            <div key={`empty-${i}`} />
          ) : (
            <button
              key={icon}
              onPointerDown={(e) => {
                e.preventDefault();
                dirRef.current = dir;
              }}
              className="w-16 h-14 rounded-2xl bg-[#0057c1] text-white border-b-4 border-[#001a43] flex items-center justify-center shadow-lg active:translate-y-0.5 active:border-b-2"
            >
              <span className="material-symbols-outlined text-3xl symbol-filled">{icon}</span>
            </button>
          ),
        )}
      </div>

      <p className="mt-4 text-sm font-bold text-[#584235] text-center z-10">
        点按方向按钮 / 在迷宫上滑动 / 键盘方向键,都可以转向
      </p>
    </div>
  );
};
