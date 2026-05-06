export async function onRequest({ request, env }) {
  if (request.method !== "POST") return new Response("Method not allowed", { status: 405 });

  const GROQ_API_KEY = request.headers.get("X-Gemini-Key") || env.GROQ_API_KEY;

  if (!GROQ_API_KEY) {
    return new Response(JSON.stringify({ error: "GROQ_API_KEY not configured" }), { status: 500, headers: { "Content-Type": "application/json" } });
  }

  const { text, questionCount = 30, mode, prewritten = false } = await request.json();

  if (!text || !text.trim()) {
    return new Response(JSON.stringify({ error: "No text provided" }), { status: 400, headers: { "Content-Type": "application/json" } });
  }

  const easyCount = Math.round(questionCount * 0.7);
  const hardCount = questionCount - easyCount;

  const prompt = prewritten
    ? `You are a quiz formatter. The text below contains pre-written quiz questions. Extract ALL of them and return as JSON.

Return ONLY a valid JSON object — no markdown, no code blocks:
{
  "title": "A descriptive quiz title based on the topic",
  "questions": [
    {
      "question": "The question text?",
      "options": ["A) Option1", "B) Option2", "C) Option3", "D) Option4"],
      "correctAnswer": "A) Option1",
      "explanation": "Brief explanation of the correct answer.",
      "difficulty": "easy"
    }
  ]
}

Rules:
- Extract every question exactly as written, do not invent new ones
- Each question must have exactly 4 options prefixed A) B) C) D)
- correctAnswer must match one of the options exactly
- Add a short explanation for each correct answer
- difficulty must be "easy" or "hard"

Questions to format:
${text}`
    : `You are a quiz generator. Based on the study material below, generate exactly ${questionCount} multiple choice questions (${easyCount} easy, ${hardCount} hard).

Return ONLY a valid JSON object — no markdown, no code blocks:
{
  "title": "A descriptive quiz title based on the topic",
  "questions": [
    {
      "question": "The question text here?",
      "options": ["A) First option", "B) Second option", "C) Third option", "D) Fourth option"],
      "correctAnswer": "A) First option",
      "explanation": "Brief explanation of why this answer is correct.",
      "difficulty": "easy"
    }
  ]
}

Rules:
- Generate exactly ${questionCount} questions total
- Each question must have exactly 4 options prefixed with A) B) C) D)
- correctAnswer must exactly match one of the options (including the A) B) C) D) prefix)
- explanation should be 1-2 sentences explaining the correct answer
- difficulty must be "easy" or "hard"

Study material:
${text}`;




  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${GROQ_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: "llama-3.3-70b-versatile",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.7,
      response_format: { type: "json_object" }
    })
  });

  if (!res.ok) {
    const err = await res.text();
    return new Response(JSON.stringify({ error: `Groq API error: ${err}` }), { status: 500, headers: { "Content-Type": "application/json" } });
  }

  const data = await res.json();
  const responseText = data.choices?.[0]?.message?.content;

  if (!responseText) {
    return new Response(JSON.stringify({ error: "No response from Groq" }), { status: 500, headers: { "Content-Type": "application/json" } });
  }

  try {
    const quiz = JSON.parse(responseText);
    return new Response(JSON.stringify(quiz), { headers: { "Content-Type": "application/json" } });
  } catch (e) {
    const match = responseText.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        return new Response(match[0], { headers: { "Content-Type": "application/json" } });
      } catch (e2) {}
    }
    return new Response(JSON.stringify({ error: `Failed to parse response: ${responseText.substring(0, 300)}` }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
}
