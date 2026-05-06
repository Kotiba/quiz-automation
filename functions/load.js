// GET /load?id=quiz-slug-abc123 — retrieves a quiz from KV
export async function onRequest({ request, env }) {
  if (request.method !== "GET") return new Response("Method not allowed", { status: 405 });

  if (!env.QUIZZES) {
    return new Response(JSON.stringify({ error: "KV not configured." }), {
      status: 500, headers: { "Content-Type": "application/json" }
    });
  }

  const id = new URL(request.url).searchParams.get("id");
  if (!id) return new Response(JSON.stringify({ error: "Missing id" }), { status: 400, headers: { "Content-Type": "application/json" } });

  const data = await env.QUIZZES.get(id);
  if (!data) return new Response(JSON.stringify({ error: "Quiz not found or expired" }), { status: 404, headers: { "Content-Type": "application/json" } });

  return new Response(data, { headers: { "Content-Type": "application/json" } });
}
