const https = require("https");

module.exports = function handler(req, res) {

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


  /* =========================
     OPTIONS
  ========================= */

  if(req.method === "OPTIONS"){

    res.status(200).end();

    return;

  }


  /* =========================
     POST only
  ========================= */

  if(req.method !== "POST"){

    res.status(405).json({
      error:"Method not allowed"
    });

    return;

  }


  /* =========================
     API key
  ========================= */

  const apiKey =
    process.env.DEEPSEEK_API_KEY;


  if(!apiKey){

    res.status(500).json({
      error:
        "DEEPSEEK_API_KEY が設定されていません"
    });

    return;

  }


  /* =========================
     Request body
  ========================= */

  const body =
    req.body || {};


  const history =
    Array.isArray(body.history)
      ? body.history
      : [];


  const character =
    body.character || "manager";


  /*
   * フロント側から送られてきた
   * 編集済み基本プロンプト
   */

  const clientPrompt =
    typeof body.prompt === "string"
      ? body.prompt.trim()
      : "";


  /*
   * 今回送信する画像
   *
   * Base64 Data URL
   *
   * 例：
   * data:image/jpeg;base64,/9j/4AAQ...
   */

  const image =
    typeof body.image === "string"
      ? body.image.trim()
      : "";


  /* =========================
     System Prompt
  ========================= */

  let systemPrompt =
    clientPrompt;


  /*
   * promptが空の場合だけ
   * 従来どおりTXTから読み込む
   */

  if(!systemPrompt){

    const fs =
      require("fs");

    const path =
      require("path");


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
          ).trim();

      }

    }catch(err){

      console.error(
        "キャラクターファイル読み込みエラー:",
        err
      );

    }

  }


  /* =========================
     Messages
  ========================= */

  const messages = [];


  /*
   * 基本プロンプト
   */

  if(systemPrompt){

    messages.push({

      role:"system",

      content:systemPrompt

    });

  }


  /*
   * 会話履歴
   *
   * 画像は今回のリクエストだけに
   * 付ける。
   */

  for(let i = 0; i < history.length; i++){

    const message =
      history[i];


    if(!message){

      continue;

    }


    if(
      message.role !== "user" &&
      message.role !== "assistant"
    ){

      continue;

    }


    if(
      typeof message.content !== "string"
    ){

      continue;

    }


    /*
     * 最後のユーザーメッセージ
     * ＋画像
     */

    const isLastUserMessage =
      message.role === "user" &&
      i === history.length - 1;


    if(
      isLastUserMessage &&
      image
    ){

      messages.push({

        role:"user",

        content:[

          {
            type:"text",

            text:
              message.content ||
              "この画像を見てください。"
          },

          {
            type:"image_url",

            image_url:{
              url:image
            }

          }

        ]

      });


    }else{

      /*
       * 通常のテキストメッセージ
       */

      messages.push({

        role:message.role,

        content:message.content

      });

    }

  }


  /*
   * 画像だけ送信された場合
   *
   * HTML側では画像だけでもsendできるので、
   * historyにユーザーメッセージが存在しない
   * ケースを処理する。
   */

  if(
    image &&
    (
      history.length === 0 ||
      history[history.length - 1]?.role !== "user"
    )
  ){

    messages.push({

      role:"user",

      content:[

        {
          type:"text",

          text:
            "この画像を見てください。"
        },

        {
          type:"image_url",

          image_url:{
            url:image
          }

        }

      ]

    });

  }


  /* =========================
     DeepSeek request
  ========================= */

  const requestBody =
    JSON.stringify({

      /*
       * 画像認識対応モデル
       */

      model:"deepseek-flash",

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


  /*
   * デバッグ用
   */

  console.log(
    "Character:",
    character
  );

  console.log(
    "Image attached:",
    Boolean(image)
  );


  /* =========================
     Request
  ========================= */

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


            /* =====================
               DeepSeek API error
            ===================== */

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


            /* =====================
               Reply
            ===================== */

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


            /* =====================
               Success
            ===================== */

            res.status(200).json({

              reply:
                reply.trim()

            });

          }
        );

      }
    );


  /* =========================
     Request error
  ========================= */

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


  /* =========================
     Send
  ========================= */

  request.write(
    requestBody
  );


  request.end();

};