import React, { useState, useEffect, useRef } from 'react';
import { playBeepSound, playButtonClick, playVictorySound } from '../utils/audio';

interface CalibrationScreenProps {
  onCalibrationComplete: () => void;
  onPause: () => void;
}

export const CalibrationScreen: React.FC<CalibrationScreenProps> = ({
  onCalibrationComplete,
  onPause,
}) => {
  const [progress, setProgress] = useState(15);
  const [isAligned, setIsAligned] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [webcamActive, setWebcamActive] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    // Try auto-enabling webcam for pose tracking experience
    navigator.mediaDevices?.getUserMedia({ video: true })
      .then((stream) => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
        setWebcamActive(true);
      })
      .catch(() => {
        setWebcamActive(false);
      });

    return () => {
      if (videoRef.current && videoRef.current.srcObject) {
        const stream = videoRef.current.srcObject as MediaStream;
        stream.getTracks().forEach((track) => track.stop());
      }
    };
  }, []);

  const handleStartCalibration = () => {
    playButtonClick();
    setIsAligned(true);
    setProgress(100);
    playVictorySound();

    let count = 3;
    setCountdown(count);

    const interval = setInterval(() => {
      count -= 1;
      if (count > 0) {
        setCountdown(count);
        playBeepSound();
      } else {
        clearInterval(interval);
        setCountdown(0);
        setTimeout(() => {
          onCalibrationComplete();
        }, 500);
      }
    }, 900);
  };

  return (
    <div className="relative h-[calc(100vh-70px)] w-full bg-black flex items-center justify-center overflow-hidden select-none">
      {/* Background Playroom / Camera Feed */}
      <div className="absolute inset-0 z-0">
        {webcamActive ? (
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="w-full h-full object-cover opacity-80 scale-x-[-1]"
          />
        ) : (
          <img
            src="https://lh3.googleusercontent.com/aida-public/AB6AXuB6LMMBlmViXMDSKZlMYrMd5D8inp5eab_TQBPnlXZyTcv2yqEBBOFxhgyFh6jh_pfJxrM_qL6s0Llqf9dmVW8W1lvpQDw76T-zU67Dz_RoVZonj-NuSv2JMV043y_q58aMV7_vss3qkeRL_02NxW9mEVnRCc6eewLJFzB0X8UAltchTx2KyePsGzPY0i_Y-JxEeHdc69NyEhsIGopz7OgRfkUtWecEOIv9Gcq84T6gzx0DZsqOJoO0"
            alt="Playroom Calibration Background"
            className="w-full h-full object-cover object-center opacity-80"
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-b from-black/50 via-transparent to-black/60 pointer-events-none" />
      </div>

      {/* Main Overlay UI */}
      <div className="relative z-10 w-full h-full flex flex-col items-center justify-between py-6 px-4 max-w-lg mx-auto">
        {/* Top Instruction Card */}
        <div
          className={`border-4 rounded-2xl p-4 sm:p-5 w-full text-center shadow-[6px_6px_0_0_rgba(0,0,0,0.3)] transition-all duration-300 backdrop-blur-md ${
            isAligned
              ? 'bg-[#20b900]/90 border-[#79ff5b] text-white'
              : 'bg-[#dde4e6]/90 border-[#8c7263] text-[#161d1f]'
          }`}
        >
          <h2
            className={`font-extrabold text-2xl sm:text-3xl mb-1 ${
              isAligned ? 'text-white' : 'text-[#994700]'
            }`}
          >
            {isAligned ? 'PERFECT!' : 'Step Back!'}
          </h2>
          <p className="font-semibold text-base sm:text-lg">
            {isAligned
              ? 'Getting ready to run...'
              : 'Match your hands and feet to the silhouette!'}
          </p>
        </div>

        {/* Central Silhouette & Body Targets Zone */}
        <div className="flex-1 flex items-center justify-center relative w-full my-2">
          <div
            className={`relative flex items-center justify-center transition-all duration-500 ${
              isAligned ? 'scale-105' : ''
            }`}
          >
            {/* Outline SVG */}
            <svg
              className={`w-[75vw] h-[50vh] max-w-md ${
                isAligned ? 'drop-shadow-[0_0_35px_#2ae500]' : 'animate-pulse-glow'
              }`}
              fill="none"
              viewBox="0 0 200 400"
            >
              <path
                d="M100 20C115 20 125 35 125 50C125 65 115 80 100 80C85 80 75 65 75 50C75 35 85 20 100 20ZM100 90C80 90 60 100 50 120L30 180C25 195 35 210 50 210C60 210 70 200 75 190L85 140V300C85 320 70 340 50 340C40 340 35 350 35 360C35 375 50 390 70 390H130C150 390 165 375 165 360C165 350 160 340 150 340C130 340 115 320 115 300V140L125 190C130 200 140 210 150 210C165 210 175 195 170 180L150 120C140 100 120 90 100 90Z"
                fill={isAligned ? '#79ff5b' : '#20b900'}
                fillOpacity={isAligned ? 0.6 : 0.25}
                stroke={isAligned ? '#ffffff' : '#79ff5b'}
                strokeDasharray={isAligned ? '0' : '8 8'}
                strokeWidth="5"
              />
            </svg>

            {/* Left Hand Indicator */}
            <div className="absolute top-[28%] left-2 sm:left-4 bg-[#0057c1] text-white rounded-full p-3.5 sm:p-4 border-4 border-white shadow-[0_4px_0_0_#001a43] animate-bounce">
              <span className="material-symbols-outlined text-3xl sm:text-4xl symbol-filled">
                back_hand
              </span>
            </div>

            {/* Right Hand Indicator */}
            <div className="absolute top-[28%] right-2 sm:right-4 bg-[#0057c1] text-white rounded-full p-3.5 sm:p-4 border-4 border-white shadow-[0_4px_0_0_#001a43] animate-bounce">
              <span className="material-symbols-outlined text-3xl sm:text-4xl symbol-filled">
                back_hand
              </span>
            </div>

            {/* Feet Indicators */}
            <div className="absolute bottom-6 flex gap-16 sm:gap-24">
              <div className="bg-[#0057c1] text-white rounded-full p-3.5 sm:p-4 border-4 border-white shadow-[0_4px_0_0_#001a43] animate-pulse">
                <span className="material-symbols-outlined text-3xl sm:text-4xl symbol-filled">
                  footprint
                </span>
              </div>
              <div className="bg-[#0057c1] text-white rounded-full p-3.5 sm:p-4 border-4 border-white shadow-[0_4px_0_0_#001a43] animate-pulse">
                <span className="material-symbols-outlined text-3xl sm:text-4xl symbol-filled">
                  footprint
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Bottom Progress Bar & Calibration Action */}
        <div className="w-full space-y-3 pb-2">
          <div className="relative h-7 w-full bg-[#dde4e6] rounded-full border-4 border-[#8c7263] overflow-hidden shadow-inner">
            <div
              className="absolute top-0 left-0 h-full bg-gradient-to-r from-[#20b900] to-[#79ff5b] rounded-r-full transition-all duration-500 flex items-center justify-end pr-2"
              style={{ width: `${progress}%` }}
            >
              <span className="material-symbols-outlined text-white text-lg symbol-filled">
                stars
              </span>
            </div>
          </div>

          <button
            onClick={handleStartCalibration}
            disabled={countdown !== null}
            className={`w-full py-4 rounded-2xl font-extrabold text-2xl border-b-8 transition-all shadow-xl ${
              isAligned
                ? 'bg-[#20b900] text-white border-[#064100]'
                : 'bg-[#ff7a00] hover:brightness-110 text-[#5c2800] border-[#753400] active:scale-95'
            }`}
          >
            {countdown === null ? (
              "I'M READY!"
            ) : countdown > 0 ? (
              `LET'S GO! ${countdown}...`
            ) : (
              'GO!'
            )}
          </button>
        </div>
      </div>

      {/* Floating Pause Trigger Button */}
      <button
        onClick={() => {
          playButtonClick();
          onPause();
        }}
        className="fixed bottom-6 right-6 z-30 bg-[#0057c1] text-white rounded-full p-3.5 border-4 border-white shadow-[0_5px_0_0_#001a43] active:translate-y-1 hover:scale-105 transition-all"
        title="Pause"
      >
        <span className="material-symbols-outlined text-3xl">pause</span>
      </button>
    </div>
  );
};
