// Local-only dev server: serves /public and implements auth APIs inline.
// Production on Vercel still uses /api/* serverless functions.

const path = require("path");
const express = require("express");
const { MongoClient } = require("mongodb");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const cookie = require("cookie");
const nodemailer = require("nodemailer");
const crypto = require("crypto");
const session = require("express-session");
const passport = require("passport");
const GoogleStrategy = require("passport-google-oauth20").Strategy;

// Load env (prefer .env.local if present, then .env)
require("dotenv").config({ path: path.join(process.cwd(), ".env.local") });
require("dotenv").config();

const app = express();
app.post("/api/webhook/stripe", 
  express.raw({ type: 'application/json' }),
  async (req, res) => {
    // Store raw body as string (needed for signature verification)
    req.rawBody = req.body.toString();
    
    // Import and call the webhook handler
    const webhookHandler = require('./api/webhooks/stripe');
    return webhookHandler.default(req, res);
  }
);
// --- STRIPE WEBHOOK ---
// Capture raw body for Stripe webhook
// app.use('/api/webhook/stripe', express.raw({ type: 'application/json' }));
// 1. WEBHOOK ROUTE FIRST - with raw body
// app.post("/api/webhook/stripe", 
//   express.raw({ type: 'application/json' }),
//   async (req, res) => {
//     console.log('WEBHOOK ENDPOINT HIT');
    
//     const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
//     const { getDb } = require('./api/_db.js');
    
//     const sig = req.headers['stripe-signature'];
//     const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

//     if (!webhookSecret) {
//       console.error('STRIPE_WEBHOOK_SECRET not set');
//       return res.status(500).json({ error: 'Webhook secret not configured' });
//     }

//     console.log('Body type:', typeof req.body);
//     console.log('Body is Buffer?', Buffer.isBuffer(req.body));

//     let event;

//     try {
//       // req.body should be a Buffer from express.raw()
//       event = stripe.webhooks.constructEvent(
//         req.body,
//         sig,
//         webhookSecret
//       );
//       console.log('Signature verified');
//     } catch (err) {
//       console.error('Webhook verification failed:', err.message);
//       return res.status(400).send(`Webhook Error: ${err.message}`);
//     }

//     console.log('Event type:', event.type);

//     if (event.type === 'checkout.session.completed') {
//       const session = event.data.object;
//       console.log('Payment completed!');
//       console.log('Session ID:', session.id);
//       console.log('Metadata:', session.metadata);
      
//       try {
//         const db = await getDb();
//         const userEmail = session.metadata.userEmail;

//         // Update order
//         const updateResult = await db.collection("orders").updateOne(
//           { stripeSessionId: session.id },
//           { $set: { paymentStatus: 'paid', paidAt: new Date() } }
//         );
        
//         if (updateResult.modifiedCount > 0) {
//           console.log('Order marked as paid');
//         } else {
//           console.warn('Order not found for session:', session.id);
//         }

//         // Clear cart
//         if (userEmail) {
//           const deleteResult = await db.collection("cart").deleteMany({ userEmail });
//           console.log(`Cart cleared: ${deleteResult.deletedCount} items`);
//         } else {
//           console.warn('No userEmail in metadata');
//         }
//       } catch (err) {
//         console.error('Processing error:', err);
//         return res.status(500).json({ error: 'Processing failed' });
//       }
//     }

//     console.log('Webhook processed successfully\n');
//     res.status(200).json({ received: true });
//   }
// );

// Allow larger uploads for avatars (up to 10 MB)
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

const usersHandler = require("./api/users");

const mealPlansHandler = require("./api/mealplans");

// Temporary route to verify MongoDB connection
app.use('/api/testdb', require('./api/testdb'));
app.use('/api/users', require('./api/users'));
app.use("/api/mealplans", mealPlansHandler);

// --- RECEIPTS API ---
app.use("/api/receipts/create", require("./api/receipts/create"));
app.use("/api/receipts/list", require("./api/receipts/list"));
app.use("/api/receipts/mostBought", require("./api/receipts/mostBought"));
app.use("/api/receipts/summary", require("./api/receipts/summary"));
app.use("/api/receipts/details", require("./api/receipts/details"));
app.delete("/api/receipts/delete", require("./api/receipts/delete"));

// --- ENV ---
const MONGODB_URI = process.env.MONGODB_URI;
const JWT_SECRET = process.env.JWT_SECRET || "dev-secret";
const COOKIE_NAME = process.env.AUTH_COOKIE || "app_session";
const MAX_AGE = parseInt(process.env.AUTH_MAXAGE || "2592000", 10); // 30d
const EMAIL_HOST = process.env.EMAIL_HOST;
const EMAIL_PORT = process.env.EMAIL_PORT;
const EMAIL_USER = process.env.EMAIL_USER;
const EMAIL_PASS = process.env.EMAIL_PASS;
const APP_URL = process.env.APP_URL || "http://localhost:3000";
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;

