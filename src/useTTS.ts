import { useRef, useState, useEffect } from "react";

const LLM_URL = "http://localhost:3001/llm";

export function useTTS() {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const mediaSourceRef = useRef<MediaSource | null>(null);
  const sourceBufferRef = useRef<SourceBuffer | null>(null);
  const controllerRef = useRef<AbortController | null>(null);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isPaused, setIsPaused] = useState(false);

  // Ensure single global Audio instance
  if (!audioRef.current) {
    audioRef.current = new Audio();
  }

  const cleanup = () => {
    controllerRef.current?.abort();
    controllerRef.current = null;
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.removeAttribute("src");
    }
    mediaSourceRef.current = null;
    sourceBufferRef.current = null;
    setIsSpeaking(false);
    setIsPaused(false);
  };

  const stop = () => {
    cleanup();
  };

  const speak = async (prompt: string) => {
    // Interrupt any current playback
    stop();

    const controller = new AbortController();
    controllerRef.current = controller;

    const mediaSource = new MediaSource();
    mediaSourceRef.current = mediaSource;

    audioRef.current!.src = URL.createObjectURL(mediaSource);

    setIsSpeaking(true);
    setIsPaused(false);

    mediaSource.addEventListener("sourceopen", async () => {
      const sourceBuffer = mediaSource.addSourceBuffer("audio/mpeg");
      sourceBufferRef.current = sourceBuffer;

      try {
        const response = await fetch(LLM_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prompt }),
          signal: controller.signal,
        });

        if (!response.ok || !response.body) {
          throw new Error("TTS request failed");
        }

        const reader = response.body.getReader();
        const pump = async (): Promise<void> => {
          while (true) {
            const { value, done } = await reader.read();
            if (done) {
              await new Promise<void>((resolve) => {
                if (!sourceBuffer.updating) return resolve();
                sourceBuffer.addEventListener("updateend", () => resolve(), {
                  once: true,
                });
              });
              mediaSource.endOfStream();
              setIsSpeaking(false);
              break;
            }
            if (value) {
              await new Promise<void>((resolve) => {
                sourceBuffer.addEventListener("updateend", () => resolve(), {
                  once: true,
                });
                sourceBuffer.appendBuffer(value);
              });
            }
          }
        };

        pump().catch((err) => {
          if (controller.signal.aborted) return; // normal abort
          console.error(err);
          cleanup();
        });
      } catch (err) {
        if (controller.signal.aborted) return; // ignore abort errors
        console.error(err);
        cleanup();
      }
    });

    try {
      await audioRef.current!.play();
    } catch (err) {
      console.error(err);
      cleanup();
    }
  };

  const togglePause = () => {
    if (!audioRef.current) return;
    if (audioRef.current.paused) {
      audioRef.current.play();
      setIsPaused(false);
    } else {
      audioRef.current.pause();
      setIsPaused(true);
    }
  };

  useEffect(() => {
    return () => cleanup();
  }, []);

  return { speak, stop, togglePause, isSpeaking, isPaused };
}
