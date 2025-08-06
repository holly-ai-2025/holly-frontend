import React, { useEffect, useState } from "react";
import MessageStream from "./MessageStream";
import InputBox from "./InputBox";
import hollyLogo from "../assets/logo.png";
import useVoiceRecorder from "../hooks/useVoiceRecorder";
import { fetchLLMResponse } from "../api/llm";

interface Message {
  role: "user" | "assistant";
  content: string;
}

const LeftPanel = () => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isThinking, setIsThinking] = useState(false);
  const [mode, setMode] = useState<"text" | "voice">("text");

  // Handle STT return → same handler as text input
  const handleSend = (input: string) => {
    if (!input.trim()) return;

    const userMessage = { role: "user", content: input };
    setMessages((prev) => [...prev, userMessage]);

    setIsThinking(true);

    fetchLLMResponse(input)
      .then((reply) => {
        const hollyReply = {
          role: "assistant" as const,
          content: reply,
        };
        setMessages((prev) => [...prev, hollyReply]);
      })
      .catch(() => {
        const hollyReply = {
          role: "assistant" as const,
          content: "Sorry, something went wrong.",
        };
        setMessages((prev) => [...prev, hollyReply]);
      })
      .finally(() => {
        setIsThinking(false);
      });
  };

  const toggleMode = () => {
    setMode((prev) => (prev === "text" ? "voice" : "text"));
  };

  // Voice recorder setup (enabled only in voice mode)
  const { startRecording, stopRecording, isRecording } = useVoiceRecorder(
    (transcribedText) => {
      handleSend(transcribedText);
    }
  );

  // 🎙️ Spacebar triggers in voice mode
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (mode !== "voice") return;
      if (e.code === "Space" && !isRecording) {
        e.preventDefault();
        startRecording();
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (mode !== "voice") return;
      if (e.code === "Space" && isRecording) {
        stopRecording();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, [mode, isRecording]);

  return (
    <div className="flex flex-col gap-4 w-1/4 p-4 box-border h-full">
      {/* Chat Box */}
      <div
        className={`bg-white rounded-xl ${
          isRecording
            ? "shadow-[inset_0_0_0.5rem_rgba(136,0,255,0.3)]"
            : "shadow-inner-strong"
        } border border-gray-400 flex flex-col box-border relative transition-shadow`}
        style={{ height: "65vh" }}
      >
        <div className="flex-1 overflow-auto px-4 pt-4 pb-6 box-border relative">
          {mode === "text" ? (
            <MessageStream messages={messages} isThinking={isThinking} />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center">
              <img
                src={hollyLogo}
                alt="Holly AI Logo"
                className="w-64 h-64 animate-spin-slow opacity-50"
              />
            </div>
          )}
        </div>

        {mode === "text" ? (
          <div className="p-3 box-border">
            <InputBox onSend={handleSend} />
          </div>
        ) : (
          <div className="pb-3 px-4 text-center text-sm text-gray-500">
            Hold <span className="font-medium">Spacebar</span> to talk to Holly.Ai
          </div>
        )}
      </div>

      {/* Toggle Mode Switch */}
      <div className="flex justify-center">
        <div className="bg-light-purple text-white rounded-full flex p-0.5 shadow-md transition-all duration-300 w-56 h-8">
          <button
            onClick={toggleMode}
            className={`flex-1 rounded-full text-sm font-semibold transition-colors duration-300 ${
              mode === "text" ? "bg-white text-deep-purple shadow" : "text-white"
            }`}
          >
            Text Chat
          </button>
          <button
            onClick={toggleMode}
            className={`flex-1 rounded-full text-sm font-semibold transition-colors duration-300 ${
              mode === "voice" ? "bg-white text-deep-purple shadow" : "text-white"
            }`}
          >
            Voice Chat
          </button>
        </div>
      </div>

      {/* Function Panel */}
      <div
        className="bg-white rounded-xl shadow-inner-strong border border-gray-400 p-4 box-border"
        style={{ height: "20vh" }}
      >
        Function List
      </div>
    </div>
  );
};

export default LeftPanel;
