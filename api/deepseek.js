id="j5w2qa"
export default async function handler(req, res) {

  console.log("FUNCTION START");

  return res.status(200).json({
    ok: true,
    message: "deepseek function is alive"
  });

}
