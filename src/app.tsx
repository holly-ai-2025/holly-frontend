import { useEffect } from "react";
import LeftPanel from "./components/LeftPanel";
import MainWindow from "./components/MainWindow";
import RightBar from "./components/RightBar";
import InputBox from "./components/InputBox";
import { useTTS } from "./useTTS";

const App = () => {
  const { speak, stop, togglePause, isSpeaking, error } = useTTS();

  const handleSend = (message: string) => {
    speak(message);
  };

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        stop();
      } else if (e.key === " " && !(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement)) {
        e.preventDefault();
        togglePause();
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [stop, togglePause]);

  return (
    <div className="flex min-h-screen bg-light-blue">
      <LeftPanel />
      <main className="flex-1 p-4 pr-[8%] flex flex-col justify-between">
        <MainWindow />
        <div className="mt-4 space-y-2">
          {isSpeaking && (
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <span className="animate-pulse">🔊 Speaking...</span>
              <button onClick={stop} className="text-red-600 underline">
                Stop
              </button>
            </div>
          )}
          {error && (
            <div className="text-sm text-red-600">Speech unavailable: {error}</div>
          )}
          <InputBox onSend={handleSend} onStop={stop} />
        </div>
      </main>
      <RightBar />
    </div>
  );
};

export default App;
