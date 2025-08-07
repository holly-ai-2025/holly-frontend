import { useCallback, useEffect, useRef, useState } from "react";

// Backend endpoint that returns an MP3 stream for the provided prompt
const TTS_URL = "http://localhost:3001/tts";

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
          body: JSON.stringify({ prompt: text }),
        });

        if (!res.ok) {
          throw new Error(`TTS request failed: ${res.status} ${res.statusText}`);
        }

        const buffer = await res.arrayBuffer();
        const blob = new Blob([buffer], { type: "audio/mpeg" });
        const url = URL.createObjectURL(blob);

        const audio = new Audio(url);
        audioRef.current = audio;
        audio.onended = cleanup;
        await audio.play();
        setIsSpeaking(true);
      } catch (err) {
        console.error("TTS Error:", err);
        setError((err as Error).message);
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

