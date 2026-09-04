
const https = require("https");

module.exports = function handler(req, res) {

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


  /* OPTIONS */

  if(req.method === "OPTIONS"){
    res.status(200).end();
    return;
  }


  /* POST only */

  if(req.method !== "POST"){

    res.status(405).json({
      error:"Method not allowed"
    });

    return;
  }


  /* API key */

  const apiKey =
    process.env.DEEPSEEK_API_KEY;


  if(!apiKey){

    res.status(500).json({
      error:"DEEPSEEK_API_KEY が設定されていません"
    });

    return;
  }


  /* Request body */

  const body =
    req.body || {};


  const history =
    Array.isArray(body.history)
      ? body.history
      : [];


  const character =
    body.character || "manager";


  /* キャラクター用TXT */

  const fs =
    require("fs");

  const path =
    require("path");


  let systemPrompt = "";


  try{

    const promptPath =
      path.join(
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

  }catch(err){

    console.error(
      "キャラクターファイル読み込みエラー:",
      err
    );

  }


  /* Messages */

  const messages = [];


  if(systemPrompt){

    messages.push({
      role:"system",
      content:systemPrompt
    });

  }


  for(const message of history){

    if(
      !message ||
      typeof message.content !== "string"
    ){

      continue;

    }


    if(
      message.role !== "user" &&
      message.role !== "assistant"
    ){

      continue;

    }


    messages.push({

      role:message.role,

      content:message.content

    });

  }


  /* DeepSeek request */

  const requestBody =
    JSON.stringify({

      model:"deepseek-v4-pro",

      messages:messages,

      thinking:{
        type:"disabled"
      },

      temperature:0.9,

      max_tokens:1500

    });


  const options = {

    hostname:"api.deepseek.com",

    path:"/chat/completions",

    method:"POST",

    headers:{

      "Content-Type":
        "application/json",

      "Authorization":
        `Bearer ${apiKey}`,

      "Content-Length":
        Buffer.byteLength(
          requestBody
        )

    }

  };


  console.log(
    "DeepSeek request start"
  );


  const request =
    https.request(
      options,
      response => {

        let raw = "";


        response.on(
          "data",
          chunk => {

            raw += chunk;

          }
        );


        response.on(
          "end",
          () => {

            console.log(
              "DeepSeek status:",
              response.statusCode
            );


            console.log(
              "DeepSeek response:",
              raw
            );


            let data;


            try{

              data =
                JSON.parse(raw);

            }catch(err){

              res.status(502).json({

                error:
                  "DeepSeekから正常なJSONが返ってきませんでした"

              });

              return;

            }


            /* DeepSeek API error */

            if(
              response.statusCode < 200 ||
              response.statusCode >= 300
            ){

              res.status(
                response.statusCode
              ).json({

                error:
                  data?.error?.message ||
                  "DeepSeek API Error"

              });

              return;

            }


            /* Reply */

            const reply =
              data
                ?.choices?.[0]
                ?.message?.content;


            if(
              typeof reply !== "string" ||
              reply.trim() === ""
            ){

              res.status(200).json({

                reply:
                  "DeepSeekから返答がありませんでした"

              });

              return;

            }


            /* Success */

            res.status(200).json({

              reply:
                reply.trim()

            });

          }
        );


      }
    );


  /* Request error */

  request.on(
    "error",
    err => {

      console.error(
        "DeepSeek request error:",
        err
      );


      if(!res.headersSent){

        res.status(500).json({

          error:
            "DeepSeekへの接続に失敗しました"

        });

      }

    }
  );


  /* Send */

  request.write(
    requestBody
  );


  request.end();

};
```
