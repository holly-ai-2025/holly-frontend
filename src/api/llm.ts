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

  const data: any = await response.json();

  // Support common LLM response shapes
  return (
    data?.choices?.[0]?.message?.content || // OpenAI-style chat completion
    data?.choices?.[0]?.text || // Completion APIs
    data?.message ||
    data?.response ||
    JSON.stringify(data)
  );
};

