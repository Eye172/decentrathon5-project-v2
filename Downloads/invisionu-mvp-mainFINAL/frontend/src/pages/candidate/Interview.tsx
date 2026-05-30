import { LiveVideoInterview } from "../../components/LiveVideoInterview";

/**
 * /interview route — replaced the text-based chat with the live video interview.
 * All logic lives in LiveVideoInterview (state machine, MediaRecorder, STT/TTS).
 */
export function Interview() {
  return <LiveVideoInterview />;
}
