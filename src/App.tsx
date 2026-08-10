import React, { useEffect, useState } from 'react';
import { ScreenState, UserProfile } from './types';
import { PoseBaseline } from './utils/poseDetector';
import { Header } from './components/Header';
import { LoginScreen } from './components/LoginScreen';
import { LobbyScreen } from './components/LobbyScreen';
import { CalibrationScreen } from './components/CalibrationScreen';
import { GameplayScreen } from './components/GameplayScreen';
import { ResultsScreen } from './components/ResultsScreen';
import { ShopScreen } from './components/ShopScreen';
import { PauseMenu } from './components/PauseMenu';

// Progress (high score, coins, purchases) and the login session survive page
// reloads via localStorage.
const USER_KEY = 'kidrun.user';
const SESSION_KEY = 'kidrun.session';

const DEFAULT_USER: UserProfile = {
  name: 'Speedy Runner',
  parentEmail: '',
  isGuest: false,
  score: 0,
  highScore: 0,
  coins: 1250,
  stars: 12,
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
  const [lastStarsEarned, setLastStarsEarned] = useState(0);
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

  const handleGameOver = (finalScore: number, starsEarned: number) => {
    const newHigh = Math.max(user.highScore, finalScore);
    setUser((prev) => ({
      ...prev,
      score: finalScore,
      highScore: newHigh,
      coins: prev.coins + Math.floor(finalScore / 10),
      stars: prev.stars + starsEarned,
    }));
    setLastRunScore(finalScore);
    setLastStarsEarned(starsEarned);
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
            onStartCalibration={() => setScreen('CALIBRATION')}
            onOpenShop={() => setScreen('SHOP')}
            onOpenSettings={() => setIsPauseOpen(true)}
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
            hasJetpack={user.ownedItems.includes('rocket_boost')}
            hasSuperShield={user.ownedItems.includes('shield_boost')}
            onGameOver={handleGameOver}
            onPause={() => setIsPauseOpen(true)}
          />
        )}

        {screen === 'RESULTS' && (
          <ResultsScreen
            score={lastRunScore}
            starsEarned={lastStarsEarned}
            onReplay={() => setScreen('CALIBRATION')}
            onHome={() => setScreen('LOBBY')}
          />
        )}

        {screen === 'SHOP' && (
          <ShopScreen
            user={user}
            onUpdateUser={(updated) => setUser((u) => ({ ...u, ...updated }))}
            onClose={() => setScreen('LOBBY')}
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
