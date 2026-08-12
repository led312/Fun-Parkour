import React, { useState } from 'react';
import { playButtonClick } from '../utils/audio';

interface PauseMenuProps {
  isOpen: boolean;
  onClose: () => void;
  onQuit?: () => void;
  onHowToPlay?: () => void;
  soundEnabled: boolean;
  onToggleSound: () => void;
}

export const PauseMenu: React.FC<PauseMenuProps> = ({
  isOpen,
  onClose,
  onQuit,
  soundEnabled,
  onToggleSound,
}) => {
  const [showHowTo, setShowHowTo] = useState(false);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="bg-[#dde4e6] rounded-2xl border-4 border-[#8c7263] max-w-sm w-full shadow-[0_10px_0_0_rgba(0,0,0,0.3)] overflow-hidden">
        {showHowTo ? (
          <div className="p-6">
            <h2 className="font-extrabold text-2xl text-[#994700] text-center mb-4 flex items-center justify-center gap-2">
              <span className="material-symbols-outlined text-3xl">help</span>
              玩法说明
            </h2>
            <div className="space-y-3 text-[#161d1f] text-sm leading-relaxed mb-6 bg-white p-4 rounded-xl border-2 border-[#e0c0af] max-h-[60vh] overflow-y-auto">
              <p className="font-bold text-[#0057c1]">🕺 体感控制(摄像头):</p>
              <ul className="list-disc pl-5 space-y-1">
                <li><strong>左右移动身体:</strong>切换跑道。</li>
                <li><strong>原地起跳:</strong>跳过栏架。</li>
                <li><strong>快速下蹲:</strong>滑铲躲避障碍。</li>
                <li><strong>开合跳:</strong>开启护盾!</li>
              </ul>
              <p className="font-bold text-[#ff7a00] mt-2">⭐ 游戏目标:</p>
              <ul className="list-disc pl-5 space-y-1">
                <li>收集金币,躲开锥桶和栏架,跑出最高分!</li>
                <li>护盾每局 3 次,持续 10 秒,可抵挡一次撞击。</li>
                <li>商店道具:喷气背包(开局飞行 5 秒,天上全是金币)、超级护盾(开局自动获得 10 秒护盾)、分数加倍(开局 10 秒得分 x2)。</li>
              </ul>
            </div>
            <button
              onClick={() => {
                playButtonClick();
                setShowHowTo(false);
              }}
              className="w-full bg-[#0057c1] text-white font-bold py-3 rounded-xl border-b-4 border-[#001a43] hover:brightness-110 active:scale-95 transition-all"
            >
              返回菜单
            </button>
          </div>
        ) : (
          <div>
            <div className="p-6 text-center border-b-2 border-[#e0c0af] bg-[#e8eff1]">
              <h2 className="font-extrabold text-3xl text-[#994700] drop-shadow-[0_2px_0_rgba(153,71,0,0.5)]">
                暂停中
              </h2>
            </div>

            <div className="flex flex-col gap-2 p-4">
              {/* Keep Running */}
              <button
                onClick={() => {
                  playButtonClick();
                  onClose();
                }}
                className="bg-[#ff7a00] text-[#5c2800] font-bold text-lg rounded-xl border-b-4 border-[#753400] flex items-center gap-4 p-4 hover:brightness-110 active:scale-98 transition-all shadow-sm"
              >
                <span className="material-symbols-outlined text-2xl symbol-filled">play_arrow</span>
                <span>继续奔跑</span>
              </button>

              {/* Sound Options */}
              <button
                onClick={() => {
                  playButtonClick();
                  onToggleSound();
                }}
                className="bg-white text-[#584235] font-bold text-base rounded-xl border-2 border-[#e0c0af] flex items-center justify-between p-4 hover:bg-[#f4fafd] active:scale-98 transition-all"
              >
                <div className="flex items-center gap-4">
                  <span className="material-symbols-outlined text-2xl text-[#0057c1]">
                    {soundEnabled ? 'volume_up' : 'volume_off'}
                  </span>
                  <span>音效</span>
                </div>
                <span className={`px-3 py-1 rounded-full text-xs font-extrabold ${soundEnabled ? 'bg-emerald-100 text-emerald-800' : 'bg-gray-200 text-gray-600'}`}>
                  {soundEnabled ? '开' : '关'}
                </span>
              </button>

              {/* How to Play */}
              <button
                onClick={() => {
                  playButtonClick();
                  setShowHowTo(true);
                }}
                className="bg-white text-[#584235] font-bold text-base rounded-xl border-2 border-[#e0c0af] flex items-center gap-4 p-4 hover:bg-[#f4fafd] active:scale-98 transition-all"
              >
                <span className="material-symbols-outlined text-2xl text-[#0057c1]">help</span>
                <span>玩法说明</span>
              </button>

              {/* Quit Game */}
              {onQuit && (
                <button
                  onClick={() => {
                    playButtonClick();
                    onQuit();
                  }}
                  className="bg-red-50 text-red-700 font-bold text-base rounded-xl border-2 border-red-200 flex items-center gap-4 p-4 hover:bg-red-100 active:scale-98 transition-all mt-2"
                >
                  <span className="material-symbols-outlined text-2xl">exit_to_app</span>
                  <span>退出游戏</span>
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
