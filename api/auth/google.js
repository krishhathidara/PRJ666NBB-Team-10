// api/auth/google.js
import { google } from "googleapis";

const redirectUri = process.env.APP_URL
  ? `${process.env.APP_URL}/api/auth/google/callback`
  : "http://localhost:3000/api/auth/google/callback";

export default async function handler(req, res) {
  try {
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      redirectUri
    );

    const authUrl = oauth2Client.generateAuthUrl({
      access_type: "offline",
      scope: ["openid", "email", "profile"],
      prompt: "select_account",
    });

    res.writeHead(302, { Location: authUrl });
    return res.end();
  } catch (err) {
    console.error("Google OAuth init error:", err);
    res.writeHead(302, { Location: "/auth/signin.html?error=googleinit" });
    return res.end();
  }
}
