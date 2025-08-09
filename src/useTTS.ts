import { useCallback, useEffect, useRef, useState } from "react";
import { fetchLLMResponse } from "./api/llm";

// Backend endpoint that returns an MP3 stream for the provided text
// Prefer an environment variable so deployments can configure the API base
export const TTS_URL =
  import.meta.env.VITE_TTS_URL || "https://api.hollyai.xyz/tts";
const ENABLE_FALLBACK =
  import.meta.env.VITE_ENABLE_TTS_FALLBACK === "true";
const TTS_TEXT_MAX_CHARS =
  Number(import.meta.env.VITE_TTS_TEXT_MAX_CHARS) || 600;
const TTS_SUMMARIZE = import.meta.env.VITE_TTS_SUMMARIZE === "true";

/**
 * Simple hook to turn text into speech using the backend TTS service.
 *
 * It exposes a `speak` function which sends the text to the backend and
 * plays the returned audio.  Callers can also stop or pause playback and
 * observe loading/error state.
 */
export function useTTS() {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cleanup = useCallback(() => {
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      if (audio.src) {
        URL.revokeObjectURL(audio.src);
        audio.removeAttribute("src");
      }
    }
    audioRef.current = null;
    setIsSpeaking(false);
    setIsPaused(false);
  }, []);

  const stop = useCallback(() => {
    cleanup();
  }, [cleanup]);

  const speak = useCallback(
    async (text: string) => {
      if (!text.trim()) return;

      // Interrupt any existing playback
      stop();

      setIsLoading(true);
      setError(null);

      let ttsText = text;

      if (TTS_SUMMARIZE) {
        try {
          ttsText = await fetchLLMResponse(
            `Summarize the following for a spoken response in 2-3 sentences:\n\n${text}`
          );
        } catch (err) {
          console.warn("TTS summarize failed:", err);
          ttsText = text;
        }
      }

      if (ttsText.length > TTS_TEXT_MAX_CHARS) {
        console.warn(
          `TTS text too long: ${ttsText.length}, truncating to ${TTS_TEXT_MAX_CHARS}`
        );
        ttsText = ttsText.slice(0, TTS_TEXT_MAX_CHARS) + "…";
      }

      if (import.meta.env.DEV) {
        console.log(`[tts] text length: ${ttsText.length}`);
      }

      try {
        const res = await fetch(TTS_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          mode: "cors",
          body: JSON.stringify({ text: ttsText, stream: false }),
        });

        if (!res.ok) {
          let errJson: any = {};
          try {
            errJson = await res.json();
          } catch (parseErr) {
            errJson = { error: (parseErr as Error).message };
          }
          console.log({ stage: "tts", ...errJson, status: res.status });
          throw new Error(errJson.error || `TTS request failed: ${res.status}`);
        }

        const ct = res.headers.get("content-type") || "audio/wav";
        const blob = await res.blob();
        const audioBlob = new Blob([blob], { type: ct });
        const url = URL.createObjectURL(audioBlob);

        const audio = document.createElement("audio");
        audio.src = url;
        audioRef.current = audio;
        audio.onended = () => {
          URL.revokeObjectURL(url);
          cleanup();
        };
        await audio.play();
        setIsSpeaking(true);
      } catch (err) {
        console.error("TTS Error:", err);
        const message = (err as Error).message || "Voice timed out. Try again.";
        setError(message);
        if (
          ENABLE_FALLBACK &&
          typeof window !== "undefined" &&
          "speechSynthesis" in window
        ) {
          try {
            const utterance = new SpeechSynthesisUtterance(ttsText);
            utterance.onend = cleanup;
            speechSynthesis.speak(utterance);
            setIsSpeaking(true);
            return;
          } catch (fallbackErr) {
            console.error("speechSynthesis error:", fallbackErr);
          }
        }
        window.dispatchEvent(
          new CustomEvent("app-toast", { detail: message })
        );
        cleanup();
      } finally {
        setIsLoading(false);
      }
    },
    [cleanup, stop]
  );

  const togglePause = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) {
      audio.play();
      setIsPaused(false);
    } else {
      audio.pause();
      setIsPaused(true);
    }
  }, []);

  useEffect(() => {
    return () => cleanup();
  }, [cleanup]);

  return { speak, stop, togglePause, isSpeaking, isPaused, isLoading, error };
}

