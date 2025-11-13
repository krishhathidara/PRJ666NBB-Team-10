// api/auth/google/callback.js
import { google } from "googleapis";
import { signToken, setAuthCookie } from "../../_auth.js";
import { getDb } from "../../_db.js";

const redirectUri = process.env.APP_URL
  ? `${process.env.APP_URL}/api/auth/google/callback`
  : "http://localhost:3000/api/auth/google/callback";

export default async function handler(req, res) {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const code = url.searchParams.get("code");

    if (!code) {
      res.writeHead(302, { Location: "/auth/signin.html?error=google" });
      return res.end();
    }

    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      redirectUri
    );

    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);

    const oauth2 = google.oauth2({ version: "v2", auth: oauth2Client });
    const { data } = await oauth2.userinfo.get();

    if (!data || !data.email) {
      res.writeHead(302, { Location: "/auth/signin.html?error=noemail" });
      return res.end();
    }

    const db = await getDb();
    const users = db.collection("users");

    let user = await users.findOne({ email: data.email.toLowerCase() });

    if (!user) {
      const now = new Date();
      const newUser = {
        name: data.name || "Google User",
        email: data.email.toLowerCase(),
        googleId: data.id,
        picture: data.picture,
        createdAt: now,
        updatedAt: now,
      };
      const { insertedId } = await users.insertOne(newUser);
      user = { _id: insertedId, ...newUser };
    }

    const token = signToken({
      id: String(user._id),
      email: user.email,
      name: user.name,
    });
    setAuthCookie(res, token);

    res.writeHead(302, { Location: "/profile.html" });
    return res.end();
  } catch (err) {
    console.error("Google OAuth callback error:", err);
    res.writeHead(302, { Location: "/auth/signin.html?error=googleauth" });
    return res.end();
  }
}
