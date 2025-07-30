import React, { useEffect, useRef } from "react";
import { motion } from "framer-motion";

interface Message {
  role: "user" | "assistant";
  content: string;
}

interface Props {
  messages: Message[];
  isThinking?: boolean;
}

const MessageStream = ({ messages, isThinking }: Props) => {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTo({
        top: containerRef.current.scrollHeight,
        behavior: "smooth",
      });
    }
  }, [messages, isThinking]);

  return (
    <div
      ref={containerRef}
      className="flex flex-col gap-2 text-sm overflow-y-auto max-h-full scroll-smooth pb-6"
    >
      {messages.map((msg, i) => (
        <motion.div
          key={i}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className={`max-w-[75%] px-3 py-1 rounded-lg shadow-md ${
            msg.role === "user"
              ? "bg-purple-500 text-white self-end text-right"
              : "bg-gray-200 text-gray-900 self-start text-left"
          }`}
        >
          {msg.content}
        </motion.div>
      ))}

      {isThinking && (
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="italic text-xs text-gray-500 self-start"
        >
          Holly is thinking...
        </motion.div>
      )}
    </div>
  );
};

export default MessageStream;