// Server-side Google Maps key
const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY;

// Vendor mock endpoints (for local proxy)
const WALMART_API_URL = process.env.WALMART_API_URL;
const METRO_API_URL = process.env.METRO_API_URL;
const FRESHCO_API_URL = process.env.FRESHCO_API_URL;

if (!MONGODB_URI) {
  console.error("❌ Missing MONGODB_URI in environment.");
  process.exit(1);
}
if (!WALMART_API_URL) {
  console.warn("⚠️ WALMART_API_URL not set. /api/vendors/walmart will return 500 until configured.");
}
if (!METRO_API_URL) {
  console.warn("⚠️ METRO_API_URL not set. /api/vendors/metro will return 500 until configured.");
}
if (!FRESHCO_API_URL) {
  console.warn("⚠️ FRESHCO_API_URL not set. /api/vendors/freshco will return 500 until configured.");
}


// ---------- DEV PROXY FOR MOCK NOFRILLS ----------
const NOFRILLS_API_URL = process.env.NOFRILLS_API_URL;

if (!NOFRILLS_API_URL) {
  console.warn("⚠️  NOFRILLS_API_URL is not set. /api/vendors/nofrills will return 500 until you set it.");
}

app.get("/api/vendors/nofrills", async (_req, res) => {
  try {
    if (!NOFRILLS_API_URL)
      return res.status(500).json({ error: "NOFRILLS_API_URL not configured" });

    const upstream = await fetch(NOFRILLS_API_URL, {
      headers: { Accept: "application/json" },
    });

    const text = await upstream.text();
    console.log(`[nofrills proxy] GET ${NOFRILLS_API_URL} -> ${upstream.status}`);

    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.status(upstream.ok ? 200 : 502).send(text);
  } catch (err) {
    console.error("Dev proxy /api/vendors/nofrills error:", err);
    res.status(502).json({ error: "Failed to fetch NoFrills data" });
  }
});

// --- DB (single shared client) ---
let dbPromise;
async function getDb() {
  if (!dbPromise) {
    const client = new MongoClient(MONGODB_URI, { maxPoolSize: 10 });
    dbPromise = client.connect().then((c) => c.db());
  }
  return dbPromise;
}

