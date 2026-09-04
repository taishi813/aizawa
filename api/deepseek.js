
const fs = require("fs");
const path = require("path");

module.exports = async function handler(req, res) {

  /* =========================
     CORS
  ========================= */

  res.setHeader(
    "Access-Control-Allow-Origin",
    "*"
  );

  res.setHeader(
    "Access-Control-Allow-Methods",
    "POST, OPTIONS"
  );

  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type"
  );

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Method not allowed"
    });
  }

  try {

    /* =========================
       Request
    ========================= */

    const {
      history = [],
      character = "normal"
    } = req.body || {};


    /* =========================
       Character Prompt
    ========================= */

    let systemPrompt = "";

    if (character !== "normal") {

      // character はファイル名として使うので
      // 想定外の文字を除去
      const safeCharacter =
        String(character)
          .replace(/[^a-zA-Z0-9_-]/g, "");

      const promptPath = path.join(
        process.cwd(),
        `${safeCharacter}.txt`
      );

      if (fs.existsSync(promptPath)) {

        systemPrompt =
          fs.readFileSync(
            promptPath,
            "utf8"
          );
      }
    }


    /* =========================
       Messages
    ========================= */

    const messages = [];

    if (systemPrompt) {

      messages.push({
        role: "system",
        content: systemPrompt
      });
    }

    // フロントから来たhistoryを検証
    if (Array.isArray(history)) {

      for (const msg of history) {

        if (!msg) continue;

        const role = msg.role;
        const content = msg.content;

        // Chat Completionsで許可するroleのみ
        if (
          role !== "user" &&
          role !== "assistant"
        ) {
          continue;
        }

        if (
          typeof content !== "string" ||
          content.trim() === ""
        ) {
          continue;
        }

        messages.push({
          role,
          content
        });
      }
    }


    /* =========================
       DeepSeek API
    ========================= */

    const response = await fetch(
      "https://api.deepseek.com/chat/completions",
      {
        method: "POST",

        headers: {
          "Content-Type": "application/json",

          "Authorization":
            `Bearer ${process.env.DEEPSEEK_API_KEY}`
        },

        body: JSON.stringify({

          // 現行V4 Pro
          model: "deepseek-v4-pro",

          messages,

          // キャラチャットではthinkingをOFF
          // → 応答速度と安定性を優先
          extra_body: {
            thinking: {
              type: "disabled"
            }
          },

          // thinking OFFなのでtemperature使用可能
          temperature: 0.9,

          // 1500 → 2000 に少し余裕を持たせる
          max_tokens: 2000
        })
      }
    );


    /* =========================
       DeepSeek Response
    ========================= */

    let data;

    try {

      data = await response.json();

    } catch (jsonErr) {

      console.error(
        "DeepSeek JSON parse error:",
        jsonErr
      );

      return res.status(502).json({
        error: "DeepSeekから不正なレスポンスが返されました"
      });
    }


    /* =========================
       API Error
    ========================= */

    if (!response.ok) {

      console.error(
        "DeepSeek API Error:",
        JSON.stringify(data, null, 2)
      );

      return res.status(500).json({

        error:
          data?.error?.message ||
          `DeepSeek API Error (${response.status})`
      });
    }


    /* =========================
       Extract Response
    ========================= */

    const choice =
      data?.choices?.[0];

    const message =
      choice?.message;

    const finishReason =
      choice?.finish_reason;

    const content =
      message?.content;


    /* =========================
       Debug Log
    ========================= */

    console.log(
      "DeepSeek:",
      JSON.stringify({
        model: data?.model,
        finish_reason: finishReason,
        content_length:
          typeof content === "string"
            ? content.length
            : null,
        usage: data?.usage
      })
    );


    /* =========================
       Empty Response Handling
    ========================= */

    if (
      typeof content !== "string" ||
      content.trim() === ""
    ) {

      console.error(
        "DeepSeek returned empty content:",
        JSON.stringify({
          finish_reason: finishReason,
          message,
          usage: data?.usage
        }, null, 2)
      );

      let errorMessage =
        "DeepSeekから返答がありませんでした";

      if (finishReason === "length") {

        errorMessage =
          "DeepSeekの生成上限に達しました";

      } else if (
        finishReason === "content_filter"
      ) {

        errorMessage =
          "DeepSeekのコンテンツフィルターにより返答できませんでした";

      } else if (
        finishReason === "insufficient_system_resource"
      ) {

        errorMessage =
          "DeepSeek側の推論リソース不足で処理が中断されました";
      }

      /*
       * フロントは data.reply を表示する仕様なので、
       * ここでは従来どおりreplyとして返す。
       */
      return res.status(200).json({
        reply: errorMessage
      });
    }


    /* =========================
       Final Reply
    ========================= */

    const reply =
      content.trim();


    /* =========================
       Supabase 保存
    ========================= */

    try {

      const latestUserMessage =
        Array.isArray(history) &&
        history.length > 0
          ? history[history.length - 1]?.content || ""
          : "";

      // Supabase環境変数がない場合は
      // 保存処理自体をスキップ
      if (
        process.env.SUPABASE_URL &&
        process.env.SUPABASE_ANON_KEY
      ) {

        await fetch(

          process.env.SUPABASE_URL +
          "/rest/v1/chat_logs",

          {
            method: "POST",

            headers: {

              "Content-Type":
                "application/json",

              "apikey":
                process.env.SUPABASE_ANON_KEY,

              "Authorization":
                `Bearer ${process.env.SUPABASE_ANON_KEY}`,

              "Prefer":
                "return=minimal"
            },

            body: JSON.stringify({

              character,

              user_message:
                latestUserMessage,

              ai_message:
                reply
            })
          }
        );
      }

    } catch (dbErr) {

      // DB保存失敗でチャットまで失敗させない
      console.error(
        "Supabase保存失敗:",
        dbErr
      );
    }


    /* =========================
       Return
    ========================= */

    return res.status(200).json({
      reply
    });


  } catch (err) {

    console.error(
      "Server Error:",
      err
    );

    return res.status(500).json({

      error:
        err?.message ||
        "Server Error"
    });
  }
};
```
