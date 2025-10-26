export async function onRequestPost({ request, env }) {
  const form = await request.formData();
  const file = form.get("file");

  const ocrForm = new FormData();
  ocrForm.append("file", file);
  ocrForm.append("apikey", env.OCR_API_KEY);

  const res = await fetch("https://api.ocr.space/parse/image", {
    method: "POST",
    body: ocrForm
  });

  const data = await res.json();
  const text = data.ParsedResults?.[0]?.ParsedText || "";
  return new Response(text, { headers: { "Content-Type": "text/plain" } });
}