// --- Helpers ---
function signToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: MAX_AGE });
}
function setAuthCookie(res, token) {
  const isProd = process.env.NODE_ENV === "production";
  res.setHeader(
    "Set-Cookie",
    cookie.serialize(COOKIE_NAME, token, {
      httpOnly: true,
      secure: isProd,
      sameSite: "lax",
      path: "/",
      maxAge: MAX_AGE,
    })
  );
}
function clearAuthCookie(res) {
  const isProd = process.env.NODE_ENV === "production";
  res.setHeader(
    "Set-Cookie",
    cookie.serialize(COOKIE_NAME, "", {
      httpOnly: true,
      secure: isProd,
      sameSite: "lax",
      path: "/",
      maxAge: 0,
    })
  );
}
function getUserFromReq(req) {
  try {
    const cookies = cookie.parse(req.headers.cookie || "");
    const tok = cookies[COOKIE_NAME];
    if (!tok) return null;
    return jwt.verify(tok, JWT_SECRET);
  } catch {
    return null;
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


// --- Middleware ---
app.use(express.json());
app.use(express.urlencoded({ extended: false}));

app.use(
  session({
    secret: JWT_SECRET,
    resave: false,
    saveUninitialized: false,
  })
);
app.use(passport.initialize());
app.use(passport.session());

passport.serializeUser((user, done) => done(null, user));
passport.deserializeUser((user, done) => done(null, user));

// --- Google Auth Strategy ---
if (GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET) {
  passport.use(
    new GoogleStrategy(
      {
        clientID: GOOGLE_CLIENT_ID,
        clientSecret: GOOGLE_CLIENT_SECRET,
        callbackURL: `${APP_URL}/api/auth/google/callback`,
      },
      async (_accessToken, _refreshToken, profile, done) => {
        try {
          const db = await getDb();
          const users = db.collection("users");
          const email = profile.emails[0].value.toLowerCase();

          let user = await users.findOne({ email });
          if (!user) {
            const now = new Date();
            const newUser = {
              name: profile.displayName,
              email,
              provider: "google",
              createdAt: now,
              updatedAt: now,
            };
            const { insertedId } = await users.insertOne(newUser);
            user = { _id: insertedId, ...newUser };
          }
          return done(null, user);
        } catch (err) {
          return done(err, null);
        }
      }
    )
  );
}

// --- Utils ---
function wantsHTML(req) {
  const a = (req.headers.accept || "").toLowerCase();
  const ct = (req.headers["content-type"] || "").toLowerCase();
  return a.includes("text/html") || ct.includes("application/x-www-form-urlencoded");
}

// ---------- AUTH APIs ----------
app.get("/api/auth/google", passport.authenticate("google", { scope: ["profile", "email"] }));

app.get(
  "/api/auth/google/callback",
  passport.authenticate("google", { failureRedirect: "/auth/signin" }),
  (req, res) => {
    const token = signToken({
      id: req.user._id.toString(),
      email: req.user.email,
      name: req.user.name,
    });
    setAuthCookie(res, token);
    res.redirect("/");
  }
);

app.post("/api/auth/signup", async (req, res) => {
  try {
    const { name, email, password } = req.body || {};
    if (!name || !email || !password) return res.status(400).json({ error: "Missing fields" });

    const db = await getDb();
    const users = db.collection("users");
    await users.createIndex({ email: 1 }, { unique: true });

    const existing = await users.findOne({ email: email.toLowerCase() });
    if (existing) return res.status(409).json({ error: "Email already in use" });

    const passwordHash = bcrypt.hashSync(password, 10);
    const now = new Date();
    const userDoc = {
      name,
      email: email.toLowerCase(),
      passwordHash,
      provider: "password",
      createdAt: now,
      updatedAt: now,
    };

    const { insertedId } = await users.insertOne(userDoc);
    const token = signToken({ id: insertedId.toString(), email: userDoc.email, name: userDoc.name });
    setAuthCookie(res, token);
    res.status(201).json({ id: insertedId, email: userDoc.email, name: userDoc.name });
  } catch (err) {
    console.error("signup error:", err);
    const code = err && err.code === 11000 ? 409 : 500;
    res.status(code).json({ error: code === 409 ? "Email already in use" : "Server error" });
  }
});

app.post("/api/auth/signin", async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) return res.status(400).json({ error: "Missing fields" });

    const db = await getDb();
    const users = db.collection("users");
    const user = await users.findOne({ email: email.toLowerCase() });
    if (!user || !user.passwordHash) return res.status(401).json({ error: "Invalid credentials" });

    const ok = bcrypt.compareSync(password, user.passwordHash);
    if (!ok) return res.status(401).json({ error: "Invalid credentials" });

    const token = signToken({ id: user._id.toString(), email: user.email, name: user.name });
    setAuthCookie(res, token);
    res.json({ id: user._id, email: user.email, name: user.name });
  } catch (err) {
    console.error("signin error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

app.get("/api/auth/me", async (req, res) => {
  try {
    const cookies = cookie.parse(req.headers.cookie || "");
    const tok = cookies[COOKIE_NAME];
    if (!tok) {
      console.log("❌ No auth cookie found");
      return res.status(401).json({ error: "Unauthorized" });
    }

    // Verify the JWT
    let decoded;
    try {
      decoded = jwt.verify(tok, JWT_SECRET);
    } catch (err) {
      console.log("❌ Invalid JWT token:", err.message);
      return res.status(401).json({ error: "Invalid token" });
    }

    // Load user from MongoDB
    const db = await getDb();
    const u = await db.collection("users").findOne({ email: decoded.email });
    if (!u) {
      console.log("❌ No user found for", decoded.email);
      return res.status(401).json({ error: "User not found" });
    }

    // ✅ return real user
    res.json({
      id: u._id.toString(),
      email: u.email,
      name: u.name,
      favStore: u.favStore || "",
      avatar: u.avatar || "",
    });
  } catch (err) {
    console.error("auth/me error:", err);
    res.status(500).json({ error: "Server error" });
  }
});


app.post("/api/auth/logout", (_req, res) => {
  clearAuthCookie(res);
  res.status(204).end();
});

// ---------- GEO PROXIES ----------
function assertMapsKey(res) {
  if (!GOOGLE_MAPS_API_KEY) {
    res.status(500).json({ error: "Missing GOOGLE_MAPS_API_KEY" });
    return false;
  }
  return true;
}

app.get("/api/geo/reverse", async (req, res) => {
  try {
    if (!assertMapsKey(res)) return;
    const { lat, lon } = req.query;
    if (!lat || !lon) return res.status(400).json({ error: "lat & lon required" });
    const url = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lon}&key=${GOOGLE_MAPS_API_KEY}`;
    const r = await fetch(url);
    const j = await r.json();
    const best = (j.results && j.results[0]) || null;
    res.json({
      ok: true,
      address: best?.formatted_address || null,
      placeId: best?.place_id || null,
    });
  } catch (e) {
    console.error("geo reverse error:", e);
    res.status(500).json({ error: "reverse failed" });
  }
});

// ---------- GEO AUTOCOMPLETE ----------
app.get("/api/geo/autocomplete", async (req, res) => {
  try {
    if (!assertMapsKey(res)) return;
    const input = (req.query.input || "").trim();
    if (!input) return res.status(400).json({ error: "Missing input" });

    const url = `https://maps.googleapis.com/maps/api/place/autocomplete/json?input=${encodeURIComponent(
      input
    )}&types=geocode&key=${GOOGLE_MAPS_API_KEY}`;

    const r = await fetch(url);
    const j = await r.json();

    if (j.error_message) {
      console.error("Google API error (autocomplete):", j.error_message);
    }

    res.json({ predictions: j.predictions || [] });
  } catch (e) {
    console.error("geo autocomplete error:", e);
    res.status(500).json({ error: "autocomplete failed" });
  }
});

// ---------- GEO PLACE ----------
app.get("/api/geo/place", async (req, res) => {
  try {
    if (!assertMapsKey(res)) return;
    const id = req.query.id;
    if (!id) return res.status(400).json({ error: "Missing place id" });

    const url = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${encodeURIComponent(
      id
    )}&fields=geometry,formatted_address,name&key=${GOOGLE_MAPS_API_KEY}`;

    const r = await fetch(url);
    const j = await r.json();

    if (j.error_message) {
      console.error("Google API error (place):", j.error_message);
    }

    const result = j.result || {};
    res.json({
      lat: result.geometry?.location?.lat,
      lon: result.geometry?.location?.lng,
      address: result.formatted_address,
      name: result.name,
    });
  } catch (e) {
    console.error("geo place error:", e);
    res.status(500).json({ error: "place failed" });
  }
});

