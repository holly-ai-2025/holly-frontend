let currentAudio: HTMLAudioElement | null = null;
let currentController: AbortController | null = null;

export async function playVoice(
  text: string,
  onStart?: () => void,
  onEnd?: () => void
) {
  stopVoice();

  currentController = new AbortController();
  const response = await fetch("http://localhost:3001/tts", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ text }),
    signal: currentController.signal,
  });

  if (!response.ok || !response.body) {
    throw new Error("Failed to fetch TTS audio");
  }

  const mediaSource = new MediaSource();
  const url = URL.createObjectURL(mediaSource);
  const audio = new Audio();
  currentAudio = audio;
  audio.src = url;
  audio.play().catch(() => {});

  const handleEnd = () => {
    onEnd && onEnd();
    URL.revokeObjectURL(url);
  };

  audio.addEventListener("ended", handleEnd);
  audio.addEventListener("error", handleEnd);
  onStart && onStart();

  mediaSource.addEventListener("sourceopen", async () => {
    const sourceBuffer = mediaSource.addSourceBuffer("audio/mpeg");
    const reader = response.body!.getReader();

    const pump = async () => {
      const { value, done } = await reader.read();
      if (done) {
        if (mediaSource.readyState === "open") {
          mediaSource.endOfStream();
        }
        return;
      }

      await new Promise<void>((resolve) => {
        if (!sourceBuffer.updating) {
          sourceBuffer.appendBuffer(value);
          resolve();
        } else {
          const onUpdate = () => {
            sourceBuffer.removeEventListener("updateend", onUpdate);
            sourceBuffer.appendBuffer(value);
            resolve();
          };
          sourceBuffer.addEventListener("updateend", onUpdate);
        }
      });

      await pump();
    };

    pump();
  });
}

export function stopVoice() {
  if (currentController) {
    currentController.abort();
    currentController = null;
  }
  if (currentAudio) {
    currentAudio.pause();
    currentAudio.currentTime = 0;
    currentAudio.src = "";
    currentAudio = null;
  }
}

