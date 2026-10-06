const https = require("https");


module.exports = function handler(req, res) {

  /*
   * =========================
   * CORS
   * =========================
   */

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


  if (req.method === "OPTIONS") {

    res.status(200).end();

    return;

  }


  if (req.method !== "POST") {

    res.status(405).json({

      error: "Method not allowed"

    });

    return;

  }


  /*
   * =========================
   * API Key
   * =========================
   */

  const apiKey =
    process.env.DEEPSEEK_API_KEY;


  if (!apiKey) {

    res.status(500).json({

      error:
        "DEEPSEEK_API_KEY が設定されていません"

    });

    return;

  }


  /*
   * =========================
   * Request body
   * =========================
   */

  const body =
    req.body || {};


  const history =
    Array.isArray(body.history)
      ? body.history
      : [];


  const character =
    body.character ||
    "manager";


  const clientPrompt =
    typeof body.prompt === "string"
      ? body.prompt.trim()
      : "";


  const historicalMemory =
    Array.isArray(
      body.historicalMemory
    )
      ? body.historicalMemory
      : [];


  const image =
    typeof body.image === "string"
      ? body.image.trim()
      : "";


  /*
   * =========================
   * 検索対象テキスト
   * =========================
   *
   * history.jsonの中から
   * 今回の会話に関連するものを
   * 探すために使う。
   */

  function getSearchText() {

    const recent =
      history
        .slice(-6);


    const userMessages =
      recent
        .filter(
          item =>
            item &&
            item.role === "user" &&
            typeof item.content ===
              "string"
        )
        .slice(-3)
        .map(
          item => item.content
        );


    if (
      userMessages.length > 0
    ) {

      return userMessages.join(
        "\n"
      );

    }


    return recent
      .map(
        item =>
          typeof item.content ===
            "string"
            ? item.content
            : ""
      )
      .join("\n");

  }


  /*
   * =========================
   * 日本語向け簡易tokenize
   * =========================
   */

  function tokenize(text) {

    if (!text) {

      return [];

    }


    const normalized =
      String(text)
        .toLowerCase()
        .replace(
          /[\s　]+/g,
          " "
        );


    const tokens = [];


    /*
     * 英数字
     */

    const latin =
      normalized.match(
        /[a-z0-9_]{2,}/g
      );


    if (latin) {

      tokens.push(
        ...latin
      );

    }


    /*
     * 漢字
     */

    const kanji =
      normalized.match(
        /[\u3400-\u9fff]{2,}/g
      );


    if (kanji) {

      tokens.push(
        ...kanji
      );

    }


    /*
     * ひらがな
     */

    const hiragana =
      normalized.match(
        /[\u3040-\u309f]{2,}/g
      );


    if (hiragana) {

      tokens.push(
        ...hiragana
      );

    }


    /*
     * カタカナ
     */

    const katakana =
      normalized.match(
        /[\u30a0-\u30ff]{2,}/g
      );


    if (katakana) {

      tokens.push(
        ...katakana
      );

    }


    return [
      ...new Set(tokens)
    ];

  }


  const searchText =
    getSearchText();


  const searchTokens =
    tokenize(
      searchText
    );


  const characterToken =
    String(character)
      .toLowerCase();


  /*
   * =========================
   * 履歴の新しさ
   * =========================
   */

  function recencyScore(item) {

    if (!item) {

      return 0;

    }


    const date =
      item.date ||
      item.created_at;


    if (!date) {

      return 0;

    }


    const timestamp =
      new Date(date)
        .getTime();


    if (
      Number.isNaN(timestamp)
    ) {

      return 0;

    }


    const age =
      Date.now() -
      timestamp;


    const days =
      age /
      (
        1000 *
        60 *
        60 *
        24
      );


    /*
     * 最大15点。
     *
     * 新しい履歴ほど高得点。
     */

    if (days <= 1) {

      return 15;

    }


    if (days <= 7) {

      return 12;

    }


    if (days <= 30) {

      return 9;

    }


    if (days <= 90) {

      return 6;

    }


    if (days <= 365) {

      return 3;

    }


    return 0;

  }


  /*
   * =========================
   * 履歴の関連度
   * =========================
   */

  function calculateRelevance(
    item
  ) {

    if (!item) {

      return 0;

    }


    const text =
      [
        item.character,
        item.location,
        item.event,
        item.summary,
        item.content
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();


    let score = 0;


    /*
     * キャラクター一致
     */

    if (
      item.character &&
      String(
        item.character
      ).toLowerCase()
        .includes(
          characterToken
        )
    ) {

      score += 20;

    }


    /*
     * token一致
     */

    for (
      const token of searchTokens
    ) {

      if (
        token &&
        text.includes(token)
      ) {

        score += 5;

      }

    }


    /*
     * 新しさ
     */

    score +=
      recencyScore(item);


    return score;

  }


  /*
   * =========================
   * 関連する歴史を抽出
   * =========================
   */

  let relevantHistory =
    historicalMemory

      .map(
        item => ({

          item,

          score:
            calculateRelevance(
              item
            )

        })
      )

      .filter(
        entry =>
          entry.score > 0
      )

      .sort(
        (a, b) =>
          b.score -
          a.score
      )

      .slice(
        0,
        10
      )

      .map(
        entry =>
          entry.item
      );


  /*
   * =========================
   * キャラクター基本設定
   * =========================
   */

  let systemPrompt =
    clientPrompt;


  /*
   * index.htmlからpromptが
   * 空の場合は、
   * ${character}.txt を読む。
   */

  if (!systemPrompt) {

    try {

      const fs =
        require("fs");

      const path =
        require("path");


      const filePath =
        path.join(
          process.cwd(),
          `${character}.txt`
        );


      if (
        fs.existsSync(
          filePath
        )
      ) {

        systemPrompt =
          fs.readFileSync(
            filePath,
            "utf8"
          ).trim();

      }

    } catch (error) {

      console.error(
        "character prompt load error:",
        error
      );

    }

  }


  /*
   * =========================
   * DeepSeek messages
   * =========================
   */

  const messages = [];


  /*
   * 基本プロンプト
   */

  if (systemPrompt) {

    messages.push({

      role: "system",

      content: systemPrompt

    });

  }


  /*
   * =========================
   * 大志との歴史
   * =========================
   */

  if (
    relevantHistory.length > 0
  ) {

    let historyText =
      "";

    relevantHistory.forEach(
      (item, index) => {

        historyText +=
          `\n【過去の出来事 ${index + 1}】\n`;

        if (item.date) {

          historyText +=
            `日付: ${item.date}\n`;

        }

        if (item.character) {

          historyText +=
            `人物: ${item.character}\n`;

        }

        if (item.location) {

          historyText +=
            `場所: ${item.location}\n`;

        }

        if (item.event) {

          historyText +=
            `出来事: ${item.event}\n`;

        }

        if (item.summary) {

          historyText +=
            `概要: ${item.summary}\n`;

        }

        if (
          item.content &&
          !item.summary
        ) {

          historyText +=
            `内容: ${item.content}\n`;

        }

      }
    );


    messages.push({

      role: "system",

      content:
        `以下は「大志との歴史」に記録された過去の出来事です。
これらは会話の背景として参考にしてください。

重要:
- 過去の出来事を現在起きていることとして扱わないでください。
- 記録されていない事実を勝手に作らないでください。
- 別のキャラクターについて記録された出来事を、自分自身の経験として混同しないでください。
- 過去の記録と現在の会話が矛盾する場合は、現在の会話を優先してください。

${historyText}`

    });

  }


  /*
   * =========================
   * 現在の会話
   * =========================
   *
   * index.htmlから渡された
   * 直近20メッセージ。
   */

  for (
    let i = 0;
    i < history.length;
    i++
  ) {

    const item =
      history[i];


    if (
      !item ||
      !item.role
    ) {

      continue;

    }


    const role =
      item.role === "assistant"
        ? "assistant"
        : "user";


    const content =
      typeof item.content ===
        "string"
        ? item.content
        : "";


    if (!content) {

      continue;

    }


    /*
     * 最後のuserメッセージに
     * 画像が添付されている場合。
     */

    const isLast =
      i ===
      history.length - 1;


    if (
      role === "user" &&
      isLast &&
      image
    ) {

      messages.push({

        role: "user",

        content: [

          {

            type: "text",

            text: content

          },

          {

            type: "image_url",

            image_url: {

              url: image

            }

          }

        ]

      });

    } else {

      messages.push({

        role,

        content

      });

    }

  }


  /*
   * =========================
   * 画像だけ送信された場合
   * =========================
   */

  if (
    image &&
    history.length === 0
  ) {

    messages.push({

      role: "user",

      content: [

        {

          type: "text",

          text:
            "この画像について話してください。"

        },

        {

          type: "image_url",

          image_url: {

            url: image

          }

        }

      ]

    });

  }


  /*
   * =========================
   * DeepSeek request
   * =========================
   */

  const requestBody =
    JSON.stringify({

      model:
        "deepseek-flash",

      messages,

      thinking: {

        type:
          "disabled"

      },

      temperature:
        0.9,

      max_tokens:
        1500

    });


  const options = {

    hostname:
      "api.deepseek.com",

    path:
      "/chat/completions",

    method:
      "POST",

    headers: {

      "Content-Type":
        "application/json",

      "Content-Length":
        Buffer.byteLength(
          requestBody
        ),

      "Authorization":
        `Bearer ${apiKey}`

    }

  };


  /*
   * =========================
   * API request
   * =========================
   */

  const request =
    https.request(
      options,
      response => {

        let responseData =
          "";


        response.on(
          "data",
          chunk => {

            responseData +=
              chunk;

          }
        );


        response.on(
          "end",
          () => {

            try {

              const result =
                JSON.parse(
                  responseData
                );


              if (
                response.statusCode <
                  200 ||
                response.statusCode >=
                  300
              ) {

                console.error(
                  "DeepSeek API error:",
                  result
                );


                return res
                  .status(
                    response.statusCode
                  )
                  .json({

                    error:
                      result.error?.message ||
                      "DeepSeek API error"

                  });

              }


              const reply =
                result
                  ?.choices?.[0]
                  ?.message
                  ?.content;


              if (
                typeof reply !==
                "string"
              ) {

                console.error(
                  "Unexpected DeepSeek response:",
                  result
                );


                return res
                  .status(500)
                  .json({

                    error:
                      "DeepSeekから有効な返信が返ってきませんでした"

                  });

              }


              /*
               * ログ
               */

              console.log(
                "DeepSeek chat:",
                {

                  character,

                  historyCount:
                    history.length,

                  historicalMemoryCount:
                    historicalMemory.length,

                  relevantHistoryCount:
                    relevantHistory.length,

                  searchTokens,

                  imageAttached:
                    !!image

                }
              );


              return res
                .status(200)
                .json({

                  reply:
                    reply.trim()

                });

            } catch (error) {

              console.error(
                "DeepSeek JSON parse error:",
                error
              );


              return res
                .status(500)
                .json({

                  error:
                    "DeepSeek APIのレスポンス解析に失敗しました"

                });

            }

          }
        );

      }
    );


  request.on(
    "error",
    error => {

      console.error(
        "DeepSeek request error:",
        error
      );


      if (!res.headersSent) {

        res
          .status(500)
          .json({

            error:
              "DeepSeekへの接続に失敗しました"

          });

      }

    }
  );


  request.write(
    requestBody
  );


  request.end();

};
