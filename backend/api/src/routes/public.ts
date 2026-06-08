import { Router } from "express";
import nodemailer from "nodemailer";
import { z } from "zod";

const router = Router();

const contactSchema = z.object({
  name: z.string().trim().min(1).max(120),
  email: z.string().trim().email().max(150),
  subject: z.string().trim().min(1).max(200),
  emailText: z.string().trim().min(1).max(5000),
  website: z.string().trim().optional().default("")
});

const CONTACT_RECIPIENT_EMAIL = process.env.CONTACT_RECIPIENT_EMAIL || "pkbackendautomation@gmail.com";
const CONTACT_RATE_LIMIT_WINDOW_MS = Number(process.env.CONTACT_RATE_LIMIT_WINDOW_MS || 15 * 60 * 1000);
const CONTACT_RATE_LIMIT_MAX_REQUESTS = Number(process.env.CONTACT_RATE_LIMIT_MAX_REQUESTS || 5);
const contactRateLimitStore = new Map<string, number[]>();

function escapeHtml(value = "") {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function createContactTransporter() {
  const host = process.env.CONTACT_SMTP_HOST || "smtp.office365.com";
  const port = Number(process.env.CONTACT_SMTP_PORT || 587);
  const secure = process.env.CONTACT_SMTP_SECURE === "true";
  const user = process.env.CONTACT_SMTP_USER;
  const pass = process.env.CONTACT_SMTP_PASS;

  if (!user || !pass) {
    return null;
  }

  return nodemailer.createTransport({
    host,
    port,
    secure,
    auth: {
      user,
      pass
    }
  });
}

function isContactRateLimited(ipAddress: string) {
  const now = Date.now();
  const cutoff = now - CONTACT_RATE_LIMIT_WINDOW_MS;
  const requests = (contactRateLimitStore.get(ipAddress) || []).filter((timestamp) => timestamp > cutoff);

  if (requests.length >= CONTACT_RATE_LIMIT_MAX_REQUESTS) {
    contactRateLimitStore.set(ipAddress, requests);
    return true;
  }

  requests.push(now);
  contactRateLimitStore.set(ipAddress, requests);
  return false;
}

router.post("/api/contact", async (req, res) => {
  const parsed = contactSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Vul alle verplichte velden correct in." });
  }

  const { name, email, subject, emailText, website } = parsed.data;

  // Honeypot: act like success to avoid bot probing.
  if (website) {
    return res.json({
      success: true,
      message: "Bedankt voor uw bericht. Wij nemen zo snel mogelijk contact met u op."
    });
  }

  const requesterIp = req.ip || "unknown";
  if (isContactRateLimited(requesterIp)) {
    return res.status(429).json({
      error: "U heeft te veel berichten verstuurd in korte tijd. Probeert u het later opnieuw."
    });
  }

  const transporter = createContactTransporter();
  const fromEmail = process.env.CONTACT_FROM_EMAIL || process.env.CONTACT_SMTP_USER;
  if (!transporter || !fromEmail) {
    return res.status(503).json({ error: "De e-mailservice is momenteel niet beschikbaar." });
  }

  const normalizedSubject = subject.replace(/[\r\n]+/g, " ").trim();
  const escapedName = escapeHtml(name);
  const escapedEmail = escapeHtml(email);
  const escapedSubject = escapeHtml(subject);
  const escapedMessage = escapeHtml(emailText).replace(/\n/g, "<br>");

  const customerMail = {
    from: `P&K Backend Automation <${fromEmail}>`,
    to: email,
    subject: "Bedankt voor uw bericht aan P&K Backend Automation",
    text: `Beste ${name},\n\nHartelijk dank voor uw bericht aan P&K Backend Automation. Wij hebben uw aanvraag in goede orde ontvangen en nemen zo spoedig mogelijk contact met u op.\n\nMet vriendelijke groet,\nP&K Backend Automation`,
    html: `<p>Beste ${escapedName},</p><p>Hartelijk dank voor uw bericht aan P&K Backend Automation. Wij hebben uw aanvraag in goede orde ontvangen en nemen zo spoedig mogelijk contact met u op.</p><p>Met vriendelijke groet,<br>P&amp;K Backend Automation</p>`
  };

  const internalMail = {
    from: `P&K Backend Automation <${fromEmail}>`,
    to: CONTACT_RECIPIENT_EMAIL,
    replyTo: email,
    subject: `Nieuw contactformulier bericht: ${normalizedSubject}`,
    text: `Nieuw contactformulier bericht\n\nNaam: ${name}\nE-mail: ${email}\nOnderwerp: ${normalizedSubject}\n\nBericht:\n${emailText}\n\nVerzonden op: ${new Date().toISOString()}\nIP-adres: ${requesterIp}`,
    html: `
      <h2>Nieuw contactformulier bericht</h2>
      <p><strong>Naam:</strong> ${escapedName}</p>
      <p><strong>E-mail:</strong> ${escapedEmail}</p>
      <p><strong>Onderwerp:</strong> ${escapedSubject}</p>
      <p><strong>Bericht:</strong><br>${escapedMessage}</p>
      <p><strong>Verzonden op:</strong> ${escapeHtml(new Date().toISOString())}</p>
      <p><strong>IP-adres:</strong> ${escapeHtml(requesterIp)}</p>
    `
  };

  try {
    await Promise.all([
      transporter.sendMail(customerMail),
      transporter.sendMail(internalMail)
    ]);

    return res.json({
      success: true,
      message: `Bericht succesvol verzonden naar ${CONTACT_RECIPIENT_EMAIL}. Wij nemen spoedig contact met u op.`
    });
  } catch (error) {
    console.error("Contact form email error:", error);
    return res.status(500).json({ error: "Verzenden is nu niet gelukt. Probeert u het later opnieuw." });
  }
});

export default router;