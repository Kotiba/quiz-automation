export async function onRequestPost({ request, env }) {
  const GEMINI_API_KEY = request.headers.get("X-Gemini-Key") || env.GEMINI_API_KEY;

  if (!GEMINI_API_KEY) {
    return new Response(JSON.stringify({ error: "GEMINI_API_KEY not configured" }), { status: 500, headers: { "Content-Type": "application/json" } });
  }

  const { text, questionCount = 30, mode } = await request.json();

  if (!text || !text.trim()) {
    return new Response(JSON.stringify({ error: "No text provided" }), { status: 400, headers: { "Content-Type": "application/json" } });
  }

  const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`;

  const easyCount = Math.round(questionCount * 0.7);
  const hardCount = questionCount - easyCount;

  const prompt = `You are a quiz generator. Based on the study material below, generate exactly ${questionCount} multiple choice questions (${easyCount} easy, ${hardCount} hard).

Return ONLY a valid JSON object in this exact format — no markdown, no code blocks, no explanation:
{
  "title": "A descriptive quiz title based on the topic",
  "questions": [
    {
      "question": "The question text here?",
      "options": ["A) First option", "B) Second option", "C) Third option", "D) Fourth option"],
      "correctAnswer": "A) First option",
      "difficulty": "easy"
    }
  ]
}

Rules:
- Generate exactly ${questionCount} questions total
- Each question must have exactly 4 options prefixed with A) B) C) D)
- correctAnswer must exactly match one of the options (including the A) B) C) D) prefix)
- difficulty must be "easy" or "hard"
- Questions should cover the main concepts in the material

Study material:
${text}`;

  const res = await fetch(GEMINI_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.7,
        responseMimeType: "application/json"
      }
    })
  });

  if (!res.ok) {
    const err = await res.text();
    return new Response(JSON.stringify({ error: `Gemini API error: ${err}` }), { status: 500, headers: { "Content-Type": "application/json" } });
  }

  const data = await res.json();
  const responseText = data.candidates?.[0]?.content?.parts?.[0]?.text;

  if (!responseText) {
    return new Response(JSON.stringify({ error: "No response from Gemini" }), { status: 500, headers: { "Content-Type": "application/json" } });
  }

  try {
    const quiz = JSON.parse(responseText);
    return new Response(JSON.stringify(quiz), { headers: { "Content-Type": "application/json" } });
  } catch (e) {
    // Try to extract JSON block if extra text is present
    const match = responseText.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        const quiz = JSON.parse(match[0]);
        return new Response(JSON.stringify(quiz), { headers: { "Content-Type": "application/json" } });
      } catch (e2) {}
    }
    return new Response(JSON.stringify({ error: `Failed to parse Gemini response: ${responseText.substring(0, 300)}` }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
}
