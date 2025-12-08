// api/contact.js
/* Handles "Contact Us" form:
 * - Validates input
 * - Saves message into MongoDB (contacts collection)
 * - Sends confirmation email to the customer
 * - Sends notification email to support
 */

const { getDb } = require("./_db.js");
const nodemailer = require("nodemailer");

/* ---------------- EMAIL TRANSPORTER ---------------- */

function createTransporter() {
  const {
    EMAIL_HOST,
    EMAIL_PORT,
    EMAIL_USER,
    EMAIL_PASS
  } = process.env;

  if (!EMAIL_USER || !EMAIL_PASS) {
    // we throw here but it's caught in the main handler
    throw new Error(
      "EMAIL_USER or EMAIL_PASS missing in environment variables"
    );
  }

  const port = Number(EMAIL_PORT) || 587;
  const isSecure = port === 465;

  return nodemailer.createTransport({
    host: EMAIL_HOST || "smtp.gmail.com",
    port,
    secure: isSecure,
    auth: {
      user: EMAIL_USER,
      pass: EMAIL_PASS
    }
  });
}

// Generate a simple ticket/reference id
function generateTicketId() {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).substring(2, 7);
  return `TICKET-${ts}-${rand}`.toUpperCase();
}

/* ---------------- MAIN HANDLER ---------------- */

module.exports = async (req, res) => {
  // Only POST allowed
  if (req.method !== "POST") {
    if (res.setHeader) res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const body = normalizeBody(req.body);
    const { name, email, subject, message } = body;

    // Validate input
    const validation = validateInput({ name, email, subject, message });
    if (!validation.valid) {
      return res.status(400).json({
        success: false,
        error: "Validation failed",
        details: validation.errors
      });
    }

    const ticketId = generateTicketId();

    // -------- Save to DB (but DO NOT crash if it fails) --------
    let doc = null;
    try {
      const db = await getDb();
      const contacts = db.collection("contacts");
      doc = {
        ticketId,
        name: name.trim(),
        email: email.trim().toLowerCase(),
        subject: subject.trim(),
        message: message.trim(),
        status: "pending",
        createdAt: new Date(),
        updatedAt: new Date()
      };
      await contacts.insertOne(doc);
    } catch (dbErr) {
      console.error("[contact] DB error while saving contact:", dbErr);
      // fallback doc for emails only
      doc = {
        ticketId,
        name: name.trim(),
        email: email.trim().toLowerCase(),
        subject: subject.trim(),
        message: message.trim()
      };
    }

    // -------- SEND EMAILS (do NOT crash if it fails) --------
    let emailSent = true;
    try {
      await sendEmails({
        ticketId,
        name: doc.name,
        email: doc.email,
        subject: doc.subject,
        message: doc.message
      });
    } catch (err) {
      emailSent = false;
      console.error("[contact] Email sending error:", err.message || err);
    }

    return res.status(200).json({
      success: true,
      emailSent,
      ticketId,
      message: emailSent
        ? "Your message has been received. Check your email for a confirmation."
        : "Your message has been received, but there was a problem sending the confirmation email."
    });
  } catch (err) {
    console.error("[contact] Handler error:", err);
    return res.status(500).json({
      success: false,
      error: "Server error"
    });
  }
};

/* ---------------- HELPERS ---------------- */

function normalizeBody(body) {
  if (!body) return {};
  if (typeof body === "string") {
    try {
      // handle URL-encoded form: "a=1&b=2"
      return Object.fromEntries(new URLSearchParams(body));
    } catch {
      return {};
    }
  }
  if (typeof body === "object") return body;
  return {};
}

function validateInput({ name, email, subject, message }) {
  const errors = [];

  if (!name || !name.trim()) {
    errors.push({ field: "name", message: "Name is required" });
  } else if (name.trim().length < 2) {
    errors.push({
      field: "name",
      message: "Name must be at least 2 characters"
    });
  }

  if (!email || !email.trim()) {
    errors.push({ field: "email", message: "Email is required" });
  } else if (!isValidEmail(email.trim())) {
    errors.push({ field: "email", message: "Invalid email format" });
  }

  if (!subject || !subject.trim()) {
    errors.push({ field: "subject", message: "Subject is required" });
  } else if (subject.trim().length < 3) {
    errors.push({
      field: "subject",
      message: "Subject must be at least 3 characters"
    });
  }

  if (!message || !message.trim()) {
    errors.push({ field: "message", message: "Message is required" });
  } else if (message.trim().length < 5) {
    errors.push({
      field: "message",
      message: "Message must be at least 5 characters"
    });
  }

  return { valid: errors.length === 0, errors };
}

function isValidEmail(email) {
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return re.test(email);
}

async function sendEmails({ ticketId, name, email, subject, message }) {
  const transporter = createTransporter();
  const supportEmail = process.env.SUPPORT_EMAIL || process.env.EMAIL_USER;

  // ----- Email to customer -----
  const userHtml = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <div style="background: linear-gradient(135deg, #2563eb, #22c55e); padding: 24px; text-align: center;">
        <h2 style="color: #fff; margin: 0;">We received your message</h2>
      </div>
      <div style="padding: 24px; background: #f9fafb;">
        <p>Hi ${name},</p>
        <p>Thank you for contacting <strong>Grocery Web</strong>. We’ve received your message and will reply as soon as possible.</p>

        <div style="background:#fff;border-left:4px solid #22c55e;padding:16px;margin:16px 0;">
          <p style="margin:0 0 6px;font-size:12px;color:#64748b;text-transform:uppercase;">Your message</p>
          <p style="margin:0 0 4px;font-weight:600;">${subject}</p>
          <p style="margin:0;white-space:pre-wrap;">${message}</p>
        </div>

        <p style="font-size:14px;color:#64748b;">
          <strong>Ticket ID:</strong> ${ticketId}<br/>
          <strong>Expected response time:</strong> 24–48 hours
        </p>

        <p style="font-size:12px;color:#94a3b8;margin-top:24px;">
          This is an automated confirmation from Grocery Web. Please do not reply to this email.
        </p>
      </div>
    </div>
  `;

  await transporter.sendMail({
    from: `"Grocery Web Support" <${process.env.EMAIL_USER}>`,
    to: email,
    subject: `We received your message [${ticketId}]`,
    html: userHtml
  });

  // ----- Email to support -----
  const supportHtml = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <div style="background:#0f172a;padding:20px;">
        <h2 style="color:#fff;margin:0;">New Contact Request</h2>
      </div>
      <div style="padding:24px;background:#f9fafb;">
        <p><strong>Ticket ID:</strong> ${ticketId}</p>
        <p><strong>From:</strong> ${name} &lt;${email}&gt;</p>
        <p><strong>Subject:</strong> ${subject}</p>
        <p><strong>Message:</strong></p>
        <p style="white-space:pre-wrap;">${message}</p>
        <p style="font-size:12px;color:#94a3b8;margin-top:24px;">
          Received at: ${new Date().toISOString()}
        </p>
      </div>
    </div>
  `;

  await transporter.sendMail({
    from: `"Grocery Web Contact Form" <${process.env.EMAIL_USER}>`,
    to: supportEmail,
    subject: `New contact form submission – ${ticketId}`,
    html: supportHtml,
    replyTo: email
  });

  console.log(`[contact] Emails sent for ticket ${ticketId}`);
}
