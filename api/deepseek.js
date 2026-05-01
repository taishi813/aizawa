export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  try {
    const { systemPrompt, history } = req.body;

    const apiKey = process.env.DEEPSEEK_API_KEY;

    if (!apiKey) {
      return res.status(500).json({
        error: "DEEPSEEK_API_KEY が設定されていません"
      });
    }

    // 🔥 system強化（ここが肝）
    const strongSystemPrompt = `
あなたは必ず以下の設定に従うAIです。

${systemPrompt}

【絶対ルール】
・日本語以外は禁止
・200〜400文字で返答する
・必ず会話を広げる
・必ず1つ質問を含める
・短文は禁止

これらのルールに違反してはいけません。
`;

    // 🔥 history制限（暴走防止）
    const trimmedHistory = (history || []).slice(-4);

    // 🔥 systemを前後に挟む（最重要）
    const messages = [
      { role: "system", content: strongSystemPrompt },
      ...trimmedHistory,
      { role: "system", content: "上記のルールを必ず守ってください。" }
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
        temperature: 0.85,
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
