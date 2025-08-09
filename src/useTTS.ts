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

        // Streaming path — parse framed mini-WAVs and schedule playback
        const playFramedMiniWavs = async (response: Response) => {
          if (!response.body) throw new Error("No response body");
          const reader = response.body.getReader();
          const framing = response.headers.get("X-Stream-Framing") || "";
          if (!framing.includes("wav-l32be")) {
            // Not our framed protocol; fall back to blob.
            throw new Error("Unframed stream");
          }

          const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
          audioCtxRef.current = ctx;
          let startTime = ctx.currentTime;
          let first = true;
          let lastSource: AudioBufferSourceNode | null = null;

          // Reassembly buffers
          let pending = new Uint8Array(0); // bytes we've read but not yet parsed
          let needLen: number | null = null; // bytes remaining for current frame
          let frameLen = 0; // length of the current frame

          const concat = (a: Uint8Array, b: Uint8Array) => {
            const out = new Uint8Array(a.length + b.length);
            out.set(a, 0);
            out.set(b, a.length);
            return out;
          };

          const readExact = (src: Uint8Array, n: number) => {
            return [src.slice(0, n), src.slice(n)] as const;
          };

          return new Promise<void>((resolve, reject) => {
            const pump = () => {
              reader
                .read()
                .then(async ({ value, done }) => {
                  if (done) {
                    if (lastSource) lastSource.onended = () => cleanup();
                    else cleanup();
                    return;
                  }
                  pending = value ? concat(pending, value) : pending;

                  try {
                    // parse as many frames as we can
                    while (true) {
                      if (needLen == null) {
                        if (pending.length < 4) break; // need more bytes for length
                        const [lenBytes, rest] = readExact(pending, 4);
                        pending = rest;
                        // big-endian u32
                        frameLen =
                          (lenBytes[0] << 24) |
                          (lenBytes[1] << 16) |
                          (lenBytes[2] << 8) |
                          lenBytes[3];
                        needLen = frameLen;
                      }
                      if (pending.length < needLen) break; // wait for full frame
                      const [frameBytes, rest2] = readExact(pending, needLen);
                      pending = rest2;
                      needLen = null;

                      // decode this complete mini-WAV
                      let buf: AudioBuffer;
                      try {
                        // Important: slice to a standalone ArrayBuffer
                        const frameCopy = frameBytes.slice().buffer;
                        buf = await ctx.decodeAudioData(frameCopy);
                      } catch (e) {
                        // If first frame fails, bail to blob fallback
                        if (first) {
                          try {
                            await reader.cancel();
                          } catch {}
                          try {
                            await ctx.close();
                          } catch {}
                          reject(e);
                          return;
                        } else {
                          console.warn("decode frame failed", e);
                          continue;
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
                    }
                  } catch (e) {
                    reject(e);
                    return;
                  }
                  pump();
                })
                .catch(reject);
            };
            pump();
          });
        };

        try {
          await playFramedMiniWavs(res.clone());
        } catch (streamErr) {
          // Fallback: whole-blob path (non-stream or debug endpoint)
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
