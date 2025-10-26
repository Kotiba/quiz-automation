export async function onRequestPost({ request, env }) {
  const { text } = await request.json();

  const payload = {
    input: text,
    task: "quiz-generation",
    output_format: "json",
    options: {
      mcq_count: 30,
      difficulty_distribution: { easy: 70, hard: 30 }
    }
  };

  const res = await fetch("https://api.deepseek.ai/v1/generate", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${env.DEEPSEEK_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  if (!res.ok) {
    const errText = await res.text();
    return new Response(`DeepSeek API error: ${errText}`, { status: 500 });
  }

  const data = await res.json();
  return new Response(JSON.stringify(data), { headers: { "Content-Type": "application/json" } });
}
