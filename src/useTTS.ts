import { useRef } from "react";

const AUDIO_URL = "http://127.0.0.1:8000/static/dummy.mp3";

export function useTTS() {
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const speak = () => {
    // Stop any current playback
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }

    // Start new audio
    const audio = new Audio(AUDIO_URL);
    audioRef.current = audio;
    audio.play();
  };

  const stop = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
  };

  return { speak, stop };
}
