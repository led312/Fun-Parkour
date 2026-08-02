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
      name: 'Shiba Parkour Dog',
      type: 'avatar',
      description: 'Energetic parkour puppy with orange headband!',
      cost: 500,
      unlocked: true,
      imageUrl: 'https://lh3.googleusercontent.com/aida-public/AB6AXuCU8N0o6n2nU7TPm-bakO1gnAsgq7WkhP2ZE16-Ssmu-3GnaN0eo5JAC-FScc44lpXgnwAJcXdTf-43ZymmnpW5N6GLgXilkSj6CUxameJTxYxULe3An6SDU9xL1X0Nxya-CIW-xED7V6eHiQj4-eficQMxntmQBCSpsOCARJV8lrP-C17EkZroBKjc4WF9dbr4AHRwklLrtHK6gU1gG79BX-_xf-uiHUbcEtYWXA9dfxy97O8Eyf_W',
    },
    {
      id: 'kinetic_hero',
      name: 'Kinetic Hero Girl',
      type: 'avatar',
      description: 'Fast track runner wearing bib 127!',
      cost: 800,
      unlocked: user.coins >= 800,
      icon: 'directions_run',
    },
    {
      id: 'shield_boost',
      name: 'Super Shield',
      type: 'powerup',
      description: 'Protects against 1 obstacle collision per run.',
      cost: 300,
      unlocked: true,
      icon: 'shield',
    },
    {
      id: 'rocket_boost',
      name: 'Rocket Jetpack',
      type: 'powerup',
      description: 'Fly over obstacles for 5 seconds!',
      cost: 1000,
      unlocked: false,
      icon: 'rocket_launch',
    },
  ];

  const handleBuy = (item: ShopItem) => {
    playButtonClick();
    if (user.coins >= item.cost) {
      playVictorySound();
      onUpdateUser({
        coins: user.coins - item.cost,
        selectedAvatar: item.type === 'avatar' ? item.id : user.selectedAvatar,
      });
    }
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
            <h2 className="font-extrabold text-2xl text-[#994700]">RUNNER SHOP</h2>
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
            <span className="font-extrabold text-lg text-[#161d1f]">{user.coins} Coins</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[#ff7a00] text-2xl symbol-filled">
              stars
            </span>
            <span className="font-extrabold text-lg text-[#161d1f]">{user.stars} Stars</span>
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
                  EQUIPPED
                </span>
              ) : item.unlocked ? (
                <button
                  onClick={() => {
                    playButtonClick();
                    onUpdateUser({ selectedAvatar: item.id });
                  }}
                  className="bg-[#0057c1] text-white text-xs font-extrabold px-4 py-2 rounded-xl border-b-4 border-[#001a43] active:scale-95"
                >
                  SELECT
                </button>
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
