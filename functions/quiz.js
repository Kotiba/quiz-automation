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

  // ── Helper: call API with a prompt ──────────────────────────────────────
  async function callAPI(promptText) {
    const body = {
      model: apiModel,
      messages: [{ role: "user", content: promptText }],
      temperature: 0.7,
      max_tokens: isNvidia ? 8192 : 3500,
      response_format: { type: "json_object" }
    };
    if (isNvidia) {
      body.chat_template_kwargs = { thinking: false };
    }
    const res = await fetch(apiUrl, {
      method: "POST",
      headers: { "Authorization": `Bearer ${GROQ_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`API error: ${err}`);
    }
    const data = await res.json();
    const content = data.choices?.[0]?.message?.content;
    if (!content) throw new Error("No response from API");
    return JSON.parse(content);
  }

  // ── Build a pre-written prompt for a SLICE of questions ─────────────────
  function buildPrewrittenPrompt(chunk, title, answerKey) {
    return `You are an expert quiz formatter. Extract the questions below and format as JSON.

Return ONLY a valid JSON object with this exact shape:
{"title":"${title}","questions":[{"question":"...","options":["A) ...","B) ..."],"correctAnswer":"A) ...","explanation":"max 5 words","difficulty":"easy"}]}

Rules:
1. Keep the same language as the source (Arabic stays Arabic, do NOT translate).
2. True/False: options must be exactly ["A) صح","B) خطأ"] (or True/False equivalent).
3. Multiple choice: map أ→A, ب→B, ج→C, د→D and prefix each option "A) ", "B) ", "C) ", "D) ".
4. Use the answer key below to set correctAnswer for each question.
5. Output compact JSON with minimal whitespace.

Answer key:
${answerKey}

Questions to format:
${chunk}`;
  }

  // ── Pre-written: batch only when question count > 30 ───────────────────
  if (prewritten) {
    const BATCH_THRESHOLD = 30;

    // Detect title from first heading
    const titleMatch = text.match(/^#\s+(.+)/m);
    const title = titleMatch ? titleMatch[1].trim() : "اختبار";

    // Extract answer key section (everything after 📋 or ## إجابات)
    const answerKeyMatch = text.match(/(📋[\s\S]*|##\s*إجابات[\s\S]*|Answer\s+Key[\s\S]*)$/im);
    const answerKey = answerKeyMatch ? answerKeyMatch[0] : "";

    // Split questions into individual blocks
    const questionBlocks = text.split(/(?=^\s*(?:\*\*)?(?:[سqQ](?:uestion)?|سؤال|السؤال)?\s*\d+\s*(?::|\.|\)|\*\*:?\*?\*?:?\s*))/gim)
      .map(b => b.trim())
      .filter(b => /(?:[سqQ](?:uestion)?|سؤال|السؤال)?\s*\d+\s*(?::|\.|\))/i.test(b) && b.length > 10);

    try {
      if (questionBlocks.length === 0 || questionBlocks.length <= BATCH_THRESHOLD) {
        // ── Single call: small quiz or couldn't split ──
        const prompt = buildPrewrittenPrompt(
          questionBlocks.length > 0 ? questionBlocks.join("\n\n") : text,
          title,
          answerKey
        );
        const quiz = await callAPI(prompt);
        return new Response(JSON.stringify(quiz), { headers: { "Content-Type": "application/json" } });
      } else {
        // ── Batched calls: large quiz (> 30 questions) ──
        const chunks = [];
        for (let i = 0; i < questionBlocks.length; i += BATCH_THRESHOLD) {
          chunks.push(questionBlocks.slice(i, i + BATCH_THRESHOLD).join("\n\n"));
        }
        const results = await Promise.all(chunks.map(chunk => callAPI(buildPrewrittenPrompt(chunk, title, answerKey))));
        const allQuestions = results.flatMap(r => r.questions || []);
        const mergedQuiz = { title: results[0]?.title || title, questions: allQuestions };
        return new Response(JSON.stringify(mergedQuiz), { headers: { "Content-Type": "application/json" } });
      }
    } catch (e) {
      return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: { "Content-Type": "application/json" } });
    }
  }

  // ── Generate new questions from study material ───────────────────────────
  const easyCount = Math.round(questionCount * 0.7);
  const hardCount = questionCount - easyCount;
  const prompt = `You are an expert quiz generator. Based on the study material below, generate exactly ${questionCount} multiple choice questions (${easyCount} easy, ${hardCount} hard).

Return ONLY a valid JSON object — no markdown, no code blocks, no trailing text:
{"title":"quiz title","questions":[{"question":"...","options":["A) ...","B) ...","C) ...","D) ..."],"correctAnswer":"A) ...","explanation":"max 5 words","difficulty":"easy"}]}

Rules:
1. The language of the quiz MUST match the language of the study material (Arabic material → Arabic quiz).
2. Generate exactly ${questionCount} questions total.
3. Each question must have exactly 4 options prefixed with 'A) ', 'B) ', 'C) ', 'D) '.
4. correctAnswer must exactly match one of the options.
5. Explanations max 5 words.
6. ${easyCount} questions marked "easy", ${hardCount} marked "hard".
7. Output compact JSON with minimal whitespace.

Study material:
${text}`;

  try {
    const body = {
      model: apiModel,
      messages: [{ role: "user", content: prompt }],
      temperature: 0.7,
      max_tokens: isNvidia ? 8192 : 3500,
      response_format: { type: "json_object" }
    };
    if (isNvidia) {
      body.chat_template_kwargs = { thinking: true, reasoning_effort: "high" };
    }
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
