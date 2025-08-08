import { useCallback, useEffect, useRef, useState } from "react";

// Backend endpoint that returns an MP3 stream for the provided prompt
// Prefer an environment variable so deployments can configure the API base
const TTS_URL = import.meta.env.VITE_TTS_URL || "https://api.hollyai.xyz/tts";
const ENABLE_FALLBACK =
  import.meta.env.VITE_ENABLE_TTS_FALLBACK === "true";

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

      try {
        const res = await fetch(TTS_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          mode: "cors",
          body: JSON.stringify({ prompt: text, stream: false }),
        });

        const contentType = res.headers.get("content-type") || "";

        if (res.ok && contentType.startsWith("audio")) {
          const buffer = await res.arrayBuffer();
          const blob = new Blob([buffer], { type: contentType });
          const url = URL.createObjectURL(blob);

          const audio = new Audio(url);
          audioRef.current = audio;
          audio.onended = cleanup;
          await audio.play();
          setIsSpeaking(true);
        } else {
          let message = `TTS request failed: ${res.status} ${res.statusText}`;
          try {
            if (contentType.includes("application/json")) {
              const data = await res.json();
              console.error("TTS JSON error:", data);
              message =
                data.error || data.stage || data.stderr || data.message || message;
            } else {
              const text = await res.text();
              console.error("TTS error:", text);
              if (text) message = text;
            }
          } catch (parseErr) {
            console.error("TTS parse error:", parseErr);
          }
          throw new Error(message);
        }
      } catch (err) {
        console.error("TTS Error:", err);
        const message = (err as Error).message;
        setError(message);
        if (
          ENABLE_FALLBACK &&
          typeof window !== "undefined" &&
          "speechSynthesis" in window
        ) {
          try {
            const utterance = new SpeechSynthesisUtterance(text);
            utterance.onend = cleanup;
            speechSynthesis.speak(utterance);
            setIsSpeaking(true);
            return;
          } catch (fallbackErr) {
            console.error("speechSynthesis error:", fallbackErr);
          }
        }
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

