import React, { useState, useEffect } from 'react';
import { UserProfile } from '../types';
import { playButtonClick } from '../utils/audio';
import { assetUrl } from '../utils/assets';

interface LobbyScreenProps {
  user: UserProfile;
  onStartCalibration: () => void;
  onOpenShop: () => void;
  onOpenSettings: () => void;
  onOpenSuika: () => void;
}

export const LobbyScreen: React.FC<LobbyScreenProps> = ({
  user,
  onStartCalibration,
  onOpenShop,
  onOpenSettings,
  onOpenSuika,
}) => {
  const [showToast, setShowToast] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      setShowToast(false);
    }, 4000);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="relative min-h-[calc(100vh-70px)] w-full flex flex-col items-center justify-between overflow-hidden select-none pb-24 pt-4">
      {/* Background Track Image (local crop of the original art, without the
          fake UI buttons baked into the source image) */}
      <div className="absolute inset-0 -z-10 overflow-hidden">
        <img
          src={assetUrl('/assets/lobby-bg.jpg')}
          alt="城市跑酷赛道"
          className="w-full h-full object-cover object-center opacity-90"
        />
        <div className="absolute inset-0 bg-white/10 backdrop-brightness-105"></div>
      </div>

      {/* High Score Toast Notification (only when there is a real record) */}
      <div
        className={`fixed top-20 left-1/2 -translate-x-1/2 bg-[#106e00] text-white px-6 py-2.5 rounded-full flex items-center gap-2.5 shadow-lg z-30 transition-all duration-500 border-2 border-white ${
          showToast && user.highScore > 0 ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-6 pointer-events-none'
        }`}
      >
        <span className="material-symbols-outlined text-white symbol-filled">stars</span>
        <span className="font-extrabold text-sm uppercase tracking-wider">
          新纪录:{user.highScore}!
        </span>
      </div>

      {/* Main Mascot & Hero Content */}
      <div className="relative z-10 w-full max-w-lg flex flex-col items-center my-auto px-4">
        {/* Mascot Image */}
        <div className="floating-star mb-6 sm:mb-8">
          <img
            src={assetUrl('/assets/mascot-shiba.png')}
            alt="吉祥物柴犬跑者"
            className="w-56 h-56 sm:w-64 sm:h-64 object-contain drop-shadow-xl"
          />
        </div>

        {/* Start Game Action Button (calibration is mandatory) */}
        <div className="flex flex-col sm:flex-row gap-3 w-full max-w-md">
          <button
            onClick={() => {
              playButtonClick();
              onStartCalibration();
            }}
            className="flex-1 bg-[#ff7a00] hover:brightness-110 active:scale-95 text-white rounded-2xl px-8 py-5 flex items-center justify-center gap-3 border-b-8 border-[#753400] shadow-xl transition-all group"
          >
            <span className="material-symbols-outlined text-4xl symbol-filled group-hover:scale-110 transition-transform">
              play_arrow
            </span>
            <span className="font-extrabold text-2xl sm:text-3xl tracking-wider">
              开始
            </span>
          </button>
        </div>

        {/* Shop & Settings (moved up from the old bottom nav bar) */}
        <div className="flex gap-3 w-full max-w-md mt-3">
          <button
            onClick={() => {
              playButtonClick();
              onOpenShop();
            }}
            className="flex-1 bg-[#0057c1] hover:brightness-110 active:scale-95 text-white rounded-2xl px-6 py-3.5 flex items-center justify-center gap-2 border-b-8 border-[#001a43] shadow-xl transition-all"
          >
            <span className="material-symbols-outlined text-2xl symbol-filled">storefront</span>
            <span className="font-extrabold text-lg tracking-wider">商店</span>
          </button>
          <button
            onClick={() => {
              playButtonClick();
              onOpenSettings();
            }}
            className="flex-1 bg-[#0057c1] hover:brightness-110 active:scale-95 text-white rounded-2xl px-6 py-3.5 flex items-center justify-center gap-2 border-b-8 border-[#001a43] shadow-xl transition-all"
          >
            <span className="material-symbols-outlined text-2xl symbol-filled">settings</span>
            <span className="font-extrabold text-lg tracking-wider">设置</span>
          </button>
        </div>

        {/* Suika Mini Game Entry */}
        <button
          onClick={() => {
            playButtonClick();
            onOpenSuika();
          }}
          className="w-full max-w-md mt-3 bg-[#20b900] hover:brightness-110 active:scale-95 text-white rounded-2xl px-6 py-3.5 flex items-center justify-center gap-2 border-b-8 border-[#0d4d00] shadow-xl transition-all"
        >
          <span className="material-symbols-outlined text-2xl symbol-filled">favorite</span>
          <span className="font-extrabold text-lg tracking-wider">合成大西瓜</span>
        </button>
      </div>
    </div>
  );
};
