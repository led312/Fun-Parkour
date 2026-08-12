import React, { useState, useEffect, useRef } from 'react';
import {
  playBeepSound,
  playButtonClick,
  playCoinSound,
  playVictorySound,
} from '../utils/audio';
import {
  averageBaseline,
  detectPose,
  drawSkeleton,
  Keypoint,
  KP,
  measureBaseline,
  measureShoulderX,
  measureShoulderY,
  PoseBaseline,
} from '../utils/poseDetector';
import { assetUrl } from '../utils/assets';

interface CalibrationScreenProps {
  onCalibrationComplete: (baseline: PoseBaseline | null) => void;
  onPause: () => void;
}

// loading: model warming up; searching: no person detected yet;
// calibrating: sampling the standing baseline; testing: walking through each
// game gesture one by one; ready: everything detected, good to go;
// unavailable: webcam/model failed, keeps retrying in the background
type CalibStatus =
  | 'loading'
  | 'searching'
  | 'calibrating'
  | 'testing'
  | 'ready'
  | 'unavailable';

type GestureId = 'jump' | 'squat' | 'left' | 'right' | 'jack';

interface GestureStep {
  id: GestureId;
  label: string;
  hint: string;
  icon: string;
}

// Every move the parkour game needs, tested in order during calibration
const GESTURE_STEPS: GestureStep[] = [
  { id: 'jump', label: '跳一跳!', hint: '用力向上跳!', icon: 'arrow_upward' },
  { id: 'left', label: '向左移!', hint: '向你的左边移动!', icon: 'arrow_back' },
  { id: 'right', label: '向右移!', hint: '向你的右边移动!', icon: 'arrow_forward' },
  { id: 'jack', label: '开合跳!', hint: '举起双手、叉开双腿 - 开启护盾!', icon: 'shield' },
];

const FRAME_MS = 80;
const RETRY_MS = 3000; // delay before re-trying after a pose-model load failure
const SAMPLE_MS = 1000; // hold still for 1s to capture the standing baseline

// Fast-moving wrists get lower model scores than static keypoints, so the
// jumping-jack check uses a looser confidence cut than the usual 0.5.
const wristOk = (kp: Keypoint | undefined): kp is Keypoint => !!kp && kp.score > 0.3;

