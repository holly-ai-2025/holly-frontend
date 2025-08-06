export const fetchLLMResponse = async (prompt: string): Promise<string> => {
  const response = await fetch("http://localhost:3001/llm", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ prompt }),
  });

  if (!response.ok) {
    throw new Error("Failed to fetch LLM response");
  }

  const data = await response.json();
  return data.message || "";
};

