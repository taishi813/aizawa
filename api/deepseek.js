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

  const apiKey =
    process.env.DEEPSEEK_API_KEY;

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


  /* =========================================================
     検索用テキストを作る
     
     最新のユーザー発言を優先し、
     必要に応じて直近の会話も検索材料にする。
  ========================================================= */

  function getSearchText(){

    const parts = [];


    /*
     * 直近3件のユーザー発言
     */

    for(
      let i = history.length - 1;
      i >= 0 && parts.length < 3;
      i--
    ){

      const message =
        history[i];


      if(
        message &&
        message.role === "user" &&
        typeof message.content === "string"
      ){

        parts.unshift(
          message.content
        );

      }

    }


    /*
     * ユーザー発言がなければ
     * 直近4件の会話を使用
     */

    if(parts.length === 0){

      for(
        let i = Math.max(
          0,
          history.length - 4
        );
        i < history.length;
        i++
      ){

        const message =
          history[i];


        if(
          message &&
          typeof message.content === "string"
        ){

          parts.push(
            message.content
          );

        }

      }

    }


    return parts.join(" ");

  }


  /* =========================================================
     日本語向け検索トークン生成
  ========================================================= */

  function tokenize(text){

    if(!text){
      return [];
    }


    const normalized =
      text
        .toLowerCase()
        .replace(
          /、。！？「」『』（）()［］\[\]【】,.!?]/g,
          " "
        );


    const tokens = [];


    /* =========================
       英数字
    ========================= */

    const latinMatches =
      normalized.match(
        /[a-z0-9][a-z0-9_-]*/g
      ) || [];


    latinMatches.forEach(word => {

      if(word.length >= 2){

        tokens.push(word);

      }

    });


    /* =========================
       漢字
    ========================= */

    const kanjiMatches =
      normalized.match(
        /[\u3400-\u4dbf\u4e00-\u9fff]{2,}/g
      ) || [];


    kanjiMatches.forEach(word => {

      tokens.push(word);


      /*
       * 長い漢字語は2文字単位にも分解
       */

      if(word.length >= 3){

        for(
          let i = 0;
          i <= word.length - 2;
          i++
        ){

          tokens.push(
            word.slice(i, i + 2)
          );

        }

      }

    });


    /* =========================
       ひらがな
    ========================= */

    const hiraganaMatches =
      normalized.match(
        /[\u3040-\u309f]{2,}/g
      ) || [];


    const ignoredHiragana = [

      "する",
      "した",
      "して",
      "いる",
      "ある",
      "なる",
      "なっ",
      "です",
      "ます",
      "だった",
      "これ",
      "それ",
      "あれ",
      "ここ",
      "そこ",
      "もの",
      "こと",
      "よう"

    ];


    hiraganaMatches.forEach(word => {

      if(
        !ignoredHiragana.includes(word)
      ){

        tokens.push(word);

      }

    });


    /* =========================
       カタカナ
    ========================= */

    const katakanaMatches =
      normalized.match(
        /[\u30a0-\u30ff]{2,}/g
      ) || [];


    katakanaMatches.forEach(word => {

      tokens.push(word);

    });


    /* =========================
       重複削除
    ========================= */

    return [
      ...new Set(tokens)
    ];

  }


  /* =========================================================
     検索テキスト
  ========================================================= */

  const searchText =
    getSearchText();


  const searchTokens =
    tokenize(searchText);


  /* =========================================================
     現在のキャラクター
     
     現在のキャラクターだけに
     絞るためには使わない。
     
     関連度を少し上げるためだけに使う。
  ========================================================= */

  const characterToken =
    String(character)
      .toLowerCase();


  /* =========================================================
     新しい歴史を少し優先
  ========================================================= */

  function recencyScore(item){

    if(
      !item ||
      !item.date
    ){

      return 0;

    }


    const timestamp =
      new Date(item.date)
        .getTime();


    if(Number.isNaN(timestamp)){

      return 0;

    }


    const now =
      Date.now();


    const days =
      Math.max(
        0,
        (now - timestamp) /
        (1000 * 60 * 60 * 24)
      );


    /*
     * 最大15点。
     *
     * 新しい記録ほど少し優先する。
     */

    return Math.max(
      0,
      15 - days * 0.05
    );

  }


  /* =========================================================
     歴史1件の関連度を計算
     
     対象：
     character
     location
     event
     summary
  ========================================================= */

  function calculateRelevance(item){

    if(
      !item ||
      typeof item !== "object"
    ){

      return 0;

    }


    const itemCharacter =
      String(
        item.character || ""
      ).toLowerCase();


    const itemLocation =
      String(
        item.location || ""
      ).toLowerCase();


    const itemEvent =
      String(
        item.event || ""
      ).toLowerCase();


    const itemSummary =
      String(
        item.summary || ""
      ).toLowerCase();


    const searchableText =
      `${itemCharacter} ${itemLocation} ${itemEvent} ${itemSummary}`;


    let score = 0;


    /* =========================
       現在のキャラクター
       
       あくまで少し優先。
       他キャラクターは排除しない。
    ========================= */

    if(
      characterToken &&
      itemCharacter.includes(
        characterToken
      )
    ){

      score += 8;

    }


    /* =========================
       キーワード一致
    ========================= */

    searchTokens.forEach(token => {

      if(!token){
        return;
      }


      /*
       * 出来事タイトル
       */

      if(
        itemEvent.includes(token)
      ){

        score += 10;

      }


      /*
       * 内容
       */

      if(
        itemSummary.includes(token)
      ){

        score += 7;

      }


      /*
       * 場所
       */

      if(
        itemLocation.includes(token)
      ){

        score += 7;

      }


      /*
       * キャラクター名
       */

      if(
        itemCharacter.includes(token)
      ){

        score += 5;

      }

    });


    /* =========================
       検索文そのものとの一致
    ========================= */

    if(
      searchText &&
      searchableText.includes(
        searchText.toLowerCase()
      )
    ){

      score += 20;

    }


    /* =========================
       新しさ
    ========================= */

    score +=
      recencyScore(item);


    return score;

  }


  /* =========================================================
     関連する歴史だけを抽出
     
     最大10件。
  ========================================================= */

  let relevantHistory = [];


  if(
    historicalMemory.length > 0
  ){

    relevantHistory =

      historicalMemory

        .map(item => {

          return {

            item:item,

            score:
              calculateRelevance(item)

          };

        })

        .filter(result => {

          return result.score > 0;

        })

        .sort((a, b) => {

          return b.score - a.score;

        })

        .slice(0, 10)

        .map(result => {

          return result.item;

        });

  }


  /* =========================================================
     SYSTEM PROMPT
  ========================================================= */

  let systemPrompt =
    clientPrompt;


  /*
   * フロントからプロンプトが
   * 渡されなかった場合は
   * キャラクター.txt を読む。
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


      if(
        fs.existsSync(promptPath)
      ){

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


  /* =========================================================
     MESSAGES
  ========================================================= */

  const messages = [];


  /* =========================
     CHARACTER PROMPT
  ========================= */

  if(systemPrompt){

    messages.push({

      role:"system",

      content:systemPrompt

    });

  }


  /* =========================================================
     関連歴史
  ========================================================= */

  if(
    relevantHistory.length > 0
  ){

    let historyText =
      "【大志との過去の歴史：今回の会話に関連する可能性が高い記録】\n\n";


    relevantHistory.forEach(item => {

      historyText +=
        `日付: ${item.date || ""}\n`;

      historyText +=
        `相手: ${item.character || ""}\n`;

      historyText +=
        `場所: ${item.location || ""}\n`;

      historyText +=
        `出来事: ${item.event || ""}\n`;

      historyText +=
        `内容: ${item.summary || ""}\n\n`;

    });


    historyText +=
      "この記録は、大志とこの世界のキャラクターたちとの過去の出来事です。\n" +
      "現在会話しているキャラクターだけでなく、他のキャラクターと大志との出来事も参照できます。\n" +
      "今回の会話に関連する場合は、他のキャラクターとの過去について自然に言及したり質問したりできます。\n" +
      "ただし、他のキャラクターが経験した出来事を、現在会話している自分自身が直接経験したことのようには扱わないでください。\n" +
      "他のキャラクターと大志との出来事を知っている場合でも、それを自然な形で知識として扱ってください。\n" +
      "記録にない出来事を、記録されている事実として勝手に作らないでください。\n" +
      "今回の会話に関係する可能性が高い記録だけが選ばれています。";


    messages.push({

      role:"system",

      content:historyText

    });

  }


  /* =========================================================
     CHAT HISTORY
  ========================================================= */

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


    /* =========================
       最後のユーザーメッセージ
       + 画像
    ========================= */

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


  /* =========================================================
     IMAGE ONLY REQUEST
  ========================================================= */

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


  /* =========================================================
     DEEPSEEK REQUEST BODY
  ========================================================= */

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


  /* =========================================================
     API OPTIONS
  ========================================================= */

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


  /* =========================================================
     LOG
  ========================================================= */

  console.log(
    "DeepSeek request start"
  );

  console.log(
    "Character:",
    character
  );

  console.log(
    "Historical memory total:",
    historicalMemory.length
  );

  console.log(
    "Relevant historical memory:",
    relevantHistory.length
  );

  console.log(
    "Search tokens:",
    searchTokens.length
  );

  console.log(
    "Image attached:",
    Boolean(image)
  );


  /* =========================================================
     REQUEST
  ========================================================= */

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
               JSON PARSE
            ========================= */

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


  /* =========================================================
     REQUEST ERROR
  ========================================================= */

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


  /* =========================================================
     SEND REQUEST
  ========================================================= */

  request.write(
    requestBody
  );

  request.end();

};