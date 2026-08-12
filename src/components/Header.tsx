import React from 'react';
import { ScreenState } from '../types';
import { playButtonClick } from '../utils/audio';

interface HeaderProps {
  screen: ScreenState;
  score: number;
  onProfileClick: () => void;
  onTitleClick: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  screen,
  score,
  onProfileClick,
  onTitleClick,
}) => {
  const isLogin = screen === 'LOGIN';

  return (
    <header className="w-full top-0 sticky bg-[#f4fafd] border-b-4 border-[#dde4e6] shadow-[0_4px_0_0_rgba(0,0,0,0.1)] z-50 transition-all">
      <div className="flex justify-between items-center px-5 py-3 w-full max-w-5xl mx-auto">
        <button
          onClick={() => {
            playButtonClick();
            onTitleClick();
          }}
          className="flex items-center gap-2 group text-left transition-transform active:scale-95"
        >
          {isLogin ? (
            <>
              <span className="material-symbols-outlined text-[#994700] text-3xl symbol-filled">
                bolt
              </span>
              <h1 className="font-extrabold text-2xl sm:text-3xl text-[#994700] tracking-tighter drop-shadow-[0_3px_0_rgba(153,71,0,1)]">
                动感跑酷
              </h1>
            </>
          ) : (
            <>
              <span className="material-symbols-outlined text-[#994700] text-3xl symbol-filled">
                favorite
              </span>
              <h1 className="font-extrabold text-2xl sm:text-3xl text-[#994700] tracking-tight drop-shadow-[0_3px_0_rgba(153,71,0,1)]">
                儿童酷跑!
              </h1>
            </>
          )}
        </button>

        <div className="flex items-center gap-3">
          {!isLogin ? (
            <div 
              onClick={() => {
                playButtonClick();
                onProfileClick();
              }}
              className="cursor-pointer bg-[#ff7a00] text-[#5c2800] px-4 py-1.5 rounded-full border-2 border-white shadow-[0_3px_0_0_#753400] font-bold text-sm sm:text-base hover:brightness-110 active:scale-95 transition-all flex items-center gap-1.5"
            >
              <span className="material-symbols-outlined text-amber-900 text-lg symbol-filled">stars</span>
              <span>得分:{score.toLocaleString()}</span>
            </div>
          ) : (
            <button
              onClick={() => {
                playButtonClick();
                onProfileClick();
              }}
              className="transition-transform duration-200 active:scale-95 hover:scale-110 p-1 text-[#584235]"
              title="账号"
            >
              <span className="material-symbols-outlined text-3xl">account_circle</span>
            </button>
          )}
        </div>
      </div>
    </header>
  );
};
