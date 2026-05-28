export async function onRequest({ request, env }) {
  try {
    if (request.method !== "POST") return new Response("Method not allowed", { status: 405 });

    const API_KEY = request.headers.get("X-Gemini-Key") || (env && env.GROQ_API_KEY);
    if (!API_KEY || !API_KEY.startsWith("nvapi-")) {
      return new Response(JSON.stringify({ error: "Please provide a valid Nvidia API key starting with 'nvapi-'" }), { status: 400, headers: { "Content-Type": "application/json" } });
    }

    let bodyData;
    try {
      bodyData = await request.json();
    } catch (jsonErr) {
      return new Response(JSON.stringify({ error: "Invalid JSON request body" }), { status: 400, headers: { "Content-Type": "application/json" } });
    }

    const { text, questionCount = 30, prewritten = false, stream = false } = bodyData;
    if (!text || !text.trim()) {
      return new Response(JSON.stringify({ error: "No text provided" }), { status: 400, headers: { "Content-Type": "application/json" } });
    }

    const apiUrl = "https://integrate.api.nvidia.com/v1/chat/completions";
    const apiModel = "deepseek-ai/deepseek-v4-flash";

    const easyCount = Math.round(questionCount * 0.7);
    const hardCount = questionCount - easyCount;

    const prompt = prewritten
      ? `You are an expert quiz formatter. Extract and format ALL questions from the text below as JSON.

Return ONLY a valid JSON object:
{"title":"quiz title in same language","questions":[{"question":"...","options":["A) ...","B) ..."],"correctAnswer":"A) ...","explanation":"max 5 words","difficulty":"easy"}]}

Rules:
1. Keep the same language as the source (Arabic stays Arabic, do NOT translate).
2. True/False: options must be exactly ["A) صح","B) خطأ"] or ["A) True","B) False"].
3. Multiple choice: map أ→A ب→B ج→C د→D and prefix "A) " "B) " "C) " "D) ".
4. Use the answer key at the end of the text to set correctAnswer.
5. Output compact JSON with minimal whitespace. Extract EVERY single question — do not skip any.

Questions and answer key:
${text}`
      : `You are an expert quiz generator. Generate exactly ${questionCount} multiple choice questions (${easyCount} easy, ${hardCount} hard) from the study material below.

Return ONLY a valid JSON object:
{"title":"quiz title","questions":[{"question":"...","options":["A) ...","B) ...","C) ...","D) ..."],"correctAnswer":"A) ...","explanation":"max 5 words","difficulty":"easy"}]}

Rules:
1. Language of quiz MUST match the study material language.
2. Exactly ${questionCount} questions total.
3. Each question has exactly 4 options prefixed A) B) C) D).
4. correctAnswer must exactly match one option.
5. Output compact JSON with minimal whitespace.

Study material:
${text}`;

    const body = {
      model: apiModel,
      messages: [{ role: "user", content: prompt }],
      temperature: 1,
      top_p: 0.95,
      max_tokens: 16384,
      stream: stream,
      extra_body: { chat_template_kwargs: { thinking: false } }
    };

    if (!stream) {
      body.response_format = { type: "json_object" };
    }

    const res = await fetch(apiUrl, {
      method: "POST",
      headers: { "Authorization": `Bearer ${API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });

    if (!res.ok) {
      const err = await res.text();
      return new Response(JSON.stringify({ error: `Nvidia API error: ${err}` }), {
        status: 500,
        headers: { "Content-Type": "application/json" }
      });
    }

    if (stream) {
      return new Response(res.body, {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          "X-Accel-Buffering": "no"
        }
      });
    }

    const data = await res.json();
    const responseText = data.choices?.[0]?.message?.content;
    if (!responseText) {
      return new Response(JSON.stringify({ error: "No response from API" }), {
        status: 500,
        headers: { "Content-Type": "application/json" }
      });
    }
    const quiz = JSON.parse(responseText);
    return new Response(JSON.stringify(quiz), { headers: { "Content-Type": "application/json" } });

  } catch (e) {
    return new Response(JSON.stringify({ error: e.message, stack: e.stack }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
}
