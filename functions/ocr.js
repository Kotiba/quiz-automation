function arrayBufferToBase64(buffer) {
  let binary = "";
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

export async function onRequest({ request, env }) {
  if (request.method !== "POST") return new Response("Method not allowed", { status: 405 });

  const GROQ_API_KEY = request.headers.get("X-Gemini-Key") || env.GROQ_API_KEY;

  if (!GROQ_API_KEY) {
    return new Response(JSON.stringify({ error: "GROQ_API_KEY not configured" }), { status: 500, headers: { "Content-Type": "application/json" } });
  }

  const form = await request.formData();
  const file = form.get("file");

  if (!file) {
    return new Response(JSON.stringify({ error: "No file uploaded" }), { status: 400, headers: { "Content-Type": "application/json" } });
  }

  const arrayBuffer = await file.arrayBuffer();
  const base64Data = arrayBufferToBase64(arrayBuffer);
  const mimeType = file.type || "image/jpeg";

  const isNvidia = GROQ_API_KEY.startsWith("nvapi-");
  const apiUrl = isNvidia 
    ? "https://integrate.api.nvidia.com/v1/chat/completions" 
    : "https://api.groq.com/openai/v1/chat/completions";
  const apiModel = isNvidia 
    ? "meta/llama-3.2-11b-vision-instruct" 
    : "meta-llama/llama-4-scout-17b-16e-instruct";

  const res = await fetch(apiUrl, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${GROQ_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: apiModel,
      messages: [{
        role: "user",
        content: [
          {
            type: "image_url",
            image_url: { url: `data:${mimeType};base64,${base64Data}` }
          },
          {
            type: "text",
            text: "Extract and return ALL text visible in this image exactly as written. Include all questions, options, answers, and any other text. Return only the raw extracted text with no commentary."
          }
        ]
      }],
      temperature: 0.1
    })
  });

  if (!res.ok) {
    const err = await res.text();
    return new Response(JSON.stringify({ error: `OCR error: ${err}` }), { status: 500, headers: { "Content-Type": "application/json" } });
  }

  const data = await res.json();
  const text = data.choices?.[0]?.message?.content || "";

  return new Response(JSON.stringify({ text }), { headers: { "Content-Type": "application/json" } });
}
