import { useRef, useState } from "react";

const STT_URL =
  import.meta.env.VITE_STT_URL || "https://stt.hollyai.xyz/listen";
const LOG_DEBUG = import.meta.env.VITE_LOG_VOICE_DEBUG === "true";

const useVoiceRecorder = (
  onResult: (transcribedText: string) => void
) => {
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const [isRecording, setIsRecording] = useState(false);
  const startTimeRef = useRef<number>(0);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRecorderRef.current = new MediaRecorder(stream);

      chunks.current = [];

      mediaRecorderRef.current.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunks.current.push(e.data);
        }
      };

      mediaRecorderRef.current.onstop = async () => {
        const audioBlob = new Blob(chunks.current, { type: "audio/webm" });
        const recordMs = Date.now() - startTimeRef.current;
        chunks.current = [];

        try {
          const formData = new FormData();
          formData.append("file", audioBlob, "recording.webm");

          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 20000);
          const fetchStart = Date.now();
          const response = await fetch(STT_URL, {
            method: "POST",
            body: formData,
            signal: controller.signal,
          }).finally(() => clearTimeout(timeout));
          const roundTrip = Date.now() - fetchStart;

          if (LOG_DEBUG) {
            console.log(
              `Recorded ${recordMs}ms, STT round-trip ${roundTrip}ms`
            );
          }

          const contentType = response.headers.get("content-type") || "";
          if (response.ok && contentType.includes("application/json")) {
            const data = await response.json();

            if (data.text) {
              onResult(data.text);
            } else {
              console.error("No transcription text returned", data);
              onResult("Sorry, I didn't catch that.");
            }
          } else {
            let message = `STT request failed: ${response.status} ${response.statusText}`;
            try {
              if (contentType.includes("application/json")) {
                const data = await response.json();
                console.error("STT JSON error:", data);
                message = data.error || data.message || message;
              } else {
                const text = await response.text();
                console.error("STT error:", text);
                if (text) message = text;
              }
            } catch (parseErr) {
              console.error("STT parse error:", parseErr);
            }
            console.error(message);
            onResult("Sorry, I didn't catch that.");
          }
        } catch (err) {
          if ((err as Error).name === "AbortError") {
            console.error("STT request timed out");
            onResult("Speech recognition timed out.");
          } else {
            console.error("Error sending audio to backend:", err);
            onResult("Oops, something went wrong.");
          }
        }
      };

      mediaRecorderRef.current.start();
      startTimeRef.current = Date.now();
      setIsRecording(true);
    } catch (error) {
      console.error("Microphone access denied or error:", error);
    }
  };

  const stopRecording = () => {
    mediaRecorderRef.current?.stop();
    setIsRecording(false);
  };

  return { startRecording, stopRecording, isRecording };
};

export default useVoiceRecorder;
