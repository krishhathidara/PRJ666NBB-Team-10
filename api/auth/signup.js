import { getDb } from "../_db.js";
import bcrypt from "bcryptjs";
import { signToken, setAuthCookie } from "../_auth.js";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const body = normalizeBody(req.body);
    let { name, email, password } = body;
    name = (name || "").trim();
    email = (email || "").trim().toLowerCase();
    password = (password || "").trim();

    if (!name || !email || !password) {
      return respond(req, res, 400, { error: "All fields required" }, "/auth/signup.html?error=missing");
    }

    const db = await getDb();
    const users = db.collection("users");

    const existing = await users.findOne({ email });
    if (existing) {
      return respond(req, res, 409, { error: "Email already in use" }, "/auth/signup.html?error=exists");
    }

    const hashed = await bcrypt.hash(password, 10);
    const now = new Date();

    // ✅ Add profile structure
    const defaultProfile = {
      name,
      email,
      password: hashed,
      favStore: "None",
      avatar: "/assets/default-avatar.png",
      stats: {
        listsCreated: 0,
        itemsBought: 0,
        totalSpent: 0
      },
      createdAt: now,
      updatedAt: now
    };

    const { insertedId } = await users.insertOne(defaultProfile);

    const token = signToken({ id: String(insertedId), email, name });
    setAuthCookie(res, token);

    return respond(req, res, 201, { id: insertedId, email, name }, "/profile.html");
  } catch (err) {
    console.error("signup error:", err?.message || err);
    return res.status(500).json({ error: "Server error" });
  }
}

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
