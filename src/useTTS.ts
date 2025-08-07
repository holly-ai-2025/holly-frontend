import { useRef, useState, useEffect } from "react";

// Endpoint that accepts `{ text }` and streams back MP3 audio
const TTS_URL = "/tts";

export function useTTS() {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const mediaSourceRef = useRef<MediaSource | null>(null);
  const sourceBufferRef = useRef<SourceBuffer | null>(null);
  const controllerRef = useRef<AbortController | null>(null);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Ensure single global Audio instance
  if (!audioRef.current) {
    audioRef.current = new Audio();
  }

  const cleanup = () => {
    controllerRef.current?.abort();
    controllerRef.current = null;
    if (audioRef.current) {
      const src = audioRef.current.src;
      audioRef.current.pause();
      audioRef.current.removeAttribute("src");
      if (src) URL.revokeObjectURL(src);
    }
    mediaSourceRef.current = null;
    sourceBufferRef.current = null;
    setIsSpeaking(false);
    setIsPaused(false);
    setIsLoading(false);
    setError(null);
  };

  const stop = () => {
    cleanup();
  };

  const speak = async (text: string) => {
    // Interrupt any current playback
    stop();

    const controller = new AbortController();
    controllerRef.current = controller;

    const mediaSource = new MediaSource();
    mediaSourceRef.current = mediaSource;

    audioRef.current!.src = URL.createObjectURL(mediaSource);

    setIsSpeaking(true);
    setIsPaused(false);
    setIsLoading(true);
    setError(null);

    mediaSource.addEventListener("sourceopen", async () => {
      const mime = "audio/mpeg";
      if (!MediaSource.isTypeSupported(mime)) {
        const errMsg = `Unsupported MIME type ${mime}`;
        console.error(errMsg);
        setError(errMsg);
        cleanup();
        return;
      }
      try {
        const response = await fetch(TTS_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text }),
          signal: controller.signal,
        });

        if (!response.ok || !response.body) {
          throw new Error("TTS request failed");
        }

        const contentType = response.headers.get("Content-Type") || "";
        if (!contentType.includes("audio/mpeg")) {
          const errorText = await response.text().catch(() => "");
          const errMsg = `TTS error: expected audio/mpeg but received ${contentType}`;
          console.error(errMsg, errorText);
          setError(errMsg);
          cleanup();
          return;
        }

        const sourceBuffer = mediaSource.addSourceBuffer(mime);
        sourceBufferRef.current = sourceBuffer;

        const reader = response.body.getReader();
        let started = false;
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
              setIsLoading(false);
              break;
            }
            if (value) {
              await new Promise<void>((resolve, reject) => {
                const appendChunk = () => {
                  sourceBuffer.addEventListener("updateend", () => resolve(), {
                    once: true,
                  });
                  try {
                    sourceBuffer.appendBuffer(value);
                  } catch (err) {
                    reject(err);
                  }
                };

                if (sourceBuffer.updating) {
                  sourceBuffer.addEventListener("updateend", appendChunk, {
                    once: true,
                  });
                } else {
                  appendChunk();
                }
              });

              if (!started) {
                try {
                  await audioRef.current!.play();
                  started = true;
                  setIsLoading(false);
                } catch (err) {
                  throw err;
                }
              }
            }
          }
        };

        pump().catch((err) => {
          if (controller.signal.aborted) return; // normal abort
          console.error(err);
          setError((err as Error).message);
          cleanup();
        });
      } catch (err) {
        if (controller.signal.aborted) return; // ignore abort errors
        console.error(err);
        setError((err as Error).message);
        cleanup();
      }
    });
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

  return { speak, stop, togglePause, isSpeaking, isPaused, isLoading, error };
}
