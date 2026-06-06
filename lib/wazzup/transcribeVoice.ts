export async function transcribeVoice(
  mediaUrl: string,
  accessToken: string
): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY not set");

  // Download audio from Wazzup CDN (requires Bearer token)
  const audioRes = await fetch(mediaUrl, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!audioRes.ok) {
    throw new Error(`Failed to download audio [${audioRes.status}]`);
  }

  const audioBuffer = await audioRes.arrayBuffer();
  const contentType = audioRes.headers.get("content-type") ?? "audio/ogg";
  const ext = contentType.includes("mp4") ? "mp4"
    : contentType.includes("mpeg") || contentType.includes("mp3") ? "mp3"
    : contentType.includes("wav") ? "wav"
    : "ogg";

  const formData = new FormData();
  formData.append("file", new Blob([audioBuffer], { type: contentType }), `audio.${ext}`);
  formData.append("model", "whisper-1");
  formData.append("language", "ru");
  formData.append("response_format", "text");

  const whisperRes = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: formData,
  });

  if (!whisperRes.ok) {
    const body = await whisperRes.text().catch(() => "");
    throw new Error(`Whisper API error [${whisperRes.status}]: ${body}`);
  }

  return (await whisperRes.text()).trim();
}
