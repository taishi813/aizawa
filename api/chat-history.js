import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {

  /*
   * =========================
   * GET
   * =========================
   *
   * 現在のセッション＋キャラクターの
   * 直近20メッセージを取得
   */

  if (req.method === "GET") {

    const character =
      String(req.query.character || "");

    const sessionId =
      String(req.query.session_id || "");


    if (!character) {

      return res.status(400).json({
        error: "character is required"
      });

    }


    if (!sessionId) {

      return res.status(400).json({
        error: "session_id is required"
      });

    }


    const { data, error } =
      await supabase

        .from("chat_logs")

        .select(
          "role, content, created_at"
        )

        .eq(
          "character",
          character
        )

        .eq(
          "session_id",
          sessionId
        )

        .order(
          "created_at",
          {
            ascending: false
          }
        )

        .limit(20);


    if (error) {

      console.error(error);

      return res.status(500).json({
        error: error.message
      });

    }


    /*
     * DBからは新しい順。
     *
     * AI・画面では
     * 古い → 新しい
     * に戻す。
     */

    const history =
      (data || [])
        .reverse()
        .map(item => ({

          role: item.role,

          content: item.content

        }));


    return res.status(200).json({

      history

    });

  }


  /*
   * =========================
   * POST
   * =========================
   *
   * 会話を1件保存
   */

  if (req.method === "POST") {

    const {
      session_id,
      character,
      role,
      content
    } = req.body || {};


    if (
      !session_id ||
      !character ||
      !role ||
      !content
    ) {

      return res.status(400).json({

        error:
          "session_id, character, role, content are required"

      });

    }


    /*
     * roleチェック
     */

    if (
      role !== "user" &&
      role !== "assistant"
    ) {

      return res.status(400).json({

        error:
          "role must be user or assistant"

      });

    }


    const { error } =
      await supabase

        .from("chat_logs")

        .insert({

          session_id,

          character,

          role,

          content

        });


    if (error) {

      console.error(error);

      return res.status(500).json({

        error: error.message

      });

    }


    /*
     * このセッション＋キャラクターについて
     * 古いログを削除して20件だけ残す。
     */

    const {
      data: oldLogs,
      error: fetchError
    } = await supabase

      .from("chat_logs")

      .select("id")

      .eq(
        "session_id",
        session_id
      )

      .eq(
        "character",
        character
      )

      .order(
        "created_at",
        {
          ascending: false
        }
      )

      .range(20, 1000);


    if (fetchError) {

      console.error(
        "OLD LOG FETCH ERROR:",
        fetchError
      );

    } else if (
      oldLogs &&
      oldLogs.length > 0
    ) {

      const ids =
        oldLogs.map(
          item => item.id
        );


      const {
        error: deleteError
      } = await supabase

        .from("chat_logs")

        .delete()

        .in(
          "id",
          ids
        );


      if (deleteError) {

        console.error(
          "OLD LOG DELETE ERROR:",
          deleteError
        );

      }

    }


    return res.status(200).json({

      success: true

    });

  }


  /*
   * =========================
   * その他
   * =========================
   */

  return res.status(405).json({

    error: "Method not allowed"

  });

}
