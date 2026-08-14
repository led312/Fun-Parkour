// Difficulty picker shown right after the lobby's start button: the chosen
// multiplier scales obstacle density and track speed for the whole run,
// then the flow moves on to the calibration screen.

import React from 'react';
import { playButtonClick } from '../utils/audio';

interface DifficultyScreenProps {
  onSelect: (difficulty: number) => void;
}

const OPTIONS = [
  { label: '简单', mult: 0.6, bg: '#20b900', border: '#0d4d00', icon: 'sentiment_satisfied' },
  { label: '普通', mult: 1.0, bg: '#0057c1', border: '#001a43', icon: 'directions_run' },
  { label: '困难', mult: 1.6, bg: '#ff7a00', border: '#753400', icon: 'local_fire_department' },
  { label: '地狱', mult: 3.0, bg: '#e03131', border: '#5c0a0a', icon: 'skull' },
] as const;

export const DifficultyScreen: React.FC<DifficultyScreenProps> = ({ onSelect }) => (
  <div className="relative min-h-[calc(100vh-70px)] w-full flex flex-col items-center justify-center px-4 select-none">
    <h1 className="font-extrabold text-4xl sm:text-5xl text-[#161d1f] mb-10 tracking-wider drop-shadow-sm">
      难度切换
    </h1>
    <div className="grid grid-cols-2 gap-4 w-full max-w-md">
      {OPTIONS.map((opt) => (
        <button
          key={opt.label}
          onClick={() => {
            playButtonClick();
            onSelect(opt.mult);
          }}
          className="hover:brightness-110 active:scale-95 text-white rounded-2xl px-6 py-6 flex flex-col items-center gap-1 border-b-8 shadow-xl transition-all"
          style={{ backgroundColor: opt.bg, borderColor: opt.border }}
        >
          <span className="material-symbols-outlined text-4xl symbol-filled">{opt.icon}</span>
          <span className="font-extrabold text-2xl tracking-wider">{opt.label}</span>
          <span className="font-bold text-sm opacity-80">速度/障碍 x{opt.mult}</span>
        </button>
      ))}
    </div>
  </div>
);
