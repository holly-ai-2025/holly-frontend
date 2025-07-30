import { useRef, useState } from "react";

const useVoiceRecorder = (
  onResult: (transcribedText: string) => void
) => {
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const [isRecording, setIsRecording] = useState(false);

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
        chunks.current = [];

        try {
          const formData = new FormData();
          formData.append("file", audioBlob, "recording.webm");

          const response = await fetch("https://manga-enclosure-discounted-before.trycloudflare.com/listen", {
            method: "POST",
            body: formData,
          });

          const data = await response.json();

          if (data.text) {
            onResult(data.text);
          } else {
            console.error("No transcription text returned", data);
            onResult("Sorry, I didn't catch that.");
          }
        } catch (err) {
          console.error("Error sending audio to backend:", err);
          onResult("Oops, something went wrong.");
        }
      };

      mediaRecorderRef.current.start();
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
