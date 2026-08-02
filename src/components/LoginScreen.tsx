import React, { useState } from 'react';
import { UserProfile } from '../types';
import { playButtonClick } from '../utils/audio';

interface LoginScreenProps {
  user: UserProfile;
  onLoginSuccess: (name: string, email: string, isGuest: boolean) => void;
}

export const LoginScreen: React.FC<LoginScreenProps> = ({
  user,
  onLoginSuccess,
}) => {
  const [runnerName, setRunnerName] = useState(user.name || '');
  const [parentEmail, setParentEmail] = useState(user.parentEmail || '');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    playButtonClick();
    const finalName = runnerName.trim() || 'Speedy Runner';
    onLoginSuccess(finalName, parentEmail, false);
  };

  const handleGuest = () => {
    playButtonClick();
    onLoginSuccess('Guest Runner', '', true);
  };

  return (
    <div className="relative flex flex-col items-center justify-center px-4 py-8 min-h-[calc(100vh-70px)]">
      {/* Decorative Floating Stars */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none -z-10">
        <span
          className="material-symbols-outlined absolute top-12 left-[10%] text-[#0057c1]/20 text-6xl floating-star symbol-filled"
          style={{ animationDelay: '0s' }}
        >
          grade
        </span>
        <span
          className="material-symbols-outlined absolute bottom-24 right-[12%] text-[#ff7a00]/20 text-7xl floating-star symbol-filled"
          style={{ animationDelay: '1s' }}
        >
          stars
        </span>
        <span
          className="material-symbols-outlined absolute top-1/2 left-[5%] text-[#20b900]/20 text-5xl floating-star symbol-filled"
          style={{ animationDelay: '2s' }}
        >
          bolt
        </span>
        <span
          className="material-symbols-outlined absolute top-1/4 right-[8%] text-[#0057c1]/20 text-5xl floating-star"
          style={{ animationDelay: '0.5s' }}
        >
          directions_run
        </span>
      </div>

      {/* Hero Section */}
      <div className="text-center mb-8 animate-in fade-in zoom-in duration-500">
        <div className="w-28 h-28 sm:w-32 sm:h-32 mx-auto mb-5 rounded-full bg-[#006ef1] flex items-center justify-center shadow-[0_8px_0_0_#004397] border-4 border-white transform hover:scale-105 transition-transform">
          <span className="material-symbols-outlined text-white text-6xl symbol-filled">
            directions_run
          </span>
        </div>
        <h2 className="font-extrabold text-4xl sm:text-5xl text-[#161d1f] mb-2 tracking-tight">
          Welcome Runner!
        </h2>
        <p className="font-semibold text-lg sm:text-xl text-[#584235] flex items-center justify-center gap-1">
          Ready to jump, run, and play?
          <span className="material-symbols-outlined text-2xl text-[#0057c1]">directions_run</span>
        </p>
      </div>

      {/* Login Form Container */}
      <div className="w-full max-w-md bg-[#e8eff1] rounded-3xl p-6 sm:p-8 border-4 border-[#e0c0af] shadow-[0_8px_0_0_rgba(0,0,0,0.12)]">
        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Runner Name Field */}
          <div className="space-y-2 input-focus-pulse rounded-2xl">
            <label className="block font-bold text-xs sm:text-sm text-[#584235] px-2 tracking-wider">
              RUNNER NAME
            </label>
            <div className="relative">
              <input
                type="text"
                value={runnerName}
                onChange={(e) => setRunnerName(e.target.value)}
                placeholder="Type your hero name..."
                className="w-full py-4 sm:py-5 px-5 sm:px-6 rounded-2xl border-4 border-[#e0c0af] bg-white text-lg sm:text-xl font-semibold focus:border-[#0057c1] focus:ring-0 outline-none transition-all placeholder:text-[#d4dbdd] text-[#161d1f]"
              />
              <span className="material-symbols-outlined absolute right-4 top-1/2 -translate-y-1/2 text-[#0057c1] text-2xl">
                face
              </span>
            </div>
          </div>

          {/* Parent Email Field */}
          <div className="space-y-2 input-focus-pulse rounded-2xl">
            <label className="block font-bold text-xs sm:text-sm text-[#584235] px-2 tracking-wider">
              PARENT EMAIL
            </label>
            <div className="relative">
              <input
                type="email"
                value={parentEmail}
                onChange={(e) => setParentEmail(e.target.value)}
                placeholder="Grown-ups, enter email here"
                className="w-full py-4 sm:py-5 px-5 sm:px-6 rounded-2xl border-4 border-[#e0c0af] bg-white text-lg sm:text-xl font-semibold focus:border-[#0057c1] focus:ring-0 outline-none transition-all placeholder:text-[#d4dbdd] text-[#161d1f]"
              />
              <span className="material-symbols-outlined absolute right-4 top-1/2 -translate-y-1/2 text-[#0057c1] text-2xl">
                mail
              </span>
            </div>
          </div>

          {/* Primary Action Button */}
          <button type="submit" className="w-full btn-bounce group pt-2">
            <div className="bg-[#ff7a00] py-4 sm:py-5 rounded-2xl border-b-8 border-[#753400] text-[#5c2800] font-extrabold text-2xl sm:text-3xl flex items-center justify-center gap-3 transition-all group-hover:brightness-110 active:border-b-0">
              <span>LET'S GO!</span>
              <span className="material-symbols-outlined text-3xl sm:text-4xl symbol-filled">
                play_circle
              </span>
            </div>
          </button>
        </form>

        {/* Divider */}
        <div className="flex items-center my-6">
          <div className="flex-grow border-t-4 border-[#e0c0af]"></div>
          <span className="px-4 font-extrabold text-sm text-[#584235]">OR</span>
          <div className="flex-grow border-t-4 border-[#e0c0af]"></div>
        </div>

        {/* Alternative Login */}
        <button
          type="button"
          onClick={handleGuest}
          className="w-full py-3.5 sm:py-4 rounded-2xl border-4 border-[#0057c1] text-[#0057c1] font-bold text-lg flex items-center justify-center gap-2 hover:bg-[#d9e2ff] active:scale-95 transition-all bg-white"
        >
          <span className="material-symbols-outlined">person_outline</span>
          <span>PLAY AS GUEST</span>
        </button>
      </div>

      {/* Parental Note Footer */}
      <div className="mt-8 max-w-sm text-center">
        <div className="inline-flex items-center gap-2 bg-[#e2e9ec] px-5 py-2.5 rounded-full border-2 border-[#e0c0af] shadow-sm">
          <span className="material-symbols-outlined text-[#0057c1] symbol-filled">
            info
          </span>
          <p className="font-bold text-xs sm:text-sm text-[#584235] uppercase tracking-wide">
            Grown-ups, help your runner get started!
          </p>
        </div>
      </div>
    </div>
  );
};
