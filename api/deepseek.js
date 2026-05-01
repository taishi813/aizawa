import fs from "fs";
import path from "path";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  try {
    const { history } = req.body;

    const apiKey = process.env.DEEPSEEK_API_KEY;

    if (!apiKey) {
      return res.status(500).json({
        error: "DEEPSEEK_API_KEY が設定されていません"
      });
    }

    // 🔥 txt読み込み
    const filePath = path.join(process.cwd(), "aizawa.txt");
    const systemPrompt = fs.readFileSync(filePath, "utf-8");

    // 🔥 強制ルール付与
    const strongSystem = `
${systemPrompt}

【絶対ルール】
・日本語のみ
・200〜400文字
・必ず会話を広げる
・必ず1つ質問を含める
・短文は禁止
`;

    const messages = [
      { role: "system", content: strongSystem },
      ...(history || []).slice(-4),
      { role: "system", content: "上記ルールを守ってください。" }
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
        temperature: 0.8,
        max_tokens: 500
      })
    });

    const data = await response.json();

    if (!response.ok) {
      return res.status(500).json({ error: data });
    }

    const reply =
      data?.choices?.[0]?.message?.content || "（返答なし）";

    res.status(200).json({ reply });

  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
