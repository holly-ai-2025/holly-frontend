import React from "react";
import LeftPanel from "./components/LeftPanel";
import MainWindow from "./components/MainWindow";
import RightBar from "./components/RightBar";
import { useTTS } from "./useTTS";

const App = () => {
  const { speak, stop } = useTTS();

  return (
    <div className="flex min-h-screen bg-light-blue">
      {/* LeftPanel wrapper already uses w-1/4 */}
      <LeftPanel />

      {/* MainWindow with padding on right for RightBar space */}
      <main className="flex-1 p-4 pr-[8%] flex flex-col justify-between">
        <MainWindow />

        {/* Temporary voice test controls */}
        <div className="mt-4 space-x-4">
          <button
            onClick={speak}
            className="bg-purple-600 text-white px-4 py-2 rounded shadow-md"
          >
            ▶️ Speak
          </button>
          <button
            onClick={stop}
            className="bg-gray-600 text-white px-4 py-2 rounded shadow-md"
          >
            ⏹ Stop
          </button>
        </div>
      </main>

      {/* RightBar - presumably fixed width */}
      <RightBar />
    </div>
  );
};

export default App;
  