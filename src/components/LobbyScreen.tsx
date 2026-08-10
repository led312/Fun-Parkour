import React, { useState, useEffect, useRef } from 'react';
import { UserProfile } from '../types';
import { playButtonClick } from '../utils/audio';

interface LobbyScreenProps {
  user: UserProfile;
  onStartCalibration: () => void;
  onOpenShop: () => void;
  onOpenSettings: () => void;
}

export const LobbyScreen: React.FC<LobbyScreenProps> = ({
  user,
  onStartCalibration,
  onOpenShop,
  onOpenSettings,
}) => {
  const [showToast, setShowToast] = useState(true);
  const [cameraActive, setCameraActive] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      setShowToast(false);
    }, 4000);
    return () => clearTimeout(timer);
  }, []);

  const toggleWebcam = async () => {
    playButtonClick();
    if (cameraActive) {
      if (videoRef.current && videoRef.current.srcObject) {
        const stream = videoRef.current.srcObject as MediaStream;
        stream.getTracks().forEach((track) => track.stop());
        videoRef.current.srcObject = null;
      }
      setCameraActive(false);
    } else {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true });
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
        setCameraActive(true);
      } catch (err) {
        console.warn('Webcam permission not granted or unavailable:', err);
        setCameraActive(false);
      }
    }
  };

  return (
    <div className="relative min-h-[calc(100vh-70px)] w-full flex flex-col items-center justify-between overflow-hidden select-none pb-24 pt-4">
      {/* Background Track Image */}
      <div className="absolute inset-0 -z-10 overflow-hidden">
        <img
          src="https://lh3.googleusercontent.com/aida-public/AB6AXuDlJBFoK14rPzwHA284ajv6yT_VD5eQ0aByw4rcHwqLrW_fB6a54qvwhAWrUxc9MSFLUYSZGNiHN7k-r3ood2GQgBAb8NOESLvCgEi6eXPOQmAEuA9kG1shqvqX81W0AADQj6z1Cz2Fcj3NtQyrruzTidn4nnugd1XfpjzJeJ9SMB4TsJjJUwLaXQYiDONC5PyzAgr3hq7UpXeF_Sgh4bmq9DoAE2WlTM8H9rm2c3WWXRuFT4262rLW"
          alt="City Parkour Track"
          className="w-full h-full object-cover object-center opacity-90"
        />
        <div className="absolute inset-0 bg-white/10 backdrop-brightness-105"></div>
      </div>

      {/* High Score Toast Notification (only when there is a real record) */}
      <div
        className={`fixed top-20 left-1/2 -translate-x-1/2 bg-[#106e00] text-white px-6 py-2.5 rounded-full flex items-center gap-2.5 shadow-lg z-30 transition-all duration-500 border-2 border-white ${
          showToast && user.highScore > 0 ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-6 pointer-events-none'
        }`}
      >
        <span className="material-symbols-outlined text-white symbol-filled">stars</span>
        <span className="font-extrabold text-sm uppercase tracking-wider">
          New High Score: {user.highScore}!
        </span>
      </div>

      {/* Main Mascot & Hero Content */}
      <div className="relative z-10 w-full max-w-lg flex flex-col items-center my-auto px-4">
        {/* Mascot Image */}
        <div className="floating-star mb-6 sm:mb-8">
          <img
            src="https://lh3.googleusercontent.com/aida-public/AB6AXuCU8N0o6n2nU7TPm-bakO1gnAsgq7WkhP2ZE16-Ssmu-3GnaN0eo5JAC-FScc44lpXgnwAJcXdTf-43ZymmnpW5N6GLgXilkSj6CUxameJTxYxULe3An6SDU9xL1X0Nxya-CIW-xED7V6eHiQj4-eficQMxntmQBCSpsOCARJV8lrP-C17EkZroBKjc4WF9dbr4AHRwklLrtHK6gU1gG79BX-_xf-uiHUbcEtYWXA9dfxy97O8Eyf_W"
            alt="Mascot Shiba Runner"
            className="w-56 h-56 sm:w-64 sm:h-64 object-contain drop-shadow-xl"
          />
        </div>

        {/* Start Game Action Button (calibration is mandatory) */}
        <div className="flex flex-col sm:flex-row gap-3 w-full max-w-md">
          <button
            onClick={() => {
              playButtonClick();
              onStartCalibration();
            }}
            className="flex-1 bg-[#ff7a00] hover:brightness-110 active:scale-95 text-white rounded-2xl px-8 py-5 flex items-center justify-center gap-3 border-b-8 border-[#753400] shadow-xl transition-all group"
          >
            <span className="material-symbols-outlined text-4xl symbol-filled group-hover:scale-110 transition-transform">
              play_arrow
            </span>
            <span className="font-extrabold text-2xl sm:text-3xl tracking-wider">
              START
            </span>
          </button>
        </div>

        {/* Shop & Settings (moved up from the old bottom nav bar) */}
        <div className="flex gap-3 w-full max-w-md mt-3">
          <button
            onClick={() => {
              playButtonClick();
              onOpenShop();
            }}
            className="flex-1 bg-[#0057c1] hover:brightness-110 active:scale-95 text-white rounded-2xl px-6 py-3.5 flex items-center justify-center gap-2 border-b-8 border-[#001a43] shadow-xl transition-all"
          >
            <span className="material-symbols-outlined text-2xl symbol-filled">storefront</span>
            <span className="font-extrabold text-lg tracking-wider">SHOP</span>
          </button>
          <button
            onClick={() => {
              playButtonClick();
              onOpenSettings();
            }}
            className="flex-1 bg-[#0057c1] hover:brightness-110 active:scale-95 text-white rounded-2xl px-6 py-3.5 flex items-center justify-center gap-2 border-b-8 border-[#001a43] shadow-xl transition-all"
          >
            <span className="material-symbols-outlined text-2xl symbol-filled">settings</span>
            <span className="font-extrabold text-lg tracking-wider">SETTINGS</span>
          </button>
        </div>
      </div>

      {/* Camera Preview Widget */}
      <div className="relative z-20 self-end mr-4 sm:mr-8 mb-2">
        <div
          onClick={toggleWebcam}
          className="cursor-pointer bg-slate-900 rounded-2xl overflow-hidden w-40 sm:w-48 h-28 sm:h-32 flex flex-col items-center justify-center relative border-4 border-white shadow-xl hover:scale-105 transition-transform"
        >
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className={`absolute inset-0 w-full h-full object-cover ${cameraActive ? 'block' : 'hidden'}`}
          />

          {!cameraActive && (
            <div className="flex flex-col items-center text-white/50 p-2 text-center">
              <span className="material-symbols-outlined text-3xl">accessibility_new</span>
              <p className="font-bold text-[10px] uppercase mt-1">Tap to test camera</p>
            </div>
          )}

          <div className="scanline absolute inset-0 pointer-events-none"></div>

          {/* Live Indicator */}
          <div className="absolute top-2 left-2 flex items-center gap-1.5 bg-black/40 px-2 py-0.5 rounded-full backdrop-blur-sm">
            <div className={`w-2 h-2 rounded-full ${cameraActive ? 'bg-emerald-400 animate-pulse' : 'bg-red-500'}`}></div>
            <span className="text-white text-[9px] font-bold">{cameraActive ? 'LIVE' : 'OFF'}</span>
          </div>

          {/* Bottom Label Overlay */}
          <div className="absolute bottom-0 left-0 right-0 bg-black/50 backdrop-blur-sm py-1 text-center">
            <span className="text-white text-[10px] font-bold uppercase tracking-tight">
              Ready to Run?
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
