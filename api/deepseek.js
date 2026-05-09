// api/deepseek.js

const OpenAI = require("openai");
const fs = require("fs");
const path = require("path");

const client = new OpenAI({

  apiKey:
    process.env.DEEPSEEK_API_KEY,

  baseURL:
    "https://api.deepseek.com"
});

module.exports =
async function handler(req,res){

  res.setHeader(
    "Access-Control-Allow-Origin",
    "*"
  );

  res.setHeader(
    "Access-Control-Allow-Methods",
    "POST,OPTIONS"
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

      error:
        "method not allowed"
    });
  }

  try {

    const body =
      req.body || {};

    const history =
      body.history || [];

    const character =
      body.character || "normal";

    let systemPrompt = "";

    if(character !== "normal"){

      const promptPath =
        path.join(
          process.cwd(),
          character + ".txt"
        );

      if(fs.existsSync(promptPath)){

        systemPrompt =
          fs.readFileSync(
            promptPath,
            "utf8"
          );
      }
    }

    const messages = [];

    if(systemPrompt){

      messages.push({

        role:"system",

        content:systemPrompt
      });
    }

    for(const msg of history){

      messages.push({

        role:msg.role,

        content:msg.content
      });
    }

    const completion =
      await client.chat.completions.create({

        model:"deepseek-chat",

        messages,

        temperature:0.9,

        max_tokens:500
      });

    const reply =
      completion
      .choices?.[0]
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
        String(err.message || err)
    });
  }
};