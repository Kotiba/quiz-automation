export async function onRequestPost({ request, env }) {
  const quiz = await request.json();

  const res = await fetch(env.FORM_SCRIPT_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(quiz)
  });

  if (!res.ok) {
    const errText = await res.text();
    return new Response(`Form creation error: ${errText}`, { status: 500 });
  }

  const formUrl = await res.text();
  return new Response(JSON.stringify({ formUrl }), { headers: { "Content-Type": "application/json" } });
}
