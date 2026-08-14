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
  measureHeadY,
  measureHipY,
  measureShoulderX,
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

const FRAME_MS = 40; // inference cadence floor (effective rate = inference time + this)
const RETRY_MS = 3000; // delay before re-trying after a pose-model load failure
const BASELINE_MS = 1000; // stand still for the first second to calibrate
const JUMP_COOLDOWN_MS = 700;
const SLIDE_COOLDOWN_MS = 800;
const SHIELD_COOLDOWN_MS = 2000;

// Fast-moving wrists get lower model scores than static keypoints, so the
// jumping-jack check uses a looser confidence cut than the usual 0.5.
const wristOk = (kp: Keypoint | undefined): kp is Keypoint => !!kp && kp.score > 0.3;

export function usePoseControl(
  videoRef: RefObject<HTMLVideoElement | null>,
  overlayRef: RefObject<HTMLCanvasElement | null>,
  handlers: PoseControlHandlers,
  initialBaseline?: PoseBaseline | null,
): PoseStatus {
  const [status, setStatus] = useState<PoseStatus>('loading');

  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  // Gesture state (refs: mutated inside the async inference loop). The
  // baseline is cloned because the squat detector slowly adapts it to the
  // player's current upright posture.
  const baselineRef = useRef<PoseBaseline | null>(initialBaseline ? { ...initialBaseline } : null);
  const baselineSamplesRef = useRef<PoseBaseline[]>([]);
  const prevHipYRef = useRef<number | null>(null);
  const lastJumpRef = useRef(0);
  const lastSlideRef = useRef(0);
  const lastShieldRef = useRef(0);
  const squatFramesRef = useRef(0);
  const jackFramesRef = useRef(0);
  const jumpArmedRef = useRef(true);
  const squatArmedRef = useRef(true);
  const laneRef = useRef(1);
  // EMA-smoothed measurements: raw keypoints jitter frame to frame, and a
  // single noisy frame used to trigger (or block) squat/jack detection
  const headYSmoothRef = useRef<number | null>(null);
  const shoulderYSmoothRef = useRef<number | null>(null);
  const hipYSmoothRef = useRef<number | null>(null);
  const wristSmoothRef = useRef<{ lx: number; ly: number; rx: number; ry: number } | null>(null);

  // Exponential moving average; alpha 0.5 keeps response fast while damping
  // single-frame keypoint jitter
  const ema = (prev: number | null, v: number) => (prev === null ? v : prev * 0.5 + v * 0.5);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    let calibrationStart = 0;

    const isJumpingJack = (kps: Keypoint[], b: PoseBaseline): boolean => {
      const lw = kps[KP.LEFT_WRIST];
      const rw = kps[KP.RIGHT_WRIST];
      if (!wristOk(lw) || !wristOk(rw)) {
        jackFramesRef.current = 0;
        wristSmoothRef.current = null;
        return false;
      }
      // Arms raised clearly above the (baseline) shoulder line and spread
      // wide. Referenced to the standing baseline instead of the nose, so it
      // also works mid-jump or mid-squat. Positions are EMA-smoothed so one
      // glitchy wrist frame can't break the streak; needs 2 consecutive
      // frames to fire.
      const s = wristSmoothRef.current;
      const sm = {
        lx: ema(s?.lx ?? null, lw.x),
        ly: ema(s?.ly ?? null, lw.y),
        rx: ema(s?.rx ?? null, rw.x),
        ry: ema(s?.ry ?? null, rw.y),
      };
      wristSmoothRef.current = sm;
      const armsUp = sm.ly < b.shoulderY - 0.15 * b.torso && sm.ry < b.shoulderY - 0.15 * b.torso;
      const armsWide = Math.abs(sm.rx - sm.lx) > 1.2 * b.shoulderW;
      jackFramesRef.current = armsUp && armsWide ? jackFramesRef.current + 1 : 0;
      return jackFramesRef.current >= 2;
    };

    const processFrame = (kps: Keypoint[] | null) => {
      if (!kps) return;
      const now = Date.now();
      const headY = measureHeadY(kps);
      const shoulderY = measureShoulderY(kps);
      const hipY = measureHipY(kps);

      // Calibration: average the first BASELINE_MS of stable standing frames
      // (skipped entirely when a baseline was captured on the calibration screen)
      if (!baselineRef.current) {
        const m = measureBaseline(kps);
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
      // Only needs the wrists, so it also works while crouching. ---
      if (isJumpingJack(kps, b)) {
        if (now - lastShieldRef.current > SHIELD_COOLDOWN_MS) {
          lastShieldRef.current = now;
          handlersRef.current.onShield();
        }
        if (hipY !== null) prevHipYRef.current = hipY;
        return;
      }

      // --- Squat: multi-cue majority vote, edge-triggered. The head (face
      // average) is the most jitter-resistant drop signal, shoulders second;
      // hips often lose confidence mid-squat but count when visible. A squat
      // only registers when at least two of the available cues agree AND the
      // vote holds for 2 consecutive frames — one glitchy keypoint (or a
      // stale smoothed value after a cue drops out) can no longer fire a
      // slide by itself. The detector re-arms once an upper-body cue shows
      // the player standing again (hips jitter too much to be trusted for
      // re-arming). While clearly upright the baseline drifts very slowly
      // toward the current posture, so slouching or stepping closer to the
      // camera mid-game doesn't skew the thresholds. ---
      if (headY !== null) headYSmoothRef.current = ema(headYSmoothRef.current, headY);
      if (shoulderY !== null) shoulderYSmoothRef.current = ema(shoulderYSmoothRef.current, shoulderY);
      if (hipY !== null) hipYSmoothRef.current = ema(hipYSmoothRef.current, hipY);
      const hd = headYSmoothRef.current;
      const sy = shoulderYSmoothRef.current;
      const hy = hipYSmoothRef.current;
      const headSquat = hd !== null && hd > b.headY + 0.2 * b.torso;
      const shoulderSquat = sy !== null && sy > b.shoulderY + 0.18 * b.torso;
      const hipSquat = hy !== null && hy > b.hipY + 0.12 * b.torso;
      const headRecovered = hd !== null && hd < b.headY + 0.08 * b.torso;
      const shoulderRecovered = sy !== null && sy < b.shoulderY + 0.08 * b.torso;
      const cuesAvailable = (hd !== null ? 1 : 0) + (sy !== null ? 1 : 0) + (hy !== null ? 1 : 0);
      const squatVotes = (headSquat ? 1 : 0) + (shoulderSquat ? 1 : 0) + (hipSquat ? 1 : 0);
      const isSquatting = cuesAvailable >= 2 && squatVotes >= 2;
      if (!squatArmedRef.current && (headRecovered || shoulderRecovered)) {
        squatArmedRef.current = true;
      }
      if (isSquatting) {
        squatFramesRef.current += 1;
        if (
          squatArmedRef.current &&
          squatFramesRef.current >= 2 &&
          now - lastSlideRef.current > SLIDE_COOLDOWN_MS
        ) {
          lastSlideRef.current = now;
          squatArmedRef.current = false;
          squatFramesRef.current = 0;
          handlersRef.current.onSlide();
        }
      } else {
        squatFramesRef.current = 0;
        // Clearly-upright frame: slowly adapt the baseline to the current
        // posture. Gating on an upper-body cue keeps a slow, shallow crouch
        // from dragging the baseline down with it and dodging the thresholds.
        if (headRecovered || shoulderRecovered) {
          const drift = (cur: number, v: number | null) =>
            v === null ? cur : cur * 0.97 + v * 0.03;
          b.headY = drift(b.headY, hd);
          b.shoulderY = drift(b.shoulderY, sy);
          b.hipY = drift(b.hipY, hy);
        }
      }

      // --- Left / right: shoulder-center displacement, 3 zones with
      // hysteresis around the baseline center. Shoulders lead sideways steps
      // and stay visible when hips blur out, so this runs even without m. ---
      const shoulderX = measureShoulderX(kps);
      if (shoulderX !== null) {
        const dx = shoulderX - b.centerX;
        // Tight zones with hysteresis: stepping left/right registers fast
        // enough that the lane switch feels immediate (was 0.45 / 0.25)
        const enter = 0.38 * b.shoulderW;
        const exit = 0.2 * b.shoulderW;
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
      }

      // Jump needs the hips; skip it on frames where hips are lost
      if (hipY === null) return;

      // --- Jump: edge-triggered, not level-triggered. The detector re-arms
      // only after the hips return near the baseline, so a slightly off
      // baseline can't auto-fire a jump every cooldown. ---
      if (!jumpArmedRef.current && hipY > b.hipY - 0.1 * b.torso) {
        jumpArmedRef.current = true;
      }
      const risingFast =
        prevHipYRef.current !== null && prevHipYRef.current - hipY > 0.12 * b.torso;
      const aboveBaseline = hipY < b.hipY - 0.15 * b.torso;
      if (
        jumpArmedRef.current &&
        (risingFast || aboveBaseline) &&
        now - lastJumpRef.current > JUMP_COOLDOWN_MS
      ) {
        lastJumpRef.current = now;
        jumpArmedRef.current = false;
        handlersRef.current.onJump();
      }

      prevHipYRef.current = hipY;
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
          if (!cancelled) {
            setStatus('unavailable');
            // Keep retrying on a slow cadence: a failed session is not
            // cached, so a later tick can still bring pose control back.
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
  }, []);

  return status;
}
