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

    /* =======================
       ログ保存
    ======================= */

    try {

      const logPath = path.join(
        process.cwd(),
        "kakolog.txt"
      );

      const now = new Date();

      const time =
        now.getFullYear() + "-" +
        String(now.getMonth()+1).padStart(2,"0") + "-" +
        String(now.getDate()).padStart(2,"0") + " " +
        String(now.getHours()).padStart(2,"0") + ":" +
        String(now.getMinutes()).padStart(2,"0") + ":" +
        String(now.getSeconds()).padStart(2,"0");

      const latestUserMessage =
        history[history.length - 1]
        ?.content || "";

      const logText =

`\n========================================
[${time}]
character: ${character}

【USER】
${latestUserMessage}

【AI】
${reply}

`;

      fs.appendFileSync(
        logPath,
        logText,
        "utf8"
      );

    } catch(logErr){

      console.error(
        "ログ保存失敗:",
        logErr
      );
    }

    /* return */

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