export const CalibrationScreen: React.FC<CalibrationScreenProps> = ({
  onCalibrationComplete,
  onPause,
}) => {
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState<CalibStatus>('loading');
  const [stepIndex, setStepIndex] = useState(0);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [webcamActive, setWebcamActive] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const skeletonCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const samplesRef = useRef<PoseBaseline[]>([]);
  const sampleStartRef = useRef(0);
  const lastSampleRef = useRef<PoseBaseline | null>(null);
  const baselineRef = useRef<PoseBaseline | null>(null);
  const prevHipYRef = useRef<number | null>(null);
  const squatFramesRef = useRef(0);
  const jackFramesRef = useRef(0);

  const isAligned = status === 'ready';

  useEffect(() => {
    // Try auto-enabling webcam for pose tracking experience
    navigator.mediaDevices?.getUserMedia({ video: { width: { ideal: 640 }, height: { ideal: 480 } } })
      .then((stream) => {
        streamRef.current = stream;
        setWebcamActive(true);
      })
      .catch(() => {
        setWebcamActive(false);
        setStatus('unavailable');
      });

    return () => {
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    };
  }, []);

  // The <video> element only mounts after webcamActive flips true, so the
  // stream can't be attached in the getUserMedia callback above (the ref is
  // still null at that point). Attach it here once the element exists.
  useEffect(() => {
    if (webcamActive && videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current;
    }
  }, [webcamActive]);

  // Watchdog: never sit on "LOADING AI..." forever. Any silent stall (camera
  // stream that never becomes ready, a model load that outlives its own
  // retries) ends on the keyboard-fallback screen instead. The pose loop
  // keeps polling underneath and recovers if the model finishes loading.
  useEffect(() => {
    if (status !== 'loading') return;
    const watchdog = setTimeout(() => setStatus('unavailable'), 60000);
    return () => clearTimeout(watchdog);
  }, [status]);

  // Match skeleton overlay resolution to its displayed size
  useEffect(() => {
    const canvas = skeletonCanvasRef.current;
    if (!canvas) return;
    const resize = () => {
      canvas.width = canvas.clientWidth;
      canvas.height = canvas.clientHeight;
    };
    resize();
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, []);

  // Did the current frame perform the requested gesture? (same thresholds as
  // the in-game gesture state machine). m may be null when the hips lose
  // confidence (e.g. mid-squat); only jump needs it.
  const detectGesture = (
    id: GestureId,
    kps: Keypoint[],
    m: PoseBaseline | null,
    b: PoseBaseline,
  ): boolean => {
    switch (id) {
      case 'jump': {
        if (!m) return false;
        const risingFast =
          prevHipYRef.current !== null && prevHipYRef.current - m.hipY > 0.18 * b.torso;
        const aboveBaseline = m.hipY < b.hipY - 0.22 * b.torso;
        return risingFast || aboveBaseline;
      }
      case 'squat': {
        // Shoulders stay visible mid-squat while hips often lose confidence
        const shoulderY = measureShoulderY(kps);
        if (shoulderY !== null && shoulderY > b.shoulderY + 0.3 * b.torso) {
          squatFramesRef.current += 1;
        } else {
          squatFramesRef.current = 0;
        }
        return squatFramesRef.current >= 2;
      }
      case 'left': {
        const sx = measureShoulderX(kps);
        return sx !== null && sx < b.centerX - 0.45 * b.shoulderW;
      }
      case 'right': {
        const sx = measureShoulderX(kps);
        return sx !== null && sx > b.centerX + 0.45 * b.shoulderW;
      }
      case 'jack': {
        const lw = kps[KP.LEFT_WRIST];
        const rw = kps[KP.RIGHT_WRIST];
        if (!wristOk(lw) || !wristOk(rw)) {
          jackFramesRef.current = 0;
          return false;
        }
        // Arms raised clearly above the baseline shoulder line and spread
        // wide; needs 2 consecutive frames so a single blurry frame can't
        // pass or fail the check on its own.
        const armsUp = lw.y < b.shoulderY - 0.2 * b.torso && rw.y < b.shoulderY - 0.2 * b.torso;
        const armsWide = Math.abs(rw.x - lw.x) > 1.3 * b.shoulderW;
        jackFramesRef.current = armsUp && armsWide ? jackFramesRef.current + 1 : 0;
        return jackFramesRef.current >= 2;
      }
    }
  };

  // Real pose calibration loop: detect the player, draw the skeleton, capture
  // the standing baseline, then verify each game gesture one by one.
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;

    const tick = async () => {
      if (cancelled) return;
      const video = videoRef.current;
      if (video && video.readyState >= 2 && status !== 'ready') {
        try {
          const kps = await detectPose(video);
          if (cancelled) return;
          const canvas = skeletonCanvasRef.current;
          if (canvas) drawSkeleton(canvas, video, kps);

          const m = kps ? measureBaseline(kps) : null;

          if (!baselineRef.current) {
            // Phase 1: standing baseline sampling, gated on stability: a
            // sample only counts when the pose barely moved since the last
            // frame, and any wiggle restarts the 1s window. Without this the
            // baseline can be captured mid-step/mid-turn (common on replays,
            // when the warm model starts sampling instantly), which skews
            // every baseline-relative gesture check afterwards.
            const last = lastSampleRef.current;
            const stable =
              !!m &&
              !!last &&
              Math.abs(m.shoulderY - last.shoulderY) < 0.08 * last.torso &&
              Math.abs(m.hipY - last.hipY) < 0.08 * last.torso &&
              Math.abs(m.centerX - last.centerX) < 0.15 * last.shoulderW &&
              Math.abs(m.shoulderW - last.shoulderW) < 0.15 * last.shoulderW;

            if (!m || !stable) {
              samplesRef.current = [];
              sampleStartRef.current = Date.now();
              lastSampleRef.current = m;
              setProgress(0);
              setStatus(m ? 'calibrating' : 'searching');
            } else {
              samplesRef.current.push(m);
              lastSampleRef.current = m;
              const elapsed = Date.now() - sampleStartRef.current;
              // Baseline sampling fills the first 20% of the progress bar
              setProgress(Math.min(20, Math.round((elapsed / SAMPLE_MS) * 20)));
              if (elapsed >= SAMPLE_MS && samplesRef.current.length >= 3) {
                baselineRef.current = averageBaseline(samplesRef.current);
                setStatus('testing');
                playCoinSound();
              } else {
                setStatus('calibrating');
              }
            }
          } else {
            // Phase 2: gesture checklist (20% per gesture, 4 gestures).
            // Runs even when hips are lost mid-frame: jack doesn't need them.
            const step = GESTURE_STEPS[stepIndex];
            if (step && kps && detectGesture(step.id, kps, m, baselineRef.current)) {
              playCoinSound();
              squatFramesRef.current = 0;
              jackFramesRef.current = 0;
              const next = stepIndex + 1;
              setProgress(20 + next * 20);
              if (next >= GESTURE_STEPS.length) {
                setStatus('ready');
                playVictorySound();
              } else {
                setStepIndex(next);
              }
            }
            if (m) prevHipYRef.current = m.hipY;
          }
        } catch (e) {
          // Model load can fail transiently (e.g. slow CDN fallback); keep
          // retrying on a slower cadence instead of giving up for good.
          console.warn('Pose calibration unavailable, retrying:', e);
          if (!cancelled) {
            setStatus('unavailable');
            timer = setTimeout(tick, RETRY_MS);
          }
          return;
        }
      }
      timer = setTimeout(tick, FRAME_MS);
    };

    tick();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stepIndex, status]);

  // All gestures verified -> count down 3-2-1-GO! and start automatically,
  // no button press needed.
  useEffect(() => {
    if (status !== 'ready') return;
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
        setTimeout(() => onCalibrationComplete(baselineRef.current), 600);
      }
    }, 900);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  const currentStep = status === 'testing' ? GESTURE_STEPS[stepIndex] : null;
  const statusTitle: Record<CalibStatus, string> = {
    loading: '加载 AI 中...',
    searching: '站进画面里!',
    calibrating: '保持不动...',
    testing: currentStep?.label ?? '',
    ready: '动作全部完成!',
    unavailable: 'AI 加载失败',
  };

  const statusHint: Record<CalibStatus, string> = {
    loading: '正在准备动作识别...',
    searching: '退后一点,让头和脚都出现在画面里!',
    calibrating: '站直别动,让我们记住你的姿势!',
    testing: currentStep?.hint ?? '',
    ready: '所有动作都识别成功,准备开跑...',
    unavailable: '动作识别加载失败,正在重试...',
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
            src={assetUrl('/assets/lobby-bg.jpg')}
            alt="校准背景"
            className="w-full h-full object-cover object-center opacity-80"
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-b from-black/50 via-transparent to-black/60 pointer-events-none" />
        {/* Real-time YOLO26 skeleton overlay (keypoints already mirrored) */}
        <canvas
          ref={skeletonCanvasRef}
          className="absolute inset-0 w-full h-full pointer-events-none"
        />
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
            className={`font-extrabold text-2xl sm:text-3xl mb-1 flex items-center justify-center gap-2 ${
              isAligned ? 'text-white' : 'text-[#994700]'
            }`}
          >
            {currentStep && (
              <span className="material-symbols-outlined text-3xl sm:text-4xl symbol-filled">
                {currentStep.icon}
              </span>
            )}
            {statusTitle[status]}
          </h2>
          <p className="font-semibold text-base sm:text-lg">{statusHint[status]}</p>

          {/* Gesture checklist */}
          {(status === 'testing' || status === 'ready') && (
            <div className="flex items-center justify-center gap-2 mt-2">
              {GESTURE_STEPS.map((step, i) => {
                const done = status === 'ready' || i < stepIndex;
                const active = status === 'testing' && i === stepIndex;
                return (
                  <div
                    key={step.id}
                    title={step.label}
                    className={`w-9 h-9 rounded-full border-2 flex items-center justify-center transition-all ${
                      done
                        ? 'bg-[#20b900] border-white text-white'
                        : active
                          ? 'bg-white border-[#994700] text-[#994700] animate-pulse'
                          : 'bg-black/20 border-white/40 text-white/50'
                    }`}
                  >
                    <span className="material-symbols-outlined text-xl symbol-filled">
                      {done ? 'check' : step.icon}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Spacer: the live YOLO skeleton on the camera feed is the only body guide */}
        <div className="flex-1 w-full my-2" />

        {/* Bottom Progress Bar (game starts automatically once all moves pass) */}
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

        </div>
      </div>

      {/* Center-screen 3-2-1-GO! countdown after calibration passes */}
      {countdown !== null && (
        <div className="absolute inset-0 z-20 flex items-center justify-center pointer-events-none">
          <span
            key={countdown}
            className="font-extrabold text-white text-9xl drop-shadow-[0_8px_0_rgba(0,0,0,0.45)] animate-in zoom-in duration-300"
          >
            {countdown > 0 ? countdown : '出发!'}
          </span>
        </div>
      )}

      {/* Floating Pause Trigger Button */}
      <button
        onClick={() => {
          playButtonClick();
          onPause();
        }}
        className="fixed bottom-6 right-6 z-30 bg-[#0057c1] text-white rounded-full p-3.5 border-4 border-white shadow-[0_5px_0_0_#001a43] active:translate-y-1 hover:scale-105 transition-all"
        title="暂停"
      >
        <span className="material-symbols-outlined text-3xl">pause</span>
      </button>
    </div>
  );
};
