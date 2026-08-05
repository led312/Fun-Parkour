export type ScreenState = 'LOGIN' | 'LOBBY' | 'CALIBRATION' | 'GAMEPLAY' | 'RESULTS' | 'SHOP';

export type TabState = 'bolt' | 'shield' | 'rocket';

export interface UserProfile {
  name: string;
  parentEmail: string;
  isGuest: boolean;
  score: number;
  highScore: number;
  coins: number;
  stars: number;
  selectedAvatar: string;
}

export interface ShopItem {
  id: string;
  name: string;
  type: 'avatar' | 'powerup';
  description: string;
  cost: number;
  unlocked: boolean;
  imageUrl?: string;
  icon?: string;
}
