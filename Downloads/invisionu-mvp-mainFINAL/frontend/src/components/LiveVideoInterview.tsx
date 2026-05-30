import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "../context/AuthContext";
import { useTranslation } from "react-i18next";
import { liveInterviewApi, setAuthToken } from "../api/client";
import { MeshBackground } from "./MeshBackground";

// ── MediaPipe FaceLandmarker Behavior Tracker ────────────────────────────────
// Uses @mediapipe/tasks-vision FaceLandmarker with blendshapes to track:
//   eyeLookInL/R, eyeLookOutL/R  → lateral gaze (saccade / reading detection)
//   browInnerUp                  → stress / uncertainty signal
//   jawOpen                      → speech sync (deepfake / reading check)
// Samples every 500 ms and builds a timestamped behavioral_log for backend analysis.

interface BlendshapeEntry {
  t: number;          // ms since tracker.start()
  eyeLookInL: number;
  eyeLookInR: number;
  eyeLookOutL: number;
  eyeLookOutR: number;
  browInnerUp: number;
  jawOpen: number;
}

interface BehaviorReport {
  samples_taken: number;
  behavioral_log: BlendshapeEntry[];
}

// Loaded lazily so the heavy WASM bundle doesn't block initial render.
let _FaceLandmarker: typeof import("@mediapipe/tasks-vision").FaceLandmarker | null = null;
let _FilesetResolver: typeof import("@mediapipe/tasks-vision").FilesetResolver | null = null;

class MediaPipeFaceTracker {
  private landmarker: import("@mediapipe/tasks-vision").FaceLandmarker | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private log: BlendshapeEntry[] = [];
  private startTime = 0;
  private lastTs = -1;
  private getVideo: () => HTMLVideoElement | null;

  constructor(getVideo: () => HTMLVideoElement | null) {
    this.getVideo = getVideo;
    this._init().catch((e) => console.warn("[BehaviorTracker] MediaPipe init failed:", e));
  }

  private async _init() {
    if (!_FaceLandmarker) {
      const mod = await import("@mediapipe/tasks-vision");
      _FaceLandmarker = mod.FaceLandmarker;
      _FilesetResolver = mod.FilesetResolver;
    }
    const vision = await _FilesetResolver!.forVisionTasks(
      "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.34/wasm"
    );
    this.landmarker = await _FaceLandmarker!.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath:
          "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task",
        delegate: "GPU",
      },
      outputFaceBlendshapes: true,
      runningMode: "VIDEO",
      numFaces: 1,
    });
  }

  isRunning() { return this.timer !== null; }

  /** Begin collecting samples. Safe to call before init finishes — early frames are skipped. */
  start() {
    if (this.timer) return; // already started
    this.startTime = Date.now();
    this.log = [];
    this.lastTs = -1;
    this.timer = setInterval(() => this._sample(), 500);
  }

  stop() {
    if (this.timer) { clearInterval(this.timer); this.timer = null; }
    try { this.landmarker?.close(); } catch { /* ignore */ }
    this.landmarker = null;
  }

  private _sample() {
    if (!this.landmarker) return;
    const video = this.getVideo();
    if (!video || video.readyState < 2 || !video.videoWidth) return;

    const now = performance.now();
    // FaceLandmarker requires strictly increasing timestamps
    if (now <= this.lastTs) return;
    this.lastTs = now;

    try {
      const result = this.landmarker.detectForVideo(video, now);
      const cats = result.faceBlendshapes?.[0]?.categories;
      if (!cats || cats.length === 0) return;

      const g = (name: string) => cats.find((c) => c.categoryName === name)?.score ?? 0;

      this.log.push({
        t: Date.now() - this.startTime,
        eyeLookInL:  g("eyeLookInLeft"),
        eyeLookInR:  g("eyeLookInRight"),
        eyeLookOutL: g("eyeLookOutLeft"),
        eyeLookOutR: g("eyeLookOutRight"),
        browInnerUp: g("browInnerUp"),
        jawOpen:     g("jawOpen"),
      });
    } catch { /* frame decode error — skip */ }
  }

  report(): BehaviorReport {
    return {
      samples_taken: this.log.length,
      behavioral_log: this.log,
    };
  }
}

// ── Constants ─────────────────────────────────────────────────────────────────

