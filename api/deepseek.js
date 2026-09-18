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


  /* =========================
     現在のチャット履歴
  ========================= */

  const history =
    Array.isArray(body.history)
      ? body.history
      : [];


  /* =========================
     キャラクター
  ========================= */

  const character =
    body.character || "manager";


  /* =========================
     基本プロンプト
  ========================= */

  const clientPrompt =
    typeof body.prompt === "string"
      ? body.prompt.trim()
      : "";


  /* =========================
     大志との歴史
     history.json
  ========================= */

  const historicalMemory =
    Array.isArray(body.historicalMemory)
      ? body.historicalMemory
      : [];


  /* =========================
     今回の画像
  ========================= */

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
     キャラクターに該当する歴史
  ========================= */

  const characterHistory =
    historicalMemory.filter(
      item => {

        if(!item){

          return false;

        }


        /*
         * characterが指定されていない
         * 共通イベントも残す
         */

        if(
          !item.character ||
          item.character === "all" ||
          item.character === "共通"
        ){

          return true;

        }


        /*
         * JSON側のcharacterは
         * 日本語名でも英字IDでも使えるようにする
         */

        const characterNames = {

          manager:[
            "manager",
            "ブランク"
          ],

          aizawa:[
            "aizawa",
            "相澤仁美"
          ],

          ogura:[
            "ogura",
            "小倉優香"
          ],

          harumi:[
            "harumi",
            "根本はるみ"
          ],

          wacchi:[
            "wacchi",
            "わちみなみ"
          ],

          yanase:[
            "yanase",
            "柳瀬早紀"
          ],

          ramu:[
            "ramu",
            "RaMu"
          ],

          rika:[
            "rika",
            "泉里香"
          ],

          io:[
            "io",
            "伊織いお"
          ]

        };


        const names =
          characterNames[character] ||
          [character];


        return names.includes(
          item.character
        );

      }
    );


  /* =========================
     Messages
  ========================= */

  const messages = [];


  /* =========================
     基本プロンプト
  ========================= */

  if(systemPrompt){

    messages.push({

      role:"system",

      content:systemPrompt

    });

  }


  /* =========================
     大志との歴史
  ========================= */

  if(characterHistory.length > 0){

    let historyText =
      "【大志との過去の出来事】\n\n";


    characterHistory.forEach(
      item => {

        historyText +=
          `日付: ${item.date || ""}\n`;


        historyText +=
          `出来事: ${item.event || ""}\n`;


        historyText +=
          `内容: ${item.summary || ""}\n\n`;

      }
    );


    historyText +=
      "これは過去の出来事に関する記録です。" +
      "現在の会話では、この記録をキャラクターの過去の経験として自然に参照してください。" +
      "記録にない出来事を、記録にある事実として勝手に作らないでください。";


    messages.push({

      role:"system",

      content:historyText

    });

  }


  /* =========================
     会話履歴
  ========================= */

  for(
    let i = 0;
    i < history.length;
    i++
  ){

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


  /* =========================
     画像だけ送信された場合
  ========================= */

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


  /* =========================
     デバッグ
  ========================= */

  console.log(
    "Character:",
    character
  );


  console.log(
    "Image attached:",
    Boolean(image)
  );


  console.log(
    "Historical memory:",
    historicalMemory.length
  );


  console.log(
    "Character history:",
    characterHistory.length
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