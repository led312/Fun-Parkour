import React, { useEffect, useState } from 'react';
import { ScreenState, UserProfile } from './types';
import { PoseBaseline } from './utils/poseDetector';
import { Header } from './components/Header';
import { LoginScreen } from './components/LoginScreen';
import { LobbyScreen } from './components/LobbyScreen';
import { DifficultyScreen } from './components/DifficultyScreen';
import { CalibrationScreen } from './components/CalibrationScreen';
import { GameplayScreen } from './components/GameplayScreen';
import { ResultsScreen } from './components/ResultsScreen';
import { ShopScreen } from './components/ShopScreen';
import { PacmanScreen } from './components/PacmanScreen';
import { SuikaScreen } from './components/SuikaScreen';
import { PauseMenu } from './components/PauseMenu';

// Progress (high score, coins, purchases) and the login session survive page
// reloads via localStorage.
const USER_KEY = 'kidrun.user';
const SESSION_KEY = 'kidrun.session';

const DEFAULT_USER: UserProfile = {
  name: '小跑手',
  parentEmail: '',
  isGuest: false,
  score: 0,
  highScore: 0,
  coins: 0,
  stars: 0,
  shieldTrials: 3,
  upgrades: {},
  selectedAvatar: 'shiba',
  ownedItems: ['shiba'],
};

function loadStoredUser(): UserProfile {
  try {
    const raw = localStorage.getItem(USER_KEY);
    if (raw) return { ...DEFAULT_USER, ...JSON.parse(raw) };
  } catch {
    // corrupted storage -> fall through to defaults
  }
  return DEFAULT_USER;
}

export default function App() {
  const [screen, setScreen] = useState<ScreenState>(() =>
    localStorage.getItem(SESSION_KEY) ? 'LOBBY' : 'LOGIN',
  );
  const [isPauseOpen, setIsPauseOpen] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);

  const [user, setUser] = useState<UserProfile>(loadStoredUser);

  const [lastRunScore, setLastRunScore] = useState(0);
  const [lastCoinsEarned, setLastCoinsEarned] = useState(0);
  // Difficulty multiplier picked on the difficulty screen before each run
  const [difficulty, setDifficulty] = useState(1);
  // Standing-pose baseline captured on the calibration screen (null = the
  // game calibrates itself during the first second of play)
  const [poseBaseline, setPoseBaseline] = useState<PoseBaseline | null>(null);

  useEffect(() => {
    localStorage.setItem(USER_KEY, JSON.stringify(user));
  }, [user]);

  const handleLoginSuccess = (name: string, email: string, isGuest: boolean) => {
    localStorage.setItem(SESSION_KEY, JSON.stringify({ name }));
    setUser((prev) => ({
      ...prev,
      name,
      parentEmail: email,
      isGuest,
    }));
    setScreen('LOBBY');
  };

  const handleGameOver = (finalScore: number, coinsCollected: number, trialShieldsUsed: number) => {
    const newHigh = Math.max(user.highScore, finalScore);
    setUser((prev) => ({
      ...prev,
      score: finalScore,
      highScore: newHigh,
      coins: prev.coins + coinsCollected,
      shieldTrials: Math.max(0, prev.shieldTrials - trialShieldsUsed),
      // Shop powerups are consumable: one run per purchase
      ownedItems: prev.ownedItems.filter(
        (id) => id !== 'rocket_boost' && id !== 'shield_boost' && id !== 'score_doubler',
      ),
    }));
    setLastRunScore(finalScore);
    setLastCoinsEarned(coinsCollected);
    setScreen('RESULTS');
  };

  return (
    <div className="min-h-screen w-full bg-[#f4fafd] text-[#161d1f] flex flex-col justify-between font-['Plus_Jakarta_Sans',sans-serif] relative overflow-x-hidden">
      {/* Sticky Header */}
      <Header
        screen={screen}
        score={user.score}
        onProfileClick={() => {
          if (screen !== 'LOGIN') {
            setScreen('SHOP');
          }
        }}
        onTitleClick={() => {
          if (screen !== 'LOGIN') {
            setScreen('LOBBY');
          }
        }}
      />

      {/* Main Screen Content */}
      <main className="flex-1 w-full max-w-5xl mx-auto relative z-10">
        {screen === 'LOGIN' && (
          <LoginScreen
            user={user}
            onLoginSuccess={handleLoginSuccess}
          />
        )}

        {screen === 'LOBBY' && (
          <LobbyScreen
            user={user}
            onStartCalibration={() => setScreen('DIFFICULTY')}
            onOpenShop={() => setScreen('SHOP')}
            onOpenSettings={() => setIsPauseOpen(true)}
            onOpenSuika={() => setScreen('SUIKA')}
          />
        )}

        {screen === 'DIFFICULTY' && (
          <DifficultyScreen
            onSelect={(mult) => {
              setDifficulty(mult);
              setScreen('CALIBRATION');
            }}
          />
        )}

        {screen === 'CALIBRATION' && (
          <CalibrationScreen
            onCalibrationComplete={(baseline) => {
              setPoseBaseline(baseline);
              setScreen('GAMEPLAY');
            }}
            onPause={() => setIsPauseOpen(true)}
          />
        )}

        {screen === 'GAMEPLAY' && (
          <GameplayScreen
            poseBaseline={poseBaseline}
            difficulty={difficulty}
            hasJetpack={user.ownedItems.includes('rocket_boost')}
            hasSuperShield={user.ownedItems.includes('shield_boost')}
            hasScoreDoubler={user.ownedItems.includes('score_doubler')}
            shieldTrials={user.shieldTrials}
            jetpackDurationMs={5000 + 5000 * (user.upgrades['rocket_boost'] ?? 0)}
            shieldDurationMs={10000 + 5000 * (user.upgrades['shield_boost'] ?? 0)}
            boostDurationMs={10000 + 5000 * (user.upgrades['score_doubler'] ?? 0)}
            onConsumeJetpack={() =>
              setUser((u) => ({
                ...u,
                ownedItems: u.ownedItems.filter((id) => id !== 'rocket_boost'),
              }))
            }
            onGameOver={handleGameOver}
            onPause={() => setIsPauseOpen(true)}
          />
        )}

        {screen === 'RESULTS' && (
          <ResultsScreen
            score={lastRunScore}
            coinsEarned={lastCoinsEarned}
            onReplay={() => setScreen('CALIBRATION')}
            onHome={() => setScreen('LOBBY')}
          />
        )}

        {screen === 'SHOP' && (
          <ShopScreen
            user={user}
            onUpdateUser={(updated) => setUser((u) => ({ ...u, ...updated }))}
            onClose={() => setScreen('LOBBY')}
            onOpenPacman={() => setScreen('PACMAN')}
          />
        )}

        {screen === 'PACMAN' && (
          <PacmanScreen
            onExit={() => setScreen('SHOP')}
          />
        )}

        {screen === 'SUIKA' && (
          <SuikaScreen
            poseBaseline={poseBaseline}
          />
        )}
      </main>

      {/* Pause & Settings Modal Popup */}
      <PauseMenu
        isOpen={isPauseOpen}
        onClose={() => setIsPauseOpen(false)}
        soundEnabled={soundEnabled}
        onToggleSound={() => setSoundEnabled(!soundEnabled)}
        onQuit={
          screen !== 'LOGIN' && screen !== 'LOBBY'
            ? () => {
                setIsPauseOpen(false);
                setScreen('LOBBY');
              }
            : undefined
        }
      />
    </div>
  );
}