const MAX_Q = 4;        // questions per interview
const PREP_S = 15;      // preparation countdown (seconds)
const ANSWER_S = 120;   // answer time limit (seconds) — 2 minutes

// ── Types ─────────────────────────────────────────────────────────────────────

type Stage =
  | "onboarding"   // disclaimer screen
  | "requesting"   // getUserMedia in progress
  | "countdown"    // 15 s prep timer
  | "loading"      // fetching first question
  | "question"     // showing question, waiting for answer
  | "processing"   // uploading audio + waiting for next question
  | "finalizing"   // uploading full video
  | "done"         // complete
  | "error";

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Decode base64-encoded audio bytes into a Blob URL for HTMLAudioElement. */
function b64ToObjectUrl(b64: string, mime = "audio/mp3"): string {
  const raw = atob(b64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return URL.createObjectURL(new Blob([arr], { type: mime }));
}

/** Pick the first MIME type the current browser's MediaRecorder supports. */
function pickMime(candidates: string[]): string {
  return (
    candidates.find((m) => {
      try {
        return MediaRecorder.isTypeSupported(m);
      } catch {
        return false;
      }
    }) ?? candidates[candidates.length - 1]
  );
}

const VIDEO_MIME = pickMime([
  "video/webm;codecs=vp9,opus",
  "video/webm;codecs=vp8,opus",
  "video/webm",
]);

const AUDIO_MIME = pickMime([
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/ogg;codecs=opus",
  "audio/mp4",
]);

// ── Component ─────────────────────────────────────────────────────────────────

export function LiveVideoInterview() {
  const { auth } = useAuth();
  const navigate = useNavigate();
  const { i18n } = useTranslation();

  // ── State machine ──────────────────────────────────────────────────────────
  const [stage, setStage] = useState<Stage>("onboarding");
  const [errMsg, setErrMsg] = useState("");

  // ── Timers ─────────────────────────────────────────────────────────────────
  const [prepLeft, setPrepLeft] = useState(PREP_S);
  const [answerLeft, setAnswerLeft] = useState(ANSWER_S);
  const [timerRunning, setTimerRunning] = useState(false);

  // ── Interview state ────────────────────────────────────────────────────────
  const [questionText, setQuestionText] = useState("");
  const [questionNum, setQuestionNum] = useState(1);
  const [transcript, setTranscript] = useState("");
  const [processingMsg, setProcessingMsg] = useState("");

  // ── Stable session ID (never changes for this component instance) ──────────
  const [sessionId] = useState<string>(() => {
    try {
      return crypto.randomUUID();
    } catch {
      return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    }
  });

  // ── Refs (stable across re-renders) ───────────────────────────────────────
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const behaviorRef = useRef<MediaPipeFaceTracker | null>(null);
  const fullRecRef = useRef<MediaRecorder | null>(null);
  const audioRecRef = useRef<MediaRecorder | null>(null);
  const fullChunks = useRef<Blob[]>([]);
  const audioChunks = useRef<Blob[]>([]);
  const ttsAudio = useRef<HTMLAudioElement | null>(null);
  const ttsUrlRef = useRef<string | null>(null);
  const prepTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const answerTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  // Track whether the first TTS playback has finished (for timer start)
  const ttsCompletedOnce = useRef(false);
  /** While true, "Listen" is disabled — until first playback ends or autoplay is blocked (user must tap). */
  const [listenReplayLocked, setListenReplayLocked] = useState(true);
  const autoAdvanceForStepRef = useRef<number | null>(null);
  const handleNextQuestionRef = useRef<(() => Promise<void>) | null>(null);
  // Refs so async callbacks always see the latest values
  const stageRef = useRef<Stage>("onboarding");
  const questionNumRef = useRef(1);

  useEffect(() => { stageRef.current = stage; }, [stage]);
  useEffect(() => { questionNumRef.current = questionNum; }, [questionNum]);

  // ── Auth guard ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!auth?.token) { navigate("/login"); return; }
    setAuthToken(auth.token);
  }, []);

  // ── Re-attach stream whenever the video element remounts ───────────────────
  // The same <video> element stays in the DOM across camera stages (same AnimatePresence key),
  // so this effect mostly serves as a safety net for edge cases.
  useEffect(() => {
    if (videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current;
    }
  }, [stage]);

  // ── Answer timer tick ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!timerRunning) return;
    answerTimer.current = setInterval(() => {
      setAnswerLeft((s) => {
        if (s <= 1) {
          clearInterval(answerTimer.current!);
          // Timer expired — visual indicator only; user still clicks manually
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => { if (answerTimer.current) clearInterval(answerTimer.current); };
  }, [timerRunning]);

  // ── Prep countdown (runs while stage === "countdown") ─────────────────────
  useEffect(() => {
    if (stage !== "countdown") return;
    if (prepTimer.current) clearInterval(prepTimer.current);
    setPrepLeft(PREP_S);
    prepTimer.current = setInterval(() => {
      setPrepLeft((s) => {
        if (s <= 1) {
          clearInterval(prepTimer.current!);
          loadFirstQuestion();
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => { if (prepTimer.current) clearInterval(prepTimer.current); };
  }, [stage]);

  // ── Global cleanup on unmount ──────────────────────────────────────────────
  useEffect(() => {
    return () => {
      if (prepTimer.current) clearInterval(prepTimer.current);
      if (answerTimer.current) clearInterval(answerTimer.current);
      ttsAudio.current?.pause();
      behaviorRef.current?.stop();
      streamRef.current?.getTracks().forEach((t) => t.stop());
      if (ttsUrlRef.current) URL.revokeObjectURL(ttsUrlRef.current);
    };
  }, []);

  // ── Actions ────────────────────────────────────────────────────────────────

  const showError = (msg: string) => { setErrMsg(msg); setStage("error"); };

  /** Step 1 — request camera + mic, start full-video recording. */
  const requestPermission = async () => {
    setStage("requesting");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: "user" },
        audio: { echoCancellation: true, noiseSuppression: true },
      });
      streamRef.current = stream;

      // Immediately start recording the full session video
      const fr = new MediaRecorder(stream, { mimeType: VIDEO_MIME });
      fr.ondataavailable = (e) => { if (e.data.size > 0) fullChunks.current.push(e.data); };
      fr.start(1000); // timeslice = 1 s to keep memory usage bounded
      fullRecRef.current = fr;

      // Pre-init MediaPipe during the 15 s countdown so it's ready for the first question
      behaviorRef.current = new MediaPipeFaceTracker(() => videoRef.current);

      setStage("countdown");
    } catch (e) {
      showError(`Не удалось получить доступ к камере/микрофону: ${(e as Error).message}`);
    }
  };

  /** Step 2 — fetch first question from backend and start TTS autoplay. */
  const loadFirstQuestion = async () => {
    setStage("loading");
    try {
      const res = await liveInterviewApi.start(sessionId, i18n.language);
      setQuestionText(res.question);
      setQuestionNum(res.question_number);
      setAnswerLeft(ANSWER_S);
      setTimerRunning(false);
      ttsCompletedOnce.current = false;
      playTTS(res.audio_base64, res.question);
      setStage("question");
    } catch (e) {
      showError(`Не удалось загрузить вопрос: ${(e as Error).message}`);
    }
  };

  /**
   * Play TTS audio.
   * If backend returns base64 MP3 → HTMLAudioElement.
   * If empty (stub/no OpenAI key) → browser SpeechSynthesis API.
   * On first completion → starts answer recording + timer.
   */
  const playTTS = (b64: string, questionTextForFallback?: string) => {
    ttsAudio.current?.pause();
    if (ttsUrlRef.current) { URL.revokeObjectURL(ttsUrlRef.current); ttsUrlRef.current = null; }

    setListenReplayLocked(true);

    const onDone = () => {
      setListenReplayLocked(false);
      if (!ttsCompletedOnce.current) {
        ttsCompletedOnce.current = true;
        beginAnswerRecording();
      }
    };

    if (b64) {
      // Real TTS from OpenAI
      const url = b64ToObjectUrl(b64);
      ttsUrlRef.current = url;
      const audio = new Audio(url);
      ttsAudio.current = audio;
      audio.onended = onDone;
      audio
        .play()
        .catch(() => {
          // Autoplay blocked — user must tap «Слушать» for the first playback
          setListenReplayLocked(false);
        });
    } else {
      // Stub mode: use browser SpeechSynthesis
      ttsAudio.current = null;
      if ("speechSynthesis" in window && questionTextForFallback) {
        window.speechSynthesis.cancel();
        const utt = new SpeechSynthesisUtterance(questionTextForFallback);
        utt.lang = "ru-RU";
        utt.rate = 0.95;
        utt.onend = onDone;
        window.speechSynthesis.speak(utt);
      } else {
        // No TTS at all — start timer after short delay so user can read the question
        setTimeout(onDone, 1500);
      }
    }
  };

  /** Replay TTS for the current question. Also triggers timer on first listen. */
  const replayTTS = () => {
    if (!ttsCompletedOnce.current) {
      setListenReplayLocked(true);
    }
    const onDone = () => {
      setListenReplayLocked(false);
      if (!ttsCompletedOnce.current) {
        ttsCompletedOnce.current = true;
        beginAnswerRecording();
      }
    };

    if (ttsAudio.current) {
      ttsAudio.current.currentTime = 0;
      ttsAudio.current.onended = onDone;
      ttsAudio.current.play().catch(() => {});
    } else if ("speechSynthesis" in window && questionText) {
      // Stub mode replay
      window.speechSynthesis.cancel();
      const utt = new SpeechSynthesisUtterance(questionText);
      utt.lang = "ru-RU";
      utt.rate = 0.95;
      utt.onend = onDone;
      window.speechSynthesis.speak(utt);
    }
  };

  /** Start audio-only recording for the current answer slice + answer timer. */
  const beginAnswerRecording = () => {
    if (!streamRef.current) return;

    // Start sampling on first question (tracker was pre-initialised in requestPermission)
    if (behaviorRef.current && !behaviorRef.current.isRunning()) {
      behaviorRef.current.start();
    }

    // Stop any previous audio recorder
    if (audioRecRef.current && audioRecRef.current.state !== "inactive") {
      audioRecRef.current.stop();
    }
    audioChunks.current = [];

    // Audio-only stream (separate from the full video stream)
    const audioStream = new MediaStream(streamRef.current.getAudioTracks());
    const ar = new MediaRecorder(audioStream, { mimeType: AUDIO_MIME });
    ar.ondataavailable = (e) => { if (e.data.size > 0) audioChunks.current.push(e.data); };
    ar.start(500);
    audioRecRef.current = ar;

    setAnswerLeft(ANSWER_S);
    setTimerRunning(true);
  };

  /** Called when user clicks "Next Question". Stops audio recorder and uploads. */
  const handleNextQuestion = async () => {
    const cur = stageRef.current;
    if (cur === "processing" || cur === "finalizing") return;

    if (answerTimer.current) clearInterval(answerTimer.current);
    setTimerRunning(false);
    setStage("processing");
    setProcessingMsg("ИИ анализирует ваш ответ...");

    const ar = audioRecRef.current;
    const step = questionNumRef.current;

    if (!ar || ar.state === "inactive") {
      await submitStep(new Blob([], { type: AUDIO_MIME }), step);
      return;
    }

    ar.onstop = async () => {
      const blob = new Blob(audioChunks.current, { type: AUDIO_MIME });
      audioChunks.current = [];
      await submitStep(blob, step);
    };
    ar.stop();
  };

  /** POST audio slice → backend → receive transcript + next question + TTS. */
  const submitStep = async (audioBlob: Blob, step: number) => {
    try {
      const res = await liveInterviewApi.step(sessionId, step, audioBlob, i18n.language);
      setTranscript(res.transcript ?? "");

      if (res.is_final) {
        await doFinalize();
      } else {
        setQuestionText(res.next_question!);
        setQuestionNum(res.question_number);
        setAnswerLeft(ANSWER_S);
        setTimerRunning(false);
        ttsCompletedOnce.current = false;
        playTTS(res.audio_base64 ?? "", res.next_question ?? "");
        setStage("question");
      }
    } catch (e) {
      showError(`Ошибка при обработке ответа: ${(e as Error).message}`);
    }
  };

  handleNextQuestionRef.current = handleNextQuestion;

  useEffect(() => {
    if (stage !== "question" || !timerRunning || answerLeft !== 0) return;
    const q = questionNum;
    if (autoAdvanceForStepRef.current === q) return;
    autoAdvanceForStepRef.current = q;
    void handleNextQuestionRef.current?.();
  }, [stage, timerRunning, answerLeft, questionNum]);

  /** Stop full-video recorder, then upload the blob. */
  const doFinalize = async () => {
    setStage("finalizing");
    setProcessingMsg("Сохраняем запись интервью...");

    const fr = fullRecRef.current;
    if (!fr || fr.state === "inactive") {
      await uploadFullVideo(new Blob(fullChunks.current, { type: VIDEO_MIME }));
      return;
    }

    fr.onstop = async () => {
      const blob = new Blob(fullChunks.current, { type: VIDEO_MIME });
      await uploadFullVideo(blob);
    };
    fr.stop();
  };

  const uploadFullVideo = async (blob: Blob) => {
    try {
      // Stop behavior tracker and collect report
      behaviorRef.current?.stop();
      const behaviorReport = behaviorRef.current?.report();

      await liveInterviewApi.finalize(sessionId, blob, behaviorReport);
      streamRef.current?.getTracks().forEach((t) => t.stop());
      setStage("done");
    } catch (e) {
      showError(`Ошибка при сохранении видео: ${(e as Error).message}`);
    }
  };

  // ── Derived values ─────────────────────────────────────────────────────────
  const timerPct = (answerLeft / ANSWER_S) * 100;
  const timerColor =
    timerPct > 40 ? "var(--acid)" : timerPct > 15 ? "#f59e0b" : "#ef4444";

  const isCameraStage = ["countdown", "loading", "question", "processing", "finalizing"].includes(
    stage
  );

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="page-dark h-dvh flex flex-col overflow-hidden relative select-none">
      <MeshBackground variant="minimal" />

      <AnimatePresence mode="wait">

        {/* ── ONBOARDING ──────────────────────────────────────────────────── */}
        {stage === "onboarding" && (
          <motion.div
            key="onboarding"
            initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -16 }}
            className="flex-1 flex items-center justify-center p-4 relative z-10"
          >
            <div
              className="glass rounded-3xl p-8 max-w-md w-full"
              style={{ border: "1px solid rgba(255,255,255,0.1)" }}
            >
              {/* Header */}
              <div className="flex items-center gap-3 mb-7">
                <div
                  className="w-12 h-12 rounded-2xl glass flex items-center justify-center flex-shrink-0"
                  style={{ border: "1px solid rgba(209,255,0,0.2)" }}
                >
                  <span className="text-xl">🎥</span>
                </div>
                <div>
                  <h2 className="text-white font-bold text-lg leading-tight">AI Видео-Интервью</h2>
                  <p className="hud-label text-xs mt-0.5">
                    inVision U · {MAX_Q} вопроса
                  </p>
                </div>
              </div>

              {/* Checklist */}
              <ul className="space-y-3 mb-5">
                {[
                  { icon: "✓", text: "Смотрите прямо в камеру на протяжении всего интервью — не отводите взгляд", color: "var(--acid)" },
                  { icon: "✓", text: "Расстояние от лица до камеры — около 30 см, лицо по центру кадра", color: "var(--acid)" },
                  { icon: "✓", text: "Хорошее равномерное освещение спереди, никакого контрового света", color: "var(--acid)" },
                  { icon: "✓", text: "Тихое помещение, говорите чётко и достаточно громко", color: "var(--acid)" },
                  { icon: "✓", text: "Вопросы озвучиваются голосом — текст скрыт. Слушайте внимательно", color: "var(--acid)" },
                ].map((item) => (
                  <li key={item.text} className="flex items-start gap-3 text-sm text-white/65">
                    <span className="flex-shrink-0 mt-0.5 font-bold" style={{ color: item.color }}>
                      {item.icon}
                    </span>
                    {item.text}
                  </li>
                ))}
              </ul>

              {/* Warning block */}
              <div
                className="rounded-2xl px-4 py-3 mb-6 text-xs leading-relaxed"
                style={{ background: "rgba(239,68,68,0.07)", border: "1px solid rgba(239,68,68,0.2)" }}
              >
                <p className="font-semibold text-red-400 mb-1">⚠ Важно: система анализирует движения глаз</p>
                <p className="text-white/45">
                  Если вы будете отводить взгляд в сторону, опускать глаза или осматриваться —
                  ИИ зафиксирует это как подозрительное поведение и снизит итоговый балл.
                  Смотрите в одну точку — прямо в объектив камеры.
                </p>
              </div>

              <p className="text-white/25 text-xs text-center mb-7 leading-relaxed">
                2 минуты на каждый ответ · Видеозапись сохраняется
              </p>

              <button onClick={requestPermission} className="btn-primary w-full py-3.5 text-sm font-semibold">
                Начать интервью →
              </button>
            </div>
          </motion.div>
        )}

        {/* ── REQUESTING CAMERA PERMISSION ────────────────────────────────── */}
        {stage === "requesting" && (
          <motion.div
            key="requesting"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="flex-1 flex items-center justify-center relative z-10"
          >
            <div className="text-center">
              <div
                className="w-12 h-12 mx-auto mb-4 rounded-full border-2 border-transparent animate-spin"
                style={{ borderTopColor: "var(--acid)" }}
              />
              <p className="text-white/50 text-sm">Запрашиваем доступ к камере…</p>
            </div>
          </motion.div>
        )}

        {/* ── ALL CAMERA STAGES (same key = no wrapper re-animation) ──────── */}
        {isCameraStage && (
          <motion.div
            key="camera"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="flex-1 flex flex-col items-center justify-start gap-3 px-4 pt-4 pb-4
                       relative z-10 max-w-2xl mx-auto w-full overflow-y-auto"
          >
            {/* ── Progress header ────────────────────────────────────────── */}
            <div className="w-full flex items-center justify-between flex-shrink-0">
              <div className="flex items-center gap-2">
                <div
                  className="w-7 h-7 rounded-lg glass flex items-center justify-center"
                  style={{ border: "1px solid rgba(209,255,0,0.15)" }}
                >
                  <span
                    className="font-black text-xs"
                    style={{ color: "var(--acid)", fontFamily: "monospace" }}
                  >
                    iU
                  </span>
                </div>
                <span className="hud-label text-xs">AI INTERVIEW</span>
              </div>
              <div className="flex gap-1.5">
                {Array.from({ length: MAX_Q }).map((_, i) => (
                  <div
                    key={i}
                    className="w-2 h-2 rounded-full transition-all duration-300"
                    style={{
                      background: i < questionNum ? "var(--acid)" : "rgba(255,255,255,0.15)",
                      transform: i < questionNum ? "scale(1.15)" : "scale(1)",
                    }}
                  />
                ))}
              </div>
            </div>

            {/* ── Answer timer bar ──────────────────────────────────────── */}
            <div
              className="w-full h-1.5 rounded-full flex-shrink-0"
              style={{ background: "rgba(255,255,255,0.07)" }}
            >
              <motion.div
                className="h-full rounded-full"
                animate={{ width: timerRunning ? `${timerPct}%` : "100%" }}
                transition={{ duration: timerRunning ? 1 : 0.3, ease: "linear" }}
                style={{ background: timerColor }}
              />
            </div>

            {/* ── Question indicator (text HIDDEN — audio only) ──────────── */}
            <AnimatePresence>
              {(stage === "question" || stage === "processing") && (
                <motion.div
                  key="qcard"
                  initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                  className="w-full glass rounded-2xl px-5 py-3 flex-shrink-0 flex items-center gap-4"
                  style={{ border: "1px solid rgba(255,255,255,0.07)" }}
                >
                  {/* AI badge */}
                  <div
                    className="w-8 h-8 rounded-full glass flex-shrink-0 flex items-center justify-center"
                    style={{ border: "1px solid rgba(209,255,0,0.2)" }}
                  >
                    <span className="text-xs font-black" style={{ color: "var(--acid)", fontFamily: "monospace" }}>
                      AI
                    </span>
                  </div>

                  {/* Question number */}
                  <div className="flex-1">
                    <div className="hud-label text-xs" style={{ color: "rgba(209,255,0,0.5)" }}>
                      ВОПРОС {questionNum} / {MAX_Q}
                    </div>
                    <p className="text-white/40 text-xs mt-0.5">
                      Прослушайте вопрос — текст скрыт · смотрите в камеру
                    </p>
                  </div>

                  {/* Audio wave animation */}
                  {stage === "question" && !timerRunning && (
                    <div className="flex items-end gap-0.5 flex-shrink-0 h-5">
                      {[1, 2, 3, 2, 1].map((h, i) => (
                        <div
                          key={i}
                          className="w-1 rounded-full animate-pulse"
                          style={{
                            height: `${h * 5}px`,
                            background: "var(--acid)",
                            animationDelay: `${i * 100}ms`,
                            opacity: 0.8,
                          }}
                        />
                      ))}
                    </div>
                  )}

                  {/* Transcript shown after answer is processed (optional context) */}
                  {transcript && stage === "question" && timerRunning && (
                    <div
                      className="flex-shrink-0 px-2.5 py-1 rounded-lg text-xs text-white/30 italic"
                      style={{ background: "rgba(255,255,255,0.03)", maxWidth: "160px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                      title={`Распознано: «${transcript}»`}
                    >
                      🎤 ответ принят
                    </div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>

            {/* ── Camera preview ───────────────────────────────────────── */}
            <div
              className="w-full relative rounded-3xl overflow-hidden flex-1 min-h-0"
              style={{
                minHeight: "200px",
                border: "1px solid rgba(255,255,255,0.09)",
                boxShadow: "0 8px 40px rgba(0,0,0,0.55), 0 0 0 1px rgba(255,255,255,0.04)",
                background: "#060606",
              }}
            >
              {/* The <video> element stays in the DOM for all camera stages */}
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="w-full h-full object-cover"
                style={{ transform: "scaleX(-1)" }}
              />

              {/* Countdown overlay */}
              {stage === "countdown" && (
                <div
                  className="absolute inset-0 flex flex-col items-center justify-center"
                  style={{ background: "rgba(0,0,0,0.55)" }}
                >
                  <p
                    className="hud-label text-xs mb-3"
                    style={{ color: "rgba(255,255,255,0.45)" }}
                  >
                    ПОДГОТОВКА
                  </p>
                  <motion.span
                    key={prepLeft}
                    initial={{ scale: 1.5, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ type: "spring", stiffness: 300, damping: 22 }}
                    className="font-black leading-none"
                    style={{
                      fontSize: "clamp(4rem, 14vw, 7rem)",
                      color: "var(--acid)",
                      fontFamily: "'Space Grotesk', sans-serif",
                    }}
                  >
                    {prepLeft}
                  </motion.span>
                  <p className="text-white/35 text-xs mt-4">Расположите лицо по центру</p>
                </div>
              )}

              {/* Loading first question overlay */}
              {stage === "loading" && (
                <div
                  className="absolute inset-0 flex flex-col items-center justify-center"
                  style={{ background: "rgba(0,0,0,0.6)" }}
                >
                  <div
                    className="w-10 h-10 rounded-full border-2 border-transparent animate-spin mb-3"
                    style={{ borderTopColor: "var(--acid)" }}
                  />
                  <p className="hud-label text-xs" style={{ color: "rgba(255,255,255,0.45)" }}>
                    ИИ ГОТОВИТ ВОПРОС…
                  </p>
                </div>
              )}

              {/* "Listen first" hint (question stage, before timer starts) */}
              {stage === "question" && !timerRunning && (
                <div className="absolute bottom-3 left-0 right-0 flex justify-center pointer-events-none">
                  <div
                    className="glass rounded-full px-4 py-1.5"
                    style={{ border: "1px solid rgba(209,255,0,0.15)" }}
                  >
                    <p className="text-xs font-medium" style={{ color: "rgba(209,255,0,0.7)" }}>
                      🔊 Слушайте вопрос · смотрите в камеру · не отводите взгляд
                    </p>
                  </div>
                </div>
              )}

              {/* Processing overlay */}
              {(stage === "processing" || stage === "finalizing") && (
                <motion.div
                  initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                  className="absolute inset-0 flex flex-col items-center justify-center"
                  style={{ background: "rgba(0,0,0,0.78)" }}
                >
                  <div
                    className="w-10 h-10 rounded-full border-2 border-transparent animate-spin mb-3"
                    style={{ borderTopColor: "var(--acid)" }}
                  />
                  <p className="text-white/60 text-sm">{processingMsg}</p>
                </motion.div>
              )}

              {/* REC badge */}
              {timerRunning && (
                <div
                  className="absolute top-3 right-3 flex items-center gap-1.5 glass rounded-full px-2.5 py-1"
                  style={{ border: "1px solid rgba(239,68,68,0.3)" }}
                >
                  <div className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                  <span className="hud-mono text-xs text-red-400">REC</span>
                </div>
              )}

              {/* Timer clock overlay */}
              {timerRunning && (
                <div
                  className="absolute top-3 left-3 glass rounded-full px-2.5 py-1"
                  style={{ border: "1px solid rgba(255,255,255,0.08)" }}
                >
                  <span className="hud-mono text-xs" style={{ color: timerColor }}>
                    {Math.floor(answerLeft / 60)}:{String(answerLeft % 60).padStart(2, "0")}
                  </span>
                </div>
              )}
            </div>

            {/* ── Action buttons (question / processing stages) ────────── */}
            {(stage === "question" || stage === "processing") && (
              <div className="w-full grid grid-cols-2 gap-3 flex-shrink-0">
                {/* Listen button */}
                <button
                  onClick={replayTTS}
                  disabled={stage === "processing" || listenReplayLocked}
                  className="glass rounded-2xl py-3.5 flex items-center justify-center gap-2
                             text-sm font-medium text-white/65 hover:text-white
                             transition-colors duration-200 disabled:opacity-40"
                  style={{ border: "1px solid rgba(255,255,255,0.1)" }}
                >
                  <span>🔊</span>
                  <span>Слушать вопрос</span>
                </button>

                {/* Next question button */}
                <button
                  onClick={handleNextQuestion}
                  disabled={stage === "processing"}
                  className="btn-primary rounded-2xl py-3.5 flex items-center justify-center gap-2
                             text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {stage === "processing" ? (
                    <>
                      <div
                        className="w-4 h-4 rounded-full border-2 border-transparent animate-spin"
                        style={{ borderTopColor: "currentColor" }}
                      />
                      <span>Обработка…</span>
                    </>
                  ) : (
                    <>
                      <span>Следующий вопрос</span>
                      <span>→</span>
                    </>
                  )}
                </button>
              </div>
            )}
          </motion.div>
        )}

        {/* ── DONE ──────────────────────────────────────────────────────────── */}
        {stage === "done" && (
          <motion.div
            key="done"
            initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}
            className="flex-1 flex items-center justify-center p-4 relative z-10"
          >
            <div
              className="glass rounded-3xl p-8 max-w-md w-full text-center"
              style={{ border: "1px solid rgba(209,255,0,0.12)" }}
            >
              <div
                className="w-16 h-16 rounded-full mx-auto mb-5 flex items-center justify-center"
                style={{
                  background: "rgba(209,255,0,0.1)",
                  border: "1px solid rgba(209,255,0,0.25)",
                }}
              >
                <span className="text-3xl font-black" style={{ color: "var(--acid)" }}>✓</span>
              </div>
              <h2 className="text-white font-bold text-xl mb-2">Интервью завершено!</h2>
              <p className="text-white/45 text-sm mb-8 leading-relaxed">
                ИИ анализирует ваши ответы и видеозапись.
                <br />
                Результаты появятся в ближайшее время.
              </p>
              <div className="status-dot mb-6 mx-auto" style={{ width: "8px", height: "8px" }} />
              <button onClick={() => navigate("/done")} className="btn-primary w-full py-3.5">
                Продолжить →
              </button>
            </div>
          </motion.div>
        )}

        {/* ── ERROR ─────────────────────────────────────────────────────────── */}
        {stage === "error" && (
          <motion.div
            key="error"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="flex-1 flex items-center justify-center p-4 relative z-10"
          >
            <div
              className="glass rounded-3xl p-8 max-w-md w-full text-center"
              style={{ border: "1px solid rgba(239,68,68,0.2)" }}
            >
              <div className="text-3xl mb-4">⚠️</div>
              <h2 className="text-red-400 font-bold text-lg mb-2">Произошла ошибка</h2>
              <p className="text-white/40 text-sm mb-7 leading-relaxed">{errMsg}</p>
              <button onClick={() => { setStage("onboarding"); setErrMsg(""); }} className="btn-primary w-full py-3">
                Попробовать снова
              </button>
            </div>
          </motion.div>
        )}

      </AnimatePresence>
    </div>
  );
}
