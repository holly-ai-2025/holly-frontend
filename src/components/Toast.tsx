import { useEffect, useState } from "react";

const Toast = () => {
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let timeout: number | undefined;
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<string>).detail;
      setMessage(detail);
      clearTimeout(timeout);
      timeout = window.setTimeout(() => setMessage(null), 3000);
    };
    window.addEventListener("app-toast", handler as EventListener);
    return () => {
      window.removeEventListener("app-toast", handler as EventListener);
      if (timeout) clearTimeout(timeout);
    };
  }, []);

  if (!message) return null;

  return (
    <div className="fixed bottom-4 right-4 bg-gray-800 text-white px-3 py-2 rounded shadow text-sm">
      {message}
    </div>
  );
};

export default Toast;
