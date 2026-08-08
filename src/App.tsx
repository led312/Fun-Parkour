import React, { useState } from 'react';
import { ScreenState, TabState, UserProfile } from './types';
import { PoseBaseline } from './utils/poseDetector';
import { Header } from './components/Header';
import { BottomNav } from './components/BottomNav';
import { LoginScreen } from './components/LoginScreen';
import { LobbyScreen } from './components/LobbyScreen';
import { CalibrationScreen } from './components/CalibrationScreen';
import { GameplayScreen } from './components/GameplayScreen';
import { ResultsScreen } from './components/ResultsScreen';
import { ShopScreen } from './components/ShopScreen';
import { PauseMenu } from './components/PauseMenu';

export default function App() {
  const [screen, setScreen] = useState<ScreenState>('LOGIN');
  const [activeTab, setActiveTab] = useState<TabState>('rocket');
  const [isPauseOpen, setIsPauseOpen] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);

  const [user, setUser] = useState<UserProfile>({
    name: 'Speedy Runner',
    parentEmail: '',
    isGuest: false,
    score: 2500,
    highScore: 2500,
    coins: 1250,
    stars: 12,
    selectedAvatar: 'shiba',
  });

  const [lastRunScore, setLastRunScore] = useState(2500);
  const [lastStarsEarned, setLastStarsEarned] = useState(3);
  // Standing-pose baseline captured on the calibration screen (null = the
  // game calibrates itself during the first second of play)
  const [poseBaseline, setPoseBaseline] = useState<PoseBaseline | null>(null);

  const handleLoginSuccess = (name: string, email: string, isGuest: boolean) => {
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

  const handleTabSelect = (tab: TabState) => {
    setActiveTab(tab);
    if (tab === 'bolt') {
      setScreen('SHOP');
    } else if (tab === 'rocket') {
      if (screen === 'LOGIN') {
        setScreen('LOBBY');
      } else if (screen === 'LOBBY' || screen === 'RESULTS' || screen === 'SHOP') {
        // Calibration is mandatory before every run
        setScreen('CALIBRATION');
      }
    } else if (tab === 'shield') {
      setIsPauseOpen(true);
    }
  };

  return (
    <div className="min-h-screen w-full bg-[#f4fafd] text-[#161d1f] flex flex-col justify-between font-['Plus_Jakarta_Sans',sans-serif] relative overflow-x-hidden">
      {/* Sticky Header */}
      <Header
        screen={screen}
        score={user.score}
        onProfileClick={() => setScreen('SHOP')}
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

      {/* Bottom Navigation Shell (Shown when not on Login screen or as persistent nav) */}
      <BottomNav
        activeTab={activeTab}
        onTabSelect={handleTabSelect}
        onMenuToggle={() => setIsPauseOpen(true)}
      />

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
