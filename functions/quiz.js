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

  const isNvidia = GROQ_API_KEY.startsWith("nvapi-");
  const apiUrl = isNvidia
    ? "https://integrate.api.nvidia.com/v1/chat/completions"
    : "https://api.groq.com/openai/v1/chat/completions";
  const apiModel = isNvidia
    ? "deepseek-ai/deepseek-v4-flash"
    : "llama-3.3-70b-versatile";

  const easyCount = Math.round(questionCount * 0.7);
  const hardCount = questionCount - easyCount;

  const prompt = prewritten
    ? `You are an expert quiz formatter. The text below contains pre-written quiz questions and an answer key. Extract and format ALL questions as JSON.

Return ONLY a valid JSON object:
{"title":"quiz title in same language","questions":[{"question":"...","options":["A) ...","B) ..."],"correctAnswer":"A) ...","explanation":"max 5 words","difficulty":"easy"}]}

Rules:
1. Keep the same language as the source (Arabic stays Arabic).
2. True/False: options must be exactly ["A) صح","B) خطأ"] or ["A) True","B) False"].
3. Multiple choice: map أ→A, ب→B, ج→C, د→D and prefix "A) ","B) ","C) ","D) ".
4. Use the answer key at the end of the text to set correctAnswer.
5. Output compact JSON with minimal whitespace.
6. Extract EVERY question — do not skip any.

Questions and answer key:
${text}`
    : `You are an expert quiz generator. Generate exactly ${questionCount} multiple choice questions (${easyCount} easy, ${hardCount} hard) from the study material below.

Return ONLY a valid JSON object:
{"title":"quiz title","questions":[{"question":"...","options":["A) ...","B) ...","C) ...","D) ..."],"correctAnswer":"A) ...","explanation":"max 5 words","difficulty":"easy"}]}

Rules:
1. Language of quiz MUST match the study material language.
2. Exactly ${questionCount} questions, ${easyCount} easy + ${hardCount} hard.
3. Each question has exactly 4 options prefixed A) B) C) D).
4. correctAnswer must exactly match one option.
5. Output compact JSON with minimal whitespace.

Study material:
${text}`;

  const body = {
    model: apiModel,
    messages: [{ role: "user", content: prompt }],
    temperature: 0.7,
    max_tokens: isNvidia ? 8192 : 3500,
    response_format: { type: "json_object" }
  };

  if (isNvidia) {
    // Never use thinking mode — it's too slow and wastes tokens
    body.chat_template_kwargs = { thinking: false };
  }

  try {
    const res = await fetch(apiUrl, {
      method: "POST",
      headers: { "Authorization": `Bearer ${GROQ_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });

    if (!res.ok) {
      const err = await res.text();
      return new Response(JSON.stringify({ error: `API error: ${err}` }), { status: 500, headers: { "Content-Type": "application/json" } });
    }

    const data = await res.json();
    const responseText = data.choices?.[0]?.message?.content;
    if (!responseText) {
      return new Response(JSON.stringify({ error: "No response from API" }), { status: 500, headers: { "Content-Type": "application/json" } });
    }

    const quiz = JSON.parse(responseText);
    return new Response(JSON.stringify(quiz), { headers: { "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
}
