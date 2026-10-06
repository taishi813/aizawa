import { createClient } from "@supabase/supabase-js";

console.log("=== chat-history.js loaded ===");

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceRoleKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY;

console.log(
  "SUPABASE_URL exists:",
  !!supabaseUrl
);

console.log(
  "SUPABASE_SERVICE_ROLE_KEY exists:",
  !!supabaseServiceRoleKey
);

const supabase = createClient(
  supabaseUrl,
  supabaseServiceRoleKey
);

export default async function handler(req, res) {

  console.log("=== CHAT HISTORY API CALLED ===");
  console.log("METHOD:", req.method);

  // =========================
  // GET
  // =========================

  if (req.method === "GET") {

    const character =
      String(req.query.character || "");

    const sessionId =
      String(req.query.session_id || "");

    console.log("GET character:", character);
    console.log("GET session_id exists:", !!sessionId);

    if (!character) {

      console.log(
        "ERROR: character is missing"
      );

      return res.status(400).json({
        error: "character is required"
      });
    }

    if (!sessionId) {

      console.log(
        "ERROR: session_id is missing"
      );

      return res.status(400).json({
        error: "session_id is required"
      });
    }

    console.log(
      "Loading history from Supabase..."
    );

    const {
      data,
      error
    } = await supabase
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

      console.error(
        "SUPABASE GET ERROR:",
        error
      );

      return res.status(500).json({
        error: error.message
      });
    }

    console.log(
      "Supabase GET success."
    );

    console.log(
      "Rows found:",
      data ? data.length : 0
    );

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

  // =========================
  // POST
  // =========================

  if (req.method === "POST") {

    const {
      session_id,
      character,
      role,
      content
    } = req.body || {};

    console.log(
      "=== SAVE REQUEST ==="
    );

    console.log(
      "session_id exists:",
      !!session_id
    );

    console.log(
      "character:",
      character
    );

    console.log(
      "role:",
      role
    );

    console.log(
      "content length:",
      content
        ? content.length
        : 0
    );

    if (
      !session_id ||
      !character ||
      !role ||
      !content
    ) {

      console.log(
        "ERROR: required data missing"
      );

      return res.status(400).json({
        error:
          "session_id, character, role, content are required"
      });
    }

    if (
      role !== "user" &&
      role !== "assistant"
    ) {

      console.log(
        "ERROR: invalid role"
      );

      return res.status(400).json({
        error:
          "role must be user or assistant"
      });
    }

    // =========================
    // Supabase INSERT
    // =========================

    console.log(
      "Inserting into Supabase..."
    );

    const {
      error
    } = await supabase
      .from("chat_logs")
      .insert({
        session_id,
        character,
        role,
        content
      });

    if (error) {

      console.error(
        "SUPABASE INSERT ERROR:",
        error
      );

      return res.status(500).json({
        error: error.message
      });
    }

    console.log(
      "SUPABASE INSERT SUCCESS"
    );

    // =========================
    // 古いログを削除
    // 20件を超えた分を削除
    // =========================

    console.log(
      "Checking old logs..."
    );

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
      .range(
        20,
        1000
      );

    if (fetchError) {

      console.error(
        "OLD LOG FETCH ERROR:",
        fetchError
      );

    } else if (
      oldLogs &&
      oldLogs.length > 0
    ) {

      console.log(
        "Old logs to delete:",
        oldLogs.length
      );

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

      } else {

        console.log(
          "Old logs deleted successfully."
        );
      }

    } else {

      console.log(
        "No old logs to delete."
      );
    }

    return res.status(200).json({
      success: true
    });
  }

  console.log(
    "ERROR: Method not allowed"
  );

  return res.status(405).json({
    error: "Method not allowed"
  });
}
