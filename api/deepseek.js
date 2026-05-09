const fs = require("fs");
const path = require("path");

module.exports = async function handler(req, res){

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
      character = "normal"
    } = req.body || {};

    /* プロンプト */

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

    /* messages */

    const messages = [];

    if(systemPrompt){

      messages.push({
        role:"system",
        content:systemPrompt
      });
    }

    for(const msg of history){

      messages.push({
        role: msg.role,
        content: msg.content
      });
    }

    /* DeepSeek API */

    const response = await fetch(
      "https://api.deepseek.com/chat/completions",
      {
        method:"POST",

        headers:{
          "Content-Type":"application/json",

          "Authorization":
            `Bearer ${process.env.DEEPSEEK_API_KEY}`
        },

        body: JSON.stringify({

          model:"deepseek-chat",

          messages,

          temperature:0.9,

          max_tokens:500
        })
      }
    );

    const data =
      await response.json();

    if(!response.ok){

      console.error(data);

      return res.status(500).json({

        error:
          data.error?.message ||
          "DeepSeek API Error"
      });
    }

    const reply =
      data.choices?.[0]
      ?.message
      ?.content ||
      "返答なし";

    return res.status(200).json({
      reply
    });

  } catch(err){

    console.error(err);

    return res.status(500).json({

      error:
        err.message ||
        "Server Error"
    });
  }
};