import React, { useEffect, useState } from 'react';
import { playButtonClick, playVictorySound } from '../utils/audio';
import { assetUrl } from '../utils/assets';

interface ResultsScreenProps {
  score: number;
  coinsEarned: number;
  onReplay: () => void;
  onHome: () => void;
}

interface ConfettiPiece {
  id: number;
  x: number;
  color: string;
  size: number;
  duration: number;
}

export const ResultsScreen: React.FC<ResultsScreenProps> = ({
  score,
  coinsEarned,
  onReplay,
  onHome,
}) => {
  const [confetti, setConfetti] = useState<ConfettiPiece[]>([]);

  useEffect(() => {
    playVictorySound();

    const colors = ['#ff7a00', '#0057c1', '#20b900', '#ffb68b', '#79ff5b', '#ffffff'];
    const pieces: ConfettiPiece[] = [];

    for (let i = 0; i < 45; i++) {
      pieces.push({
        id: i,
        x: Math.random() * 100,
        color: colors[Math.floor(Math.random() * colors.length)],
        size: Math.random() * 10 + 6,
        duration: Math.random() * 3 + 2,
      });
    }

    setConfetti(pieces);
  }, []);

  return (
    <div className="relative min-h-[calc(100vh-70px)] w-full flex flex-col items-center justify-between px-4 py-8 overflow-hidden select-none pb-28">
      {/* Celebration Confetti Overlay Layer */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
        {confetti.map((c) => (
          <div
            key={c.id}
            className="absolute rounded-sm animate-fall"
            style={{
              left: `${c.x}vw`,
              top: '-20px',
              width: `${c.size}px`,
              height: `${c.size}px`,
              backgroundColor: c.color,
              animation: `fall ${c.duration}s linear infinite`,
            }}
          />
        ))}
      </div>

      <main className="relative z-10 flex flex-col items-center justify-center w-full max-w-md mx-auto my-auto">
        {/* Bubbly Header: AWESOME JOB! */}
        <div className="text-center mb-6">
          <h1 className="font-extrabold text-4xl sm:text-5xl text-[#ff7a00] drop-shadow-[4px_4px_0_#753400] flex justify-center gap-1.5 sm:gap-2">
            {'太棒了'.split('').map((char, index) => (
              <span
                key={index}
                className="bouncy-text"
                style={{ animationDelay: `${index * 0.1}s` }}
              >
                {char}
              </span>
            ))}
          </h1>
          <h2 className="font-extrabold text-3xl sm:text-4xl text-[#0057c1] drop-shadow-[2px_2px_0_#001a43] mt-1">
            干得漂亮!
          </h2>
        </div>

        {/* Trophy & Total Score Card */}
        <div className="relative bg-white rounded-3xl border-4 border-[#e0c0af] p-6 sm:p-8 w-full shadow-[0_8px_0_0_#e0c0af] flex flex-col items-center gap-5 mt-8">
          {/* Trophy Image */}
          <div
            className="trophy-glow -mt-20 w-44 h-44 sm:w-48 sm:h-48 bg-cover bg-center rounded-full border-8 border-white shadow-xl"
            style={{
              backgroundImage: `url('${assetUrl('/assets/trophy.png')}')`,
            }}
          />

          {/* Total Score Section */}
          <div className="text-center w-full">
            <p className="font-bold text-xs sm:text-sm text-[#584235] uppercase tracking-widest mb-1.5">
              总得分
            </p>
            <div className="bg-[#d9e2ff] text-[#001a43] px-8 sm:px-10 py-2.5 sm:py-3 rounded-full border-4 border-white shadow-[0_6px_0_0_#afc6ff] font-extrabold text-2xl sm:text-3xl inline-block">
              {score.toLocaleString()}
            </div>
          </div>

          {/* Coins Collected This Run */}
          <div className="flex items-center gap-2.5 bg-[#fff8e1] px-8 py-2.5 rounded-full border-4 border-[#ffd700] shadow-[0_6px_0_0_#e6c200] mt-1">
            <span className="material-symbols-outlined text-[#ffd700] text-3xl symbol-filled drop-shadow-[0_2px_0_#b39200]">
              monetization_on
            </span>
            <span className="font-extrabold text-2xl text-[#b39200]">
              +{coinsEarned} 金币
            </span>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="mt-8 flex flex-col w-full gap-4">
          {/* Replay Button */}
          <button
            onClick={() => {
              playButtonClick();
              onReplay();
            }}
            className="btn-bounce group w-full"
          >
            <div className="bg-[#ff7a00] text-[#5c2800] py-4 rounded-2xl border-2 border-white border-b-8 border-b-[#753400] font-extrabold text-2xl sm:text-3xl transition-all group-hover:brightness-110 active:border-b-2 flex items-center justify-center gap-3 shadow-xl">
              <span className="material-symbols-outlined text-3xl sm:text-4xl symbol-filled">
                replay
              </span>
              <span>再来一次</span>
            </div>
          </button>

          {/* Back to Home Button */}
          <button
            onClick={() => {
              playButtonClick();
              onHome();
            }}
            className="btn-bounce group w-full"
          >
            <div className="bg-[#0057c1] text-white py-4 rounded-2xl border-2 border-white border-b-8 border-b-[#001a43] font-extrabold text-2xl sm:text-3xl transition-all group-hover:brightness-110 active:border-b-2 flex items-center justify-center gap-3 shadow-xl">
              <span className="material-symbols-outlined text-3xl sm:text-4xl">
                home
              </span>
              <span>回首页</span>
            </div>
          </button>
        </div>
      </main>
    </div>
  );
};
