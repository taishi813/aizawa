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
     POST ONLY
  ========================= */

  if(req.method !== "POST"){
    res.status(405).json({
      error:"Method not allowed"
    });
    return;
  }


  /* =========================
     API KEY
  ========================= */

  const apiKey = process.env.DEEPSEEK_API_KEY;

  if(!apiKey){
    res.status(500).json({
      error:"DEEPSEEK_API_KEY が設定されていません"
    });
    return;
  }


  /* =========================
     REQUEST BODY
  ========================= */

  const body = req.body || {};


  /* =========================
     CHAT HISTORY
  ========================= */

  const history =
    Array.isArray(body.history)
      ? body.history
      : [];


  /* =========================
     CHARACTER
  ========================= */

  const character =
    body.character || "manager";


  /* =========================
     CHARACTER PROMPT
  ========================= */

  const clientPrompt =
    typeof body.prompt === "string"
      ? body.prompt.trim()
      : "";


  /* =========================
     SHARED HISTORICAL MEMORY
     
     全キャラクター共通の
     「大志との歴史」
  ========================= */

  const historicalMemory =
    Array.isArray(body.historicalMemory)
      ? body.historicalMemory
      : [];


  /* =========================
     IMAGE
  ========================= */

  const image =
    typeof body.image === "string"
      ? body.image.trim()
      : "";


  /* =========================
     SYSTEM PROMPT
  ========================= */

  let systemPrompt = clientPrompt;


  /*
   * フロント側からプロンプトが
   * 渡されなかった場合は、
   * キャラクター名.txt を読む
   */

  if(!systemPrompt){

    const fs = require("fs");
    const path = require("path");

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
     MESSAGES
  ========================= */

  const messages = [];


  /* =========================
     CHARACTER SYSTEM PROMPT
  ========================= */

  if(systemPrompt){

    messages.push({
      role:"system",
      content:systemPrompt
    });

  }


  /* =========================
     SHARED HISTORICAL MEMORY
     
     ここではキャラクターによる
     絞り込みを行わない。
     
     仁美との歴史も、
     小倉優香との歴史も、
     根本はるみとの歴史も、
     全キャラクターから参照可能。
  ========================= */

  if(historicalMemory.length > 0){

    let historyText =
      "【大志との共有された過去の歴史】\n\n";


    historicalMemory.forEach(item => {

      if(!item || typeof item !== "object"){
        return;
      }


      historyText +=
        `日付: ${item.date || ""}\n`;

      historyText +=
        `相手: ${item.character || ""}\n`;

      historyText +=
        `出来事: ${item.event || ""}\n`;

      historyText +=
        `内容: ${item.summary || ""}\n\n`;

    });


    historyText +=
      "この歴史は、大志とこの世界のキャラクターたちの間で起きた過去の出来事を記録した共有情報です。\n" +
      "現在会話しているキャラクター自身の出来事だけでなく、他のキャラクターと大志との出来事も知識として参照できます。\n" +
      "他のキャラクターと大志との出来事についても、必要に応じて自然に言及したり、質問したりできます。\n" +
      "ただし、他のキャラクターが実際に経験した出来事を、現在会話している自分自身が直接経験したことのようには扱わないでください。\n" +
      "例えば、相澤仁美と大志との出来事を小倉優香が知っている場合でも、小倉優香自身がその場にいたことにはしないでください。\n" +
      "記録に存在しない出来事を、記録されている事実として勝手に作らないでください。\n" +
      "この共有された歴史を、現在の会話に自然に活用してください。";


    messages.push({
      role:"system",
      content:historyText
    });

  }


  /* =========================
     CHAT HISTORY
  ========================= */

  for(let i = 0; i < history.length; i++){

    const message = history[i];


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
     * 最後のユーザーメッセージに
     * 画像が添付されている場合
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

      messages.push({

        role:message.role,

        content:message.content

      });

    }

  }


  /* =========================
     IMAGE ONLY REQUEST
     
     history が空、または
     最後が user ではない場合
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
          text:"この画像を見てください。"
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
     DEEPSEEK REQUEST BODY
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


  /* =========================
     DEEPSEEK API OPTIONS
  ========================= */

  const options = {

    hostname:"api.deepseek.com",

    path:"/chat/completions",

    method:"POST",

    headers:{

      "Content-Type":"application/json",

      "Authorization":
        `Bearer ${apiKey}`,

      "Content-Length":
        Buffer.byteLength(requestBody)

    }

  };


  /* =========================
     LOG
  ========================= */

  console.log(
    "DeepSeek request start"
  );

  console.log(
    "Character:",
    character
  );

  console.log(
    "Shared historical memory:",
    historicalMemory.length
  );

  console.log(
    "Image attached:",
    Boolean(image)
  );


  /* =========================
     REQUEST
  ========================= */

  const request =
    https.request(
      options,
      response => {

        let raw = "";


        /* =========================
           RESPONSE DATA
        ========================= */

        response.on(
          "data",
          chunk => {

            raw += chunk;

          }
        );


        /* =========================
           RESPONSE END
        ========================= */

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


            /* =========================
               PARSE JSON
            ========================= */

            let data;

            try{

              data = JSON.parse(raw);

            }catch(err){

              res.status(502).json({

                error:
                  "DeepSeekから正常なJSONが返ってきませんでした"

              });

              return;

            }


            /* =========================
               API ERROR
            ========================= */

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


            /* =========================
               REPLY
            ========================= */

            const reply =
              data?.choices?.[0]?.message?.content;


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


            /* =========================
               SUCCESS
            ========================= */

            res.status(200).json({

              reply:
                reply.trim()

            });

          }
        );

      }
    );


  /* =========================
     REQUEST ERROR
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
     SEND REQUEST
  ========================= */

  request.write(
    requestBody
  );

  request.end();

};