// api/contact-inquiry.js
// Vercel serverless function (plain Node runtime — no framework).
//
// Backs the simple, no-payment contact form (contact.html). On submit it
// sends TWO emails via Resend:
//   1. the customer  → a confirmation that we received their question
//   2. the business  → the full details of what they asked
//
// ── Required environment variable ─────────────────────────────────────────
//   RESEND_API_KEY  — your Resend API key (starts with `re_`).
//
// ── Optional environment variables ────────────────────────────────────────
//   MJ_EMAIL_FROM      — "From" address. Default: "Made by MJ <bookings@madebymj.com>".
//                        The domain must be verified in Resend to deliver.
//   MJ_BUSINESS_EMAIL  — where the internal copy goes. Default: angelosmbj@gmail.com

const FROM = process.env.MJ_EMAIL_FROM || 'Made by MJ <bookings@madebymj.com>';
const BUSINESS_INBOX = process.env.MJ_BUSINESS_EMAIL || 'angelosmbj@gmail.com';

// Best-effort in-memory rate limit (per warm serverless instance): caps how
// often one IP can submit, so a bot can't flood the inbox even if it clears
// the honeypot/timing checks. For hard guarantees, add Upstash/Vercel KV later.
const _hits = new Map();
function rateLimited(ip) {
  const now = Date.now(), WINDOW = 60000, MAX = 5;
  const arr = (_hits.get(ip) || []).filter((t) => now - t < WINDOW);
  arr.push(now);
  _hits.set(ip, arr);
  if (_hits.size > 5000) _hits.clear();
  return arr.length > MAX;
}

const INK = '#110820';
const DEEPROSE = '#9e3060';
const PEARL = '#fefbff';

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

async function sendEmail({ to, subject, html, replyTo }) {
  if (!process.env.RESEND_API_KEY) {
    console.error('RESEND_API_KEY is not set — cannot send email:', subject);
    return { ok: false, skipped: true };
  }
  const payload = { from: FROM, to: Array.isArray(to) ? to : [to], subject, html };
  if (replyTo) payload.reply_to = replyTo;
  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
    if (!r.ok) {
      console.error('Resend send failed:', subject, r.status, await r.text());
      return { ok: false };
    }
    return { ok: true };
  } catch (err) {
    console.error('Resend request threw:', subject, err);
    return { ok: false };
  }
}

function shell(innerHtml) {
  return `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f4eef1;">
  <div style="max-width:560px;margin:0 auto;padding:32px 20px;font-family:'DM Sans',Segoe UI,Helvetica,Arial,sans-serif;">
    <div style="background:${PEARL};border:1px solid rgba(17,8,32,.08);border-radius:12px;overflow:hidden;">
      <div style="background:${INK};padding:28px 32px;text-align:center;">
        <p style="margin:0;font-family:Georgia,'Times New Roman',serif;font-size:26px;color:${PEARL};font-weight:300;">Made <em style="color:#c4527a;">by</em> MJ</p>
        <p style="margin:6px 0 0;font-size:11px;letter-spacing:.24em;text-transform:uppercase;color:rgba(254,251,255,.55);">Celebrations, styled.</p>
      </div>
      <div style="padding:32px;">${innerHtml}</div>
      <div style="padding:20px 32px;border-top:1px solid rgba(17,8,32,.08);text-align:center;">
        <p style="margin:0;font-size:12px;color:rgba(17,8,32,.5);">Colorado Springs, Colorado · <a href="tel:+17196456836" style="color:${DEEPROSE};text-decoration:none;">(719) 645-6836</a></p>
      </div>
    </div>
  </div></body></html>`;
}

function row(label, value) {
  if (value == null || value === '') return '';
  return `<tr>
    <td style="padding:8px 0;font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:rgba(17,8,32,.45);vertical-align:top;white-space:nowrap;padding-right:20px;">${esc(label)}</td>
    <td style="padding:8px 0;font-size:15px;color:${INK};">${esc(value)}</td>
  </tr>`;
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const ip = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';
  if (rateLimited(ip)) return res.status(429).json({ error: 'Too many requests — please try again in a minute.' });

  const body = req.body || {};

  // ── Anti-spam gate ──────────────────────────────────────────────────
  // Honeypot: real people never fill a hidden field; bots do.
  if (body._gotcha) return res.status(200).json({ ok: true, skipped: 'honeypot' });
  // Timing trap: a genuine form is filled in >2s and submitted the same day.
  // Bots posting straight to this endpoint won't send a valid timestamp.
  const _t = Number(body.t);
  if (!_t || (Date.now() - _t) < 2000 || (Date.now() - _t) > 24 * 3600 * 1000) {
    return res.status(200).json({ ok: true, skipped: 'timing' });
  }
  // Basic validation before we spend a Resend send.
  const _nm = String(body.name || '').trim();
  const _em = String(body.email || '').trim();
  const _msg = String(body.message || '').trim();
  if (!_nm || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(_em) || !_msg || _msg.length > 5000) {
    return res.status(400).json({ error: 'Invalid submission' });
  }
  const name = String(body.name || '').trim();
  const email = String(body.email || '').trim();
  const phone = String(body.phone || '').trim();
  const message = String(body.message || '').trim();

  if (!name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !message) {
    return res.status(400).json({ error: 'Missing or invalid fields' });
  }

  const firstName = name.split(/\s+/)[0] || 'there';

  const customerHtml = shell(`
    <p style="margin:0 0 16px;font-family:Georgia,serif;font-size:24px;font-weight:300;color:${INK};">Got it, thank you ${esc(firstName)}.</p>
    <p style="margin:0 0 18px;font-size:15px;line-height:1.6;color:rgba(17,8,32,.7);">
      We received your message and will reply within one business day. Here's what you sent us:
    </p>
    <div style="padding:16px 18px;background:rgba(196,82,122,.06);border-radius:10px;font-size:15px;line-height:1.6;color:${INK};">${esc(message).replace(/\n/g, '<br/>')}</div>
    <p style="margin:22px 0 0;font-size:14px;line-height:1.6;color:rgba(17,8,32,.6);">If it's urgent, text us at (719) 645-6836.<br/><br/>With care,<br/>MJ &amp; Gelo — Made by MJ</p>
  `);

  const businessHtml = shell(`
    <p style="margin:0 0 8px;font-family:Georgia,serif;font-size:22px;font-weight:300;color:${INK};">New question from the site</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-top:8px;">
      ${row('Name', name)}
      ${row('Email', email)}
      ${row('Phone', phone)}
    </table>
    <p style="margin:18px 0 6px;font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:rgba(17,8,32,.45);">Their question</p>
    <div style="padding:16px 18px;background:rgba(17,8,32,.04);border-radius:10px;font-size:15px;line-height:1.6;color:${INK};">${esc(message).replace(/\n/g, '<br/>')}</div>
  `);

  try {
    await Promise.all([
      sendEmail({
        to: email,
        subject: 'We got your message — Made by MJ',
        html: customerHtml,
        replyTo: BUSINESS_INBOX,
      }),
      sendEmail({
        to: BUSINESS_INBOX,
        subject: `New question from ${name} — Made by MJ`,
        html: businessHtml,
        replyTo: email,
      }),
    ]);
  } catch (err) {
    console.error('Contact email send error:', err);
    return res.status(500).json({ error: 'Unable to send' });
  }

  return res.status(200).json({ received: true });
};
