// POST /save — stores a quiz in KV, returns a short ID
export async function onRequest({ request, env }) {
  if (request.method !== "POST") return new Response("Method not allowed", { status: 405 });

  if (!env.QUIZZES) {
    return new Response(JSON.stringify({ error: "KV not configured. Please bind QUIZZES namespace in Cloudflare Pages dashboard." }), {
      status: 500, headers: { "Content-Type": "application/json" }
    });
  }

  const quiz = await request.json();
  if (!quiz?.questions?.length) {
    return new Response(JSON.stringify({ error: "Invalid quiz data" }), { status: 400, headers: { "Content-Type": "application/json" } });
  }

  // Generate a slug: title-based + 6 random chars
  const slug = (quiz.title || "quiz")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .substring(0, 30);
  const rand = Math.random().toString(36).substring(2, 8);
  const id = `${slug}-${rand}`;

  // Store in KV with 90-day TTL
  await env.QUIZZES.put(id, JSON.stringify(quiz), { expirationTtl: 60 * 60 * 24 * 90 });

  return new Response(JSON.stringify({ id }), { headers: { "Content-Type": "application/json" } });
}
