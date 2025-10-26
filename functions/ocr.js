export async function onRequestPost({ request, env }) {
  const form = await request.formData();
  const file = form.get("file");

  if (!file) return new Response("No file uploaded", { status: 400 });

  // Log file info for debugging
  console.log("File name:", file.name, "size:", file.size);

  const ocrForm = new FormData();
  ocrForm.append("file", file);
  ocrForm.append("apikey", env.OCR_API_KEY);

  const res = await fetch("https://api.ocr.space/parse/image", {
    method: "POST",
    body: ocrForm
  });

  const data = await res.json();
  console.log("OCR.space response:", data);

  return new Response(JSON.stringify(data, null, 2), { headers: { "Content-Type": "application/json" } });
}
