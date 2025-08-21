import nodemailer from "nodemailer";
import dotenv from "dotenv";
dotenv.config();

// Gmail SMTP configuration (use App Passwords)
const SMTP_HOST = process.env.SMTP_HOST || "smtp.gmail.com";
const SMTP_PORT = Number(process.env.SMTP_PORT || 465); // 465 (SSL) or 587 (STARTTLS)
const SMTP_USER = process.env.SMTP_USER; // your Gmail address
const SMTP_PASS = process.env.SMTP_PASS; // your Gmail App Password

if (!SMTP_USER || !SMTP_PASS) {
  console.warn("[Mailer] Missing SMTP_USER or SMTP_PASS. Configure Gmail SMTP credentials (use an App Password).");
}

export const mailerTransporter = nodemailer.createTransport({
  host: SMTP_HOST,
  port: SMTP_PORT,
  secure: SMTP_PORT === 465, // true for 465, false for 587
  auth: {
    user: SMTP_USER,
    pass: SMTP_PASS
  }
});

export const sendEmail = async ({ to, subject, html, from }) => {
  const sender = from || process.env.EMAIL_FROM || SMTP_USER || "no-reply@example.com";
  await mailerTransporter.sendMail({ from: sender, to, subject, html });
};

export default sendEmail;


