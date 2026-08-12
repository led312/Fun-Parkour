import React from 'react';
import { UserProfile, ShopItem } from '../types';
import { playButtonClick, playVictorySound } from '../utils/audio';

interface ShopScreenProps {
  user: UserProfile;
  onUpdateUser: (updatedUser: Partial<UserProfile>) => void;
  onClose: () => void;
}

export const ShopScreen: React.FC<ShopScreenProps> = ({
  user,
  onUpdateUser,
  onClose,
}) => {
  const shopItems: ShopItem[] = [
    {
      id: 'shiba',
      name: '跑酷柴犬',
      type: 'avatar',
      description: '活力满满的跑酷小狗,戴着橙色发带!',
      cost: 500,
      imageUrl: '/mascot-shiba.png',
    },
    {
      id: 'kinetic_hero',
      name: '动感女跑手',
      type: 'avatar',
      description: '跑得飞快的 127 号选手!',
      cost: 800,
      icon: 'directions_run',
    },
    {
      id: 'shield_boost',
      name: '超级护盾',
      type: 'powerup',
      description: '每局护盾次数 +1。',
      cost: 300,
      icon: 'shield',
    },
    {
      id: 'rocket_boost',
      name: '火箭喷气背包',
      type: 'powerup',
      description: '跳跃中再跳一次,飞行 5 秒越过一切,每局一次!',
      cost: 1000,
      icon: 'rocket_launch',
    },
  ];

  const handleBuy = (item: ShopItem) => {
    playButtonClick();
    if (user.coins < item.cost || user.ownedItems.includes(item.id)) return;
    playVictorySound();
    onUpdateUser({
      coins: user.coins - item.cost,
      ownedItems: [...user.ownedItems, item.id],
      selectedAvatar: item.type === 'avatar' ? item.id : user.selectedAvatar,
    });
  };

  return (
    <div className="relative min-h-[calc(100vh-70px)] w-full flex flex-col items-center px-4 py-6 overflow-y-auto pb-28">
      <div className="w-full max-w-lg bg-white rounded-3xl border-4 border-[#e0c0af] p-6 shadow-xl">
        {/* Header */}
        <div className="flex justify-between items-center border-b-4 border-[#e0c0af] pb-4 mb-5">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[#ff7a00] text-3xl symbol-filled">
              storefront
            </span>
            <h2 className="font-extrabold text-2xl text-[#994700]">跑酷商店</h2>
          </div>
          
          <button
            onClick={() => {
              playButtonClick();
              onClose();
            }}
            className="bg-[#0057c1] text-white p-2 rounded-full border-2 border-white shadow-md active:scale-90"
          >
            <span className="material-symbols-outlined text-xl">close</span>
          </button>
        </div>

        {/* User Balance */}
        <div className="flex justify-around bg-[#e8eff1] p-3 rounded-2xl border-2 border-[#e0c0af] mb-6">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[#ffd700] text-2xl symbol-filled">
              monetization_on
            </span>
            <span className="font-extrabold text-lg text-[#161d1f]">{user.coins} 金币</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[#ff7a00] text-2xl symbol-filled">
              stars
            </span>
            <span className="font-extrabold text-lg text-[#161d1f]">{user.stars} 星星</span>
          </div>
        </div>

        {/* Shop Items List */}
        <div className="space-y-4">
          {shopItems.map((item) => (
            <div
              key={item.id}
              className="bg-[#f4fafd] rounded-2xl p-4 border-2 border-[#e0c0af] flex items-center justify-between gap-4 shadow-sm hover:border-[#0057c1] transition-all"
            >
              <div className="flex items-center gap-3">
                {item.imageUrl ? (
                  <img
                    src={item.imageUrl}
                    alt={item.name}
                    className="w-14 h-14 object-contain rounded-xl bg-white p-1 border border-gray-200"
                  />
                ) : (
                  <div className="w-14 h-14 rounded-xl bg-[#006ef1] text-white flex items-center justify-center border-2 border-white">
                    <span className="material-symbols-outlined text-3xl symbol-filled">
                      {item.icon || 'star'}
                    </span>
                  </div>
                )}

                <div>
                  <h3 className="font-extrabold text-lg text-[#161d1f]">{item.name}</h3>
                  <p className="text-xs text-[#584235] leading-tight">{item.description}</p>
                </div>
              </div>

              {user.selectedAvatar === item.id ? (
                <span className="bg-[#20b900] text-white text-xs font-extrabold px-3 py-1.5 rounded-full border border-white">
                  已装备
                </span>
              ) : user.ownedItems.includes(item.id) ? (
                item.type === 'avatar' ? (
                  <button
                    onClick={() => {
                      playButtonClick();
                      onUpdateUser({ selectedAvatar: item.id });
                    }}
                    className="bg-[#0057c1] text-white text-xs font-extrabold px-4 py-2 rounded-xl border-b-4 border-[#001a43] active:scale-95"
                  >
                    选择
                  </button>
                ) : (
                  <span className="bg-[#20b900] text-white text-xs font-extrabold px-3 py-1.5 rounded-full border border-white">
                    已拥有
                  </span>
                )
              ) : (
                <button
                  onClick={() => handleBuy(item)}
                  disabled={user.coins < item.cost}
                  className={`text-xs font-extrabold px-4 py-2 rounded-xl border-b-4 flex items-center gap-1 active:scale-95 ${
                    user.coins >= item.cost
                      ? 'bg-[#ff7a00] text-[#5c2800] border-[#753400] hover:brightness-110'
                      : 'bg-gray-300 text-gray-500 border-gray-400 cursor-not-allowed'
                  }`}
                >
                  <span className="material-symbols-outlined text-sm symbol-filled">monetization_on</span>
                  <span>{item.cost}</span>
                </button>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
