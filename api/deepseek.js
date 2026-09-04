
const fs = require("fs");
const path = require("path");

module.exports = async function handler(req, res) {

  /* =========================
     CORS
  =========================te */

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

      const promptPath = path.join(
        process.cwd(),
        `${character}.txt`
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

    for (const msg of history) {

      if (
        !msg ||
        !["user", "assistant"].includes(msg.role) ||
        typeof msg.content !== "string"
      ) {
        continue;
      }

      messages.push({
        role: msg.role,
        content: msg.content
      });
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

          model: "deepseek-v4-pro",

          messages,

          /*
           * ここ重要。
           * fetchで直接APIを叩いているので
           * thinkingはトップレベル。
           */
          thinking: {
            type: "disabled"
          },

          temperature: 0.9,

          max_tokens: 2000
        })
      }
    );


    /* =========================
       Response JSON
    ========================= */

    const data =
      await response.json();


    /* =========================
       DeepSeek API Error
    ========================= */

    if (!response.ok) {

      console.error(
        "DeepSeek API Error:",
        JSON.stringify(data, null, 2)
      );

      return res.status(response.status).json({

        error:
          data?.error?.message ||
          "DeepSeek API Error"
      });
    }


    /* =========================
       Response
    ========================= */

    const choice =
      data?.choices?.[0];

    const message =
      choice?.message;

    const reply =
      message?.content;

    console.log(
      "DeepSeek:",
      JSON.stringify({
        model: data?.model,
        finish_reason: choice?.finish_reason,
        content_length:
          typeof reply === "string"
            ? reply.length
            : null,
        usage: data?.usage
      })
    );


    /* =========================
       Empty Reply
    ========================= */

    if (
      typeof reply !== "string" ||
      reply.trim() === ""
    ) {

      console.error(
        "DeepSeek empty reply:",
        JSON.stringify(data, null, 2)
      );

      return res.status(200).json({

        reply:
          "DeepSeekから返答がありませんでした"
      });
    }


    /* =========================
       Supabase
    ========================= */

    try {

      const latestUserMessage =
        history[history.length - 1]
          ?.content || "";

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

      console.error(
        "Supabase保存失敗:",
        dbErr
      );
    }


    /* =========================
       Return
    ========================= */

    return res.status(200).json({
      reply: reply.trim()
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
