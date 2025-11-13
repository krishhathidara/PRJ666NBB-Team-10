import { getDb } from "../_db.js";
import bcrypt from "bcryptjs";
import { signToken, setAuthCookie } from "../_auth.js";

const IS_PROD = process.env.VERCEL === "1" || process.env.NODE_ENV === "production";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const body = normalizeBody(req.body);
    let { email, password } = body;
    email = (email || "").trim().toLowerCase();
    password = (password || "").trim();

    if (!email || !password) {
      return respond(req, res, 400, { error: "Email and password required" }, "/auth/signin.html?error=missing");
    }

    const db = await getDb();
    const users = db.collection("users");

    const user = await users.findOne({ email: { $regex: `^${escapeRegex(email)}$`, $options: "i" } });
    if (!user) {
      return respond(req, res, 401, { error: "Invalid credentials" }, "/auth/signin.html?error=invalid");
    }

    const stored = user.password || user.passwordHash || "";
    let ok = false;

    if (stored.startsWith("$2")) {
      ok = await bcrypt.compare(password, stored);
    } else if (stored && stored.length > 0) {
      if (stored === password) {
        ok = true;
        const newHash = await bcrypt.hash(password, 10);
        await users.updateOne(
          { _id: user._id },
          { $set: { password: newHash, email, updatedAt: new Date() }, $unset: { passwordHash: "" } }
        );
      }
    }

    if (!ok) {
      return respond(req, res, 401, { error: "Invalid credentials" }, "/auth/signin.html?error=invalid");
    }

    if (user.email !== email) {
      await users.updateOne({ _id: user._id }, { $set: { email } });
    }

    const token = signToken({ id: String(user._id), email, name: user.name });
    setAuthCookie(res, token);

    return respond(req, res, 200, { id: user._id, email, name: user.name }, "/profile.html");
  } catch (err) {
    console.error("signin error:", err?.message || err);
    const message = IS_PROD ? "Server error" : `Server error: ${err?.message || String(err)}`;
    return res.status(500).json({ error: message });
  }
}

// helpers
function normalizeBody(body) {
  if (!body) return {};
  if (typeof body === "string") {
    try {
      return Object.fromEntries(new URLSearchParams(body));
    } catch {
      return {};
    }
  }
  if (typeof body === "object") return body;
  return {};
}

function respond(req, res, status, json, location) {
  const wantsHTML = (req.headers.accept || "").includes("text/html");
  if (wantsHTML) {
    res.writeHead(303, { Location: location });
    return res.end();
  }
  return res.status(status).json(json);
}

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
