export type ScreenState = 'LOGIN' | 'LOBBY' | 'CALIBRATION' | 'GAMEPLAY' | 'RESULTS' | 'SHOP' | 'PACMAN' | 'SUIKA';

export interface UserProfile {
  name: string;
  parentEmail: string;
  isGuest: boolean;
  score: number;
  highScore: number;
  coins: number;
  stars: number;
  shieldTrials: number; // lifetime free shield activations left (starts at 3)
  upgrades: Record<string, number>; // powerup id -> permanent duration level
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
