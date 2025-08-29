import nodemailer from "nodemailer";
import dotenv from "dotenv";

dotenv.config();

// Gmail SMTP configuration (use App Passwords)
const SMTP_HOST = process.env.SMTP_HOST || "smtp.gmail.com";
const SMTP_PORT = Number(process.env.SMTP_PORT || 587); // 587 is recommended
const SMTP_USER = process.env.SMTP_USER; // your Gmail address
const SMTP_PASS = process.env.SMTP_PASS; // your Gmail App Password

if (!SMTP_USER || !SMTP_PASS) {
    console.warn("⚠️  [Mailer] Missing SMTP_USER or SMTP_PASS. Configure Gmail SMTP credentials.");
}

// ✅ Create transporter with proper configuration
export const transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_PORT === 465, // true for 465 (SSL), false for 587 (STARTTLS)
    auth: {
        user: SMTP_USER,
        pass: SMTP_PASS
    },
    // Additional security options
    tls: {
        rejectUnauthorized: false
    }
});

// ✅ Verify SMTP connection on startup
transporter.verify((error, success) => {
    if (error) {
        console.error('❌ SMTP Configuration Error:', error);
    } else {
        console.log('✅ SMTP Server is ready to send emails');
    }
});

// ✅ Fixed sendEmail function
export const sendEmail = async ({ to, subject, html, text }) => {
    try {
        const info = await transporter.sendMail({
            from: `"RideShare" <${SMTP_USER}>`, // ✅ Fixed: Use SMTP_USER
            to,
            subject,
            html,
            text: text || '', // Optional plain text version
        });
        
        console.log('✅ Email sent successfully:', info.messageId);
        return info;
    } catch (error) {
        console.error('❌ Email sending failed:', error);
        throw error;
    }
};

// ✅ Export as default
export default sendEmail;
