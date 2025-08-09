import { useCallback, useEffect, useRef, useState } from "react";
import { fetchLLMResponse } from "./api/llm";

// Backend endpoint
export const TTS_URL =
  import.meta.env.VITE_TTS_URL || "https://api.hollyai.xyz/tts";
const ENABLE_FALLBACK =
  import.meta.env.VITE_ENABLE_TTS_FALLBACK === "true";
const TTS_TEXT_MAX_CHARS =
  Number(import.meta.env.VITE_TTS_TEXT_MAX_CHARS) || 600;
const TTS_SUMMARIZE = import.meta.env.VITE_TTS_SUMMARIZE === "true";

// If true, do JSON-first to get display text, then stream audio.
// This avoids any transcript-in-header shenanigans.
const TWO_STEP_TTS = true;

export function useTTS() {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cleanup = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;

    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      if (audio.src) {
        URL.revokeObjectURL(audio.src);
        audio.removeAttribute("src");
      }
    }
    audioRef.current = null;

    const ctx = audioCtxRef.current;
    if (ctx) {
      try {
        ctx.close();
      } catch {}
    }
    audioCtxRef.current = null;

    setIsSpeaking(false);
    setIsPaused(false);
  }, []);

  const stop = useCallback(() => {
    cleanup();
  }, [cleanup]);

  const speak = useCallback(
    async (rawText: string) => {
      if (!rawText.trim()) return;

      stop();
      setIsLoading(true);
      setError(null);

      // 0) Optional local summarize
      let ttsText = rawText;
      if (TTS_SUMMARIZE) {
        try {
          ttsText = await fetchLLMResponse(
            `Summarize the following for a spoken response in 2-3 sentences:\n\n${rawText}`
          );
        } catch (err) {
          console.warn("TTS summarize failed:", err);
          ttsText = rawText;
        }
      }

      // 1) Local truncate for UX (backend will also cap)
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
        // 2) (NEW) Ask backend for final display text in JSON mode
        //    This ensures the chat bubble text is clean and avoids headers entirely.
        let displayText = ttsText;
        if (TWO_STEP_TTS) {
          const jsonRes = await fetch(TTS_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            mode: "cors",
            body: JSON.stringify({ json: true, text: ttsText }),
          });
          if (!jsonRes.ok) {
            const errBody = await jsonRes.text().catch(() => "");
            throw new Error(
              `TTS JSON stage failed: ${jsonRes.status} ${errBody}`
            );
          }
          const data = (await jsonRes.json()) as { response?: string };
          if (data?.response) displayText = data.response;
          // You likely show displayText elsewhere in UI; we just ensure it’s ready now.
        }

        // 3) Stream audio for that exact text
        const controller = new AbortController();
        abortRef.current = controller;

        const res = await fetch(TTS_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          mode: "cors",
          body: JSON.stringify({
            stream: true,
            text: TWO_STEP_TTS ? displayText : ttsText,
          }),
          signal: controller.signal,
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

        // Streaming path — attempt chunked decode & schedule
        const playStream = async (response: Response) => {
          if (!response.body) throw new Error("No response body");
          const reader = response.body.getReader();
          const ctx =
            new (window.AudioContext ||
              (window as any).webkitAudioContext)();
          audioCtxRef.current = ctx;

          let startTime = ctx.currentTime;
          let first = true;
          let lastSource: AudioBufferSourceNode | null = null;

          return new Promise<void>((resolve, reject) => {
            const read = () => {
              reader
                .read()
                .then(async ({ value, done }) => {
                  if (done) {
                    if (lastSource) {
                      lastSource.onended = () => cleanup();
                    } else {
                      cleanup();
                    }
                    return;
                  }
                  if (!value) {
                    read();
                    return;
                  }

                  // Try decoding this chunk. If it fails early, fall back below.
                  let buf: AudioBuffer;
                  try {
                    const chunk = value.buffer.slice(
                      value.byteOffset,
                      value.byteOffset + value.byteLength
                    );
                    buf = await ctx.decodeAudioData(chunk);
                  } catch (e) {
                    if (first) {
                      reject(e); // trigger fallback-to-blob
                      return;
                    } else {
                      console.warn("decode chunk failed", e);
                      read();
                      return;
                    }
                  }

                  const source = ctx.createBufferSource();
                  source.buffer = buf;
                  source.connect(ctx.destination);
                  source.start(startTime);
                  startTime += buf.duration;
                  lastSource = source;

                  if (first) {
                    setIsSpeaking(true);
                    first = false;
                    resolve();
                  }

                  read();
                })
                .catch((err) => reject(err));
            };
            read();
          });
        };

        try {
          await playStream(res.clone());
        } catch (streamErr) {
          // Many browsers can't decode partial WAV chunks; fall back to whole blob.
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
        }
      } catch (err) {
        console.error("TTS Error:", err);
        const message =
          (err as Error).message || "Voice timed out. Try again.";
        setError(message);

        // Browser fallback voice (optional)
        if (
          ENABLE_FALLBACK &&
          typeof window !== "undefined" &&
          "speechSynthesis" in window
        ) {
          try {
            const utterance = new SpeechSynthesisUtterance(rawText);
            utterance.onend = cleanup;
            speechSynthesis.speak(utterance);
            setIsSpeaking(true);
            return;
          } catch (fallbackErr) {
            console.error("speechSynthesis error:", fallbackErr);
          }
        }

        window.dispatchEvent(new CustomEvent("app-toast", { detail: message }));
        cleanup();
      } finally {
        setIsLoading(false);
      }
    },
    [cleanup, stop]
  );

  const togglePause = useCallback(() => {
    const ctx = audioCtxRef.current;
    if (ctx) {
      if (ctx.state === "running") {
        ctx.suspend();
        setIsPaused(true);
      } else {
        ctx.resume();
        setIsPaused(false);
      }
      return;
    }

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
