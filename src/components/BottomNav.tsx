import React from 'react';
import { TabState } from '../types';
import { playButtonClick } from '../utils/audio';

interface BottomNavProps {
  activeTab: TabState;
  onTabSelect: (tab: TabState) => void;
  onMenuToggle?: () => void;
}

export const BottomNav: React.FC<BottomNavProps> = ({
  activeTab,
  onTabSelect,
  onMenuToggle,
}) => {
  return (
    <nav className="fixed bottom-0 left-0 w-full z-40 flex justify-center items-center gap-3 sm:gap-6 h-20 pb-safe px-4 bg-gradient-to-t from-[#f4fafd] via-[#f4fafd]/90 to-transparent pointer-events-none">
      <div className="flex items-center gap-3 sm:gap-6 pointer-events-auto bg-[#e8eff1]/90 backdrop-blur-md px-4 py-2 rounded-full border-4 border-white shadow-[0_6px_0_0_rgba(0,0,0,0.15)]">
        {/* Bolt Tab */}
        <button
          onClick={() => {
            playButtonClick();
            onTabSelect('bolt');
          }}
          className={`rounded-full p-3.5 border-4 border-white transition-all duration-200 active:scale-90 ${
            activeTab === 'bolt'
              ? 'bg-[#006ef1] text-white scale-110 shadow-[0_6px_0_0_#004397]'
              : 'bg-[#0057c1] text-white shadow-[0_5px_0_0_#001a43] hover:scale-105'
          }`}
          title="Energy & Power-ups"
        >
          <span className="material-symbols-outlined text-2xl sm:text-3xl symbol-filled">bolt</span>
        </button>

        {/* Shield / Menu Tab */}
        <button
          onClick={() => {
            playButtonClick();
            if (onMenuToggle) {
              onMenuToggle();
            } else {
              onTabSelect('shield');
            }
          }}
          className={`rounded-full p-3.5 border-4 border-white transition-all duration-200 active:scale-90 ${
            activeTab === 'shield'
              ? 'bg-[#006ef1] text-white scale-110 shadow-[0_6px_0_0_#004397]'
              : 'bg-[#0057c1] text-white shadow-[0_5px_0_0_#001a43] hover:scale-105'
          }`}
          title="Shield & Menu Options"
        >
          <span className="material-symbols-outlined text-2xl sm:text-3xl symbol-filled">shield</span>
        </button>

        {/* Rocket Tab (Primary Center) */}
        <button
          onClick={() => {
            playButtonClick();
            onTabSelect('rocket');
          }}
          className={`rounded-full p-4 border-4 border-white transition-all duration-200 active:scale-95 ${
            activeTab === 'rocket'
              ? 'bg-[#ff7a00] text-white scale-115 shadow-[0_8px_0_0_#753400] ring-4 ring-amber-300'
              : 'bg-[#0057c1] text-white shadow-[0_6px_0_0_#001a43] hover:scale-110'
          }`}
          title="Launch Game"
        >
          <span className="material-symbols-outlined text-3xl sm:text-4xl symbol-filled">rocket_launch</span>
        </button>

        {/* Auto Fix / Magic Wand Tab */}
        <button
          onClick={() => {
            playButtonClick();
            onTabSelect('wand');
          }}
          className={`rounded-full p-3.5 border-4 border-white transition-all duration-200 active:scale-90 ${
            activeTab === 'wand'
              ? 'bg-[#006ef1] text-white scale-110 shadow-[0_6px_0_0_#004397]'
              : 'bg-[#0057c1] text-white shadow-[0_5px_0_0_#001a43] hover:scale-105'
          }`}
          title="Customization Magic"
        >
          <span className="material-symbols-outlined text-2xl sm:text-3xl symbol-filled">auto_fix_high</span>
        </button>
      </div>
    </nav>
  );
};
