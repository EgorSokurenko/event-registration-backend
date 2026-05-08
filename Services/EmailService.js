'use strict';

const nodemailer = require('nodemailer');
const dotenv = require('dotenv');

dotenv.config();

let _transporter = null;

function transporter() {
    if (_transporter) return _transporter;
    if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) {
        throw new Error('SMTP_HOST / SMTP_USER / SMTP_PASS must all be set in .env');
    }
    const port = Number(process.env.SMTP_PORT || 465);
    _transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port,
        // 465 = implicit SSL/TLS; 587 = STARTTLS upgrade. Derive automatically.
        secure: port === 465,
        auth: {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS
        },
        // Force IPv4 — many cloud hosts (Railway included) have flaky IPv6 egress
        // that causes phantom "Connection timeout" errors against Gmail.
        family: 4,
        connectionTimeout: 15000,
        greetingTimeout: 10000,
        socketTimeout: 20000
    });
    return _transporter;
}

function isConfigured() {
    return !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
}

function fromHeader() {
    const name = process.env.EMAIL_FROM_NAME || 'Deep Calls to Deep';
    const addr = process.env.SMTP_USER;
    return `"${name}" <${addr}>`;
}

function escapeHtml(s) {
    return String(s ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function venueCell({ venue, venueMapUrl }) {
    const safeVenue = escapeHtml(venue);
    if (!venueMapUrl) return safeVenue;
    return `<a href="${escapeHtml(venueMapUrl)}" style="color:#00b4d8;text-decoration:underline;">${safeVenue}</a>`;
}

function buildHtml({ firstName, eventName, eventDate, venue, venueMapUrl, ticketUrl }) {
    const safe = escapeHtml;
    return `<!DOCTYPE html>
<html lang="uk">
  <body style="margin:0;padding:0;background:#0e0e10;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#f5f5f5;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0e0e10;padding:40px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#1a1a1f;border-radius:16px;padding:36px;">
            <tr><td>
              <p style="margin:0 0 12px;font-size:12px;letter-spacing:0.25em;text-transform:uppercase;color:#00b4d8;">Квиток</p>
              <h1 style="margin:0 0 20px;font-size:28px;font-weight:600;color:#f5f5f5;letter-spacing:-0.01em;">${safe(eventName)}</h1>
              <p style="margin:0 0 24px;font-size:15px;color:rgba(245,245,245,0.7);line-height:1.55;">
                Привіт, <strong style="color:#f5f5f5;">${safe(firstName)}</strong>! Ваша реєстрація підтверджена.
              </p>

              <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;margin:0 0 28px;">
                <tr>
                  <td style="padding:6px 0;font-size:13px;color:rgba(245,245,245,0.55);width:80px;">Коли</td>
                  <td style="padding:6px 0;font-size:14px;color:#f5f5f5;">${safe(eventDate)}</td>
                </tr>
                <tr>
                  <td style="padding:6px 0;font-size:13px;color:rgba(245,245,245,0.55);">Де</td>
                  <td style="padding:6px 0;font-size:14px;color:#f5f5f5;">${venueCell({ venue, venueMapUrl })}</td>
                </tr>
              </table>

              <a href="${safe(ticketUrl)}" style="display:inline-block;padding:14px 28px;background:#00b4d8;color:#0e0e10;text-decoration:none;font-weight:600;border-radius:8px;font-size:15px;">
                Відкрити квиток
              </a>

              <p style="margin:28px 0 0;font-size:13px;color:rgba(245,245,245,0.5);line-height:1.5;">
                Збережіть це посилання — на ньому буде QR-код, який потрібно показати на вході.
                Якщо кнопка не працює, скопіюйте посилання:
              </p>
              <p style="margin:8px 0 0;font-size:12px;color:rgba(245,245,245,0.4);word-break:break-all;">
                ${safe(ticketUrl)}
              </p>

              <hr style="border:none;border-top:1px solid rgba(255,255,255,0.08);margin:28px 0 20px;">

              <a href="https://t.me/nxt_gen_ci" style="display:inline-block;padding:10px 16px;background:rgba(0,180,216,0.08);border:1px solid rgba(0,180,216,0.25);border-radius:8px;color:#00b4d8;text-decoration:none;font-size:13px;font-weight:500;">
                Telegram
              </a>
            </td></tr>
          </table>
          <p style="margin:24px 0 0;font-size:12px;color:rgba(245,245,245,0.35);">
            ${safe(venue)} · ciuaschool@gmail.com
          </p>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

function buildText({ firstName, eventName, eventDate, venue, venueMapUrl, ticketUrl }) {
    const lines = [
        `Привіт, ${firstName}!`,
        '',
        `Ваша реєстрація на «${eventName}» підтверджена.`,
        `Коли: ${eventDate}`,
        `Де:   ${venue}`
    ];
    if (venueMapUrl) lines.push(`      ${venueMapUrl}`);
    lines.push(
        '',
        'Ваш квиток:',
        ticketUrl,
        '',
        'Збережіть це посилання — на ньому буде QR-код, який потрібно показати на вході.',
        '',
        'Telegram: https://t.me/nxt_gen_ci'
    );
    return lines.join('\n');
}

async function sendTicketEmail({ to, firstName, eventName, eventDate, venue, venueMapUrl, ticketUrl }) {
    const html = buildHtml({ firstName, eventName, eventDate, venue, venueMapUrl, ticketUrl });
    const text = buildText({ firstName, eventName, eventDate, venue, venueMapUrl, ticketUrl });

    const info = await transporter().sendMail({
        from: fromHeader(),
        to,
        subject: `Ваш квиток на ${eventName}`,
        text,
        html
    });
    return { messageId: info.messageId, accepted: info.accepted, rejected: info.rejected };
}

async function verifyConnection() {
    return transporter().verify();
}

module.exports = {
    isConfigured,
    sendTicketEmail,
    verifyConnection
};
