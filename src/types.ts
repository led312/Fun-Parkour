export type ScreenState = 'LOGIN' | 'LOBBY' | 'CALIBRATION' | 'GAMEPLAY' | 'RESULTS' | 'SHOP';

export interface UserProfile {
  name: string;
  parentEmail: string;
  isGuest: boolean;
  score: number;
  highScore: number;
  coins: number;
  stars: number;
  selectedAvatar: string;
  ownedItems: string[]; // shop item ids, e.g. 'shiba', 'rocket_boost'
}

export interface ShopItem {
  id: string;
  name: string;
  type: 'avatar' | 'powerup';
  description: string;
  cost: number;
  imageUrl?: string;
  icon?: string;
}
