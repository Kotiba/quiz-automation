export async function onRequestPost({ request, env }) {
  const quiz = await request.json();

  const SCRIPT_URL = env.FORM_SCRIPT_URL || "https://script.google.com/macros/s/AKfycbxq5adeWwp2qqM2mkkntqy7OssX7JCsVNsJcIzZb9iud4MPuvTyxr8ii__As1F2B9zz/exec";

  const res = await fetch(SCRIPT_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(quiz)
  });

  if (!res.ok) {
    const errText = await res.text();
    return new Response(`Form creation error: ${errText}`, { status: 500 });
  }

  // Apps Script returns a JSON object, not plain text
  const data = await res.json();

  if (data.error) {
    return new Response(`Form creation error: ${data.error}`, { status: 500 });
  }

  const formUrl = data.formUrl;
  const editUrl = data.editUrl;
  const questionCount = data.questionCount;

  return new Response(
    JSON.stringify({ formUrl, editUrl, questionCount }),
    { headers: { "Content-Type": "application/json" } }
  );
}
