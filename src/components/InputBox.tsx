import { useState } from "react";

interface Props {
  onSend: (message: string) => void;
  onStop?: () => void;
}

const InputBox = ({ onSend, onStop }: Props) => {
  const [input, setInput] = useState("");

  const handleSend = () => {
    if (!input.trim()) return;
    onStop?.();
    onSend(input);
    setInput("");
  };

  return (
    <div className="flex gap-2">
      <input
        type="text"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") handleSend();
          if (e.key === "Escape") onStop?.();
        }}
        placeholder="Talk to Holly..."
        className="flex-1 border border-light-purple rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-medium-purple"
      />
      <button
        onClick={handleSend}
        className="bg-deep-purple hover:bg-medium-purple text-white font-semibold px-4 py-2 rounded-lg transition-colors duration-300 text-sm"
      >
        Send
      </button>
    </div>
  );
};

export default InputBox;
