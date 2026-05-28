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
    ? `You are an expert quiz formatter. The text below contains a pre-written quiz with questions, options, and an answer key at the end. Your task is to extract ALL questions, options, and correct answers, and format them into a valid JSON object.

Return ONLY a valid JSON object — no markdown, no code blocks, no trailing text:
{
  "title": "A descriptive quiz title in the same language as the questions",
  "questions": [
    {
      "question": "Question text",
      "options": ["A) Option 1", "B) Option 2"],
      "correctAnswer": "A) Option 1",
      "explanation": "Brief explanation of the correct answer (in the same language as the quiz).",
      "difficulty": "easy"
    }
  ]
}

Rules:
1. **Language Preservation**: You MUST keep the language of the title, questions, options, and explanations exactly as in the input text (e.g., if the questions are in Arabic, the JSON output must be in Arabic). Do NOT translate any content.
2. **True/False Questions**: For True/False questions (e.g., صح أم خطأ), the options array must contain exactly two options: 'A) صح' and 'B) خطأ' (or their equivalents in the source language, like 'A) True' and 'B) False'). Do not generate dummy options.
3. **Multiple Choice Options**: For multiple choice questions, prefix options in the array with 'A) ', 'B) ', 'C) ', 'D) '. If the input text uses letters like 'أ', 'ب', 'ج', 'د', map them to 'A) ', 'B) ', 'C) ', 'D) ' respectively (i.e. 'أ' -> 'A', 'ب' -> 'B', 'ج' -> 'C', 'د' -> 'D').
4. **Correct Answer**: Set 'correctAnswer' to the exact string of the correct option (including the 'A) ' or 'B) ' etc. prefix).
5. **Answer Key Parsing**: Find the answer key/table at the end of the text (e.g., '📋 إجابات الاختبار الأول' or similar). Use it to determine the correct answer for each question. Map 'صح' to 'A) صح', 'خطأ' to 'B) خطأ', and letters like 'أ', 'ب', 'ج', 'د' to their mapped options 'A) ', 'B) ', 'C) ', 'D) '.
6. **No Truncation**: Extract and format EVERY SINGLE question in the text. Do not skip or omit any question. If there are 60 questions, extract all 60.
7. **Brief Explanations**: Keep explanations extremely brief (maximum 5 words) to save tokens and fit under rate limits.
8. **Difficulty**: Set difficulty to "easy" or "hard" based on the question context.
9. **Compact Output**: Output the JSON in a compact form with minimal whitespace to minimize token usage.

Questions to format:
${text}`
    : `You are an expert quiz generator. Based on the study material below, generate exactly ${questionCount} multiple choice questions (${easyCount} easy, ${hardCount} hard).

Return ONLY a valid JSON object — no markdown, no code blocks, no trailing text:
{
  "title": "A descriptive quiz title based on the topic",
  "questions": [
    {
      "question": "Question text",
      "options": ["A) Option 1", "B) Option 2", "C) Option 3", "D) Option 4"],
      "correctAnswer": "A) Option 1",
      "explanation": "Brief explanation of why this answer is correct.",
      "difficulty": "easy"
    }
  ]
}

Rules:
1. **Language Preservation**: The language of the quiz (title, questions, options, explanations) MUST match the language of the study material (e.g., if the study material is in Arabic, the generated quiz must be in Arabic). Do NOT translate the material or write the quiz in English unless the study material is in English.
2. **Question Count**: Generate exactly ${questionCount} questions total.
3. **Multiple Choice Options**: Each question must have exactly 4 options prefixed with 'A) ', 'B) ', 'C) ', 'D) '.
4. **Correct Answer**: Set 'correctAnswer' to the exact string of the correct option (including the prefix).
5. **Brief Explanations**: Keep explanations extremely brief (maximum 5 words).
6. **Difficulty**: Ensure exactly ${easyCount} questions are marked "easy" and ${hardCount} are marked "hard".
7. **Compact Output**: Output the JSON in a compact form with minimal whitespace to minimize token usage.

Study material:
${text}`;




  const isNvidia = GROQ_API_KEY.startsWith("nvapi-");
  const apiUrl = isNvidia 
    ? "https://integrate.api.nvidia.com/v1/chat/completions" 
    : "https://api.groq.com/openai/v1/chat/completions";
  const apiModel = isNvidia 
    ? "deepseek-ai/deepseek-v4-flash" 
    : "llama-3.3-70b-versatile";

  const requestBody = {
    model: apiModel,
    messages: [{ role: "user", content: prompt }],
    temperature: 0.7,
    max_tokens: isNvidia ? 8192 : 3500,
    response_format: { type: "json_object" }
  };

  if (isNvidia) {
    requestBody.chat_template_kwargs = { thinking: !prewritten };
    if (!prewritten) {
      requestBody.chat_template_kwargs.reasoning_effort = "high";
    }
  }

  const res = await fetch(apiUrl, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${GROQ_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(requestBody)
  });

  if (!res.ok) {
    const err = await res.text();
    return new Response(JSON.stringify({ error: `API error: ${err}` }), { status: 500, headers: { "Content-Type": "application/json" } });
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
