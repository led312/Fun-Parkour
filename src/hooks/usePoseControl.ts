// Gesture state machine on top of YOLO26 pose keypoints.
// Classifies squat / jump / left-right movement / jumping-jack from the webcam
// stream and fires game control callbacks. Keyboard control remains as fallback.

import { RefObject, useEffect, useRef, useState } from 'react';
import {
  averageBaseline,
  detectPose,
  drawSkeleton,
  Keypoint,
  KP,
  measureBaseline,
  measureShoulderY,
  PoseBaseline,
} from '../utils/poseDetector';

export interface PoseControlHandlers {
  onJump: () => void;
  onSlide: () => void;
  onLane: (lane: number) => void;
  onShield: () => void;
}

export type PoseStatus = 'loading' | 'active' | 'unavailable';

const CONF = 0.5;
const FRAME_MS = 80; // ~12 FPS inference throttle
const BASELINE_MS = 1000; // stand still for the first second to calibrate
const JUMP_COOLDOWN_MS = 700;
const SLIDE_COOLDOWN_MS = 800;
const SHIELD_COOLDOWN_MS = 2000;

const ok = (kp: Keypoint | undefined): kp is Keypoint => !!kp && kp.score > CONF;

export function usePoseControl(
  videoRef: RefObject<HTMLVideoElement | null>,
  overlayRef: RefObject<HTMLCanvasElement | null>,
  handlers: PoseControlHandlers,
  initialBaseline?: PoseBaseline | null,
): PoseStatus {
  const [status, setStatus] = useState<PoseStatus>('loading');

  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  // Gesture state (refs: mutated inside the async inference loop)
  const baselineRef = useRef<PoseBaseline | null>(initialBaseline ?? null);
  const baselineSamplesRef = useRef<PoseBaseline[]>([]);
  const prevHipYRef = useRef<number | null>(null);
  const lastJumpRef = useRef(0);
  const lastSlideRef = useRef(0);
  const lastShieldRef = useRef(0);
  const squatFramesRef = useRef(0);
  const laneRef = useRef(1);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    let calibrationStart = 0;

    const isJumpingJack = (kps: Keypoint[], b: PoseBaseline): boolean => {
      const nose = kps[KP.NOSE];
      const lw = kps[KP.LEFT_WRIST];
      const rw = kps[KP.RIGHT_WRIST];
      if (!ok(nose) || !ok(lw) || !ok(rw)) return false;
      // Both wrists above the nose and spread wide (arms up & out)
      const armsUp = lw.y < nose.y && rw.y < nose.y;
      const armsWide = Math.abs(rw.x - lw.x) > 1.5 * b.shoulderW;
      return armsUp && armsWide;
    };

    const processFrame = (kps: Keypoint[] | null) => {
      if (!kps) return;
      const now = Date.now();
      const m = measureBaseline(kps);
      const shoulderY = measureShoulderY(kps);

      // Calibration: average the first BASELINE_MS of stable standing frames
      // (skipped entirely when a baseline was captured on the calibration screen)
      if (!baselineRef.current) {
        if (!m) return; // baseline sampling needs the full torso (hips included)
        if (baselineSamplesRef.current.length === 0) {
          calibrationStart = now;
        }
        baselineSamplesRef.current.push(m);
        if (now - calibrationStart >= BASELINE_MS && baselineSamplesRef.current.length >= 3) {
          baselineRef.current = averageBaseline(baselineSamplesRef.current);
        }
        return;
      }
      const b = baselineRef.current;

      // --- Jumping jack -> shield (checked first; suppresses plain jump).
      // Only needs nose + wrists, so it also works while crouching. ---
      if (isJumpingJack(kps, b)) {
        if (now - lastShieldRef.current > SHIELD_COOLDOWN_MS) {
          lastShieldRef.current = now;
          handlersRef.current.onShield();
        }
        if (m) prevHipYRef.current = m.hipY;
        return;
      }

      // --- Squat: shoulders clearly below baseline for 2+ frames.
      // Shoulders stay visible mid-squat; hips often lose confidence then. ---
      if (shoulderY !== null && shoulderY > b.shoulderY + 0.3 * b.torso) {
        squatFramesRef.current += 1;
        if (squatFramesRef.current >= 2 && now - lastSlideRef.current > SLIDE_COOLDOWN_MS) {
          lastSlideRef.current = now;
          squatFramesRef.current = 0;
          handlersRef.current.onSlide();
        }
      } else {
        squatFramesRef.current = 0;
      }

      // Jump & lane need the hips; skip them on frames where hips are lost
      if (!m) return;

      // --- Jump: hips rising fast / clearly above baseline ---
      const risingFast =
        prevHipYRef.current !== null && prevHipYRef.current - m.hipY > 0.18 * b.torso;
      const aboveBaseline = m.hipY < b.hipY - 0.22 * b.torso;
      if ((risingFast || aboveBaseline) && now - lastJumpRef.current > JUMP_COOLDOWN_MS) {
        lastJumpRef.current = now;
        handlersRef.current.onJump();
      }

      // --- Left / right: 3 zones with hysteresis around the baseline center ---
      const dx = m.centerX - b.centerX;
      const enter = 0.7 * b.shoulderW;
      const exit = 0.4 * b.shoulderW;
      let lane = laneRef.current;
      if (lane === 1) {
        if (dx < -enter) lane = 0;
        else if (dx > enter) lane = 2;
      } else if (lane === 0 && dx > -exit) {
        lane = dx > enter ? 2 : 1;
      } else if (lane === 2 && dx < exit) {
        lane = dx < -enter ? 0 : 1;
      }
      if (lane !== laneRef.current) {
        laneRef.current = lane;
        handlersRef.current.onLane(lane);
      }

      prevHipYRef.current = m.hipY;
    };

    const tick = async () => {
      if (cancelled) return;
      const video = videoRef.current;
      if (video && video.readyState >= 2) {
        try {
          const kps = await detectPose(video);
          if (cancelled) return;
          setStatus('active'); // React bails out on identical values, no re-render spam
          processFrame(kps);
          const canvas = overlayRef.current;
          if (canvas) drawSkeleton(canvas, video, kps);
        } catch (e) {
          console.warn('Pose detection unavailable, keyboard fallback:', e);
          if (!cancelled) setStatus('unavailable');
          return; // stop the loop; keyboard still works
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
  }, []);

  return status;
}