// ---------- DEV PROXIES ----------
async function proxyVendor(res, url, name) {
  try {
    if (!url) return res.status(500).json({ error: `${name}_API_URL not configured` });
    const upstream = await fetch(url, { headers: { Accept: "application/json" } });
    const text = await upstream.text();
    console.log(`[proxy] GET ${name}: ${url} -> ${upstream.status}`);
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.status(upstream.ok ? 200 : 502).send(text);
  } catch (err) {
    console.error(`Dev proxy /api/vendors/${name} error:`, err);
    res.status(502).json({ error: `Failed to fetch ${name} data` });
  }
}

app.get("/api/vendors/walmart", (_req, res) => proxyVendor(res, WALMART_API_URL, "walmart"));
app.get("/api/vendors/metro", (_req, res) => proxyVendor(res, METRO_API_URL, "metro"));
app.get("/api/vendors/freshco", (_req, res) => proxyVendor(res, FRESHCO_API_URL, "freshco"));

// ========== CART ROUTES ==========
app.post("/api/cart/add", require("./api/cart/add"));
app.post("/api/checkout", require("./api/checkout"));
app.get("/api/cart/get", require("./api/cart/get"));
app.get("/api/cart", require("./api/cart/get"));
app.delete("/api/cart/remove", require("./api/cart/remove"));
app.patch("/api/cart/update", require("./api/cart/update"));

// ========== ORDER ROUTES ==========
app.get("/api/orders/:sessionId", require("./api/orders/[sessionId]"));
app.get("/api/orders", require("./api/orders/orders"));

// ========== STRIPE WEBHOOK ==========
//app.post("/api/webhook/stripe", require("./api/webhooks/stripe"));

// --- Static site ---
app.use(express.static(path.join(__dirname, "public"), { extensions: ["html"] }));

app.get("/auth/signin", (_req, res) =>
  res.sendFile(path.join(__dirname, "public", "auth", "signin.html"))
);
app.get("/auth/signup", (_req, res) =>
  res.sendFile(path.join(__dirname, "public", "auth", "signup.html"))
);
app.get("/auth/reset", (_req, res) =>
  res.sendFile(path.join(__dirname, "public", "auth", "reset.html"))
);

app.get("/", (_req, res) =>
  res.sendFile(path.join(__dirname, "public", "index.html"))
);

app.use((_req, res) =>
  res.status(404).sendFile(path.join(__dirname, "public", "index.html"))
);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Local dev server running at http://localhost:${PORT}`);
});
