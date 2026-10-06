import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {

  if (req.method === "GET") {

    const character =
      String(req.query.character || "");

    if (!character) {
      return res.status(400).json({
        error: "character is required"
      });
    }

    const { data, error } = await supabase
      .from("chat_logs")
      .select("role, content, created_at")
      .eq("character", character)
      .order("created_at", {
        ascending: false
      })
      .limit(20);

    if (error) {

      console.error(error);

      return res.status(500).json({
        error: error.message
      });

    }

    /*
     * DBからは新しい順なので、
     * AIに渡すときは古い順へ戻す。
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


  if (req.method === "POST") {

    const {
      character,
      role,
      content
    } = req.body || {};

    if (
      !character ||
      !role ||
      !content
    ) {

      return res.status(400).json({
        error: "character, role, content are required"
      });

    }

    const { error } = await supabase
      .from("chat_logs")
      .insert({
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
     * そのキャラクターについて
     * 古いログを削除して20件だけ残す。
     */

    const { data: oldLogs, error: fetchError } =
      await supabase
        .from("chat_logs")
        .select("id")
        .eq("character", character)
        .order("created_at", {
          ascending: false
        })
        .range(20, 1000);

    if (fetchError) {

      console.error(fetchError);

    } else if (oldLogs && oldLogs.length > 0) {

      const ids =
        oldLogs.map(item => item.id);

      await supabase
        .from("chat_logs")
        .delete()
        .in("id", ids);

    }

    return res.status(200).json({
      success: true
    });
  }


  return res.status(405).json({
    error: "Method not allowed"
  });

}
