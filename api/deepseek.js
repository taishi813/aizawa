
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

    console.log("DeepSeek request start");

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

          model:"deepseek-v4-pro",

          messages,

          /*
           * V4 Pro
           * thinking OFF
           */
          thinking:{
            type:"disabled"
          },

          temperature:0.9,

          max_tokens:1500
        })
      }
    );

    console.log(
      "DeepSeek HTTP status:",
      response.status
    );


    /* DeepSeek response */

    const raw =
      await response.text();

    console.log(
      "DeepSeek raw response:",
      raw
    );


    let data;

    try {

      data = JSON.parse(raw);

    } catch(parseError){

      console.error(
        "DeepSeek JSON parse error:",
        parseError
      );

      return res.status(502).json({
        error:
          "DeepSeekのレスポンスを解析できませんでした"
      });
    }


    /* API error */

    if(!response.ok){

      console.error(
        "DeepSeek API Error:",
        data
      );

      return res.status(response.status).json({

        error:
          data?.error?.message ||
          "DeepSeek API Error"
      });
    }


    /* reply */

    const reply =
      data?.choices?.[0]
      ?.message
      ?.content;


    console.log(
      "DeepSeek finish:",
      data?.choices?.[0]?.finish_reason
    );


    if(
      typeof reply !== "string" ||
      reply.trim() === ""
    ){

      return res.status(200).json({
        reply:"DeepSeekから返答がありませんでした"
      });
    }


    /* Supabase */

    try {

      const latestUserMessage =
        history[history.length - 1]
        ?.content || "";

      await fetch(

        process.env.SUPABASE_URL +
        "/rest/v1/chat_logs",

        {
          method:"POST",

          headers:{

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

    } catch(dbErr){

      console.error(
        "Supabase保存失敗",
        dbErr
      );
    }


    return res.status(200).json({
      reply:reply.trim()
    });


  } catch(err){

    console.error(
      "SERVER ERROR:",
      err
    );

    return res.status(500).json({

      error:
        err.message ||
        "Server Error"
    });
  }
};
```
