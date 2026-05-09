const OpenAI = require("openai");
const fs = require("fs");
const path = require("path");

const client = new OpenAI({
  apiKey: process.env.DEEPSEEK_API_KEY,
  baseURL: "https://api.deepseek.com"
});

module.exports = async function handler(req, res){

  /* CORS */
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

  if(req.method === "OPTIONS"){
    return res.status(200).end();
  }

  if(req.method !== "POST"){

    return res.status(405).json({
      error:"Method not allowed"
    });
  }

  try {

    const {
      history = [],
      character = "normal",
      image = null
    } = req.body || {};

    /* キャラプロンプト */
    let systemPrompt = "";

    if(character !== "normal"){

      const promptPath = path.join(
        process.cwd(),
        `${character}.txt`
      );

      if(fs.existsSync(promptPath)){

        systemPrompt =
          fs.readFileSync(
            promptPath,
            "utf8"
          );
      }
    }

    /* メッセージ生成 */
    const messages = [];

    /* システム */
    if(systemPrompt){

      messages.push({
        role:"system",
        content:systemPrompt
      });
    }

    /* 会話履歴 */
    for(const msg of history){

      if(msg.image){

        messages.push({
          role: msg.role,
          content: [
            {
              type:"text",
              text: msg.content || ""
            },
            {
              type:"image_url",
              image_url:{
                url: msg.image
              }
            }
          ]
        });

      } else {

        messages.push({
          role: msg.role,
          content: msg.content || ""
        });
      }
    }

    /* API */
    const completion =
      await client.chat.completions.create({

        model:"deepseek-chat",

        messages,

        temperature:0.9,

        max_tokens:700
      });

    const reply =
      completion.choices?.[0]
      ?.message
      ?.content || "返答なし";

    return res.status(200).json({
      reply
    });

  } catch(err){

    console.error(err);

    return res.status(500).json({

      error:
        err?.message ||
        "Server error"
    });
  }
};