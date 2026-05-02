import fs from "fs";
import path from "path";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  try {
    const { history, character } = req.body;

    const apiKey = process.env.DEEPSEEK_API_KEY;

    const fileName = character || "aizawa";
    const filePath = path.join(process.cwd(), `${fileName}.txt`);

    const systemPrompt = fs.readFileSync(filePath, "utf-8");

    const strongSystem = `
${systemPrompt}

【絶対ルール】
・日本語
・200〜400文字
・必ず会話を広げる
・必ず質問を含める
`;

    const messages = [
      { role: "system", content: strongSystem },
      ...(history || []).slice(-4),
      { role: "system", content: "必ず守ること" }
    ];

    const response = await fetch("https://api.deepseek.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: "deepseek-chat",
        messages,
        temperature: 0.8
      })
    });

    const data = await response.json();

    const reply = data?.choices?.[0]?.message?.content || "";

    res.status(200).json({ reply });

  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
