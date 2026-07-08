// api/wedding-inquiry.js
// Vercel serverless function (plain Node runtime — no framework).
//
// Backs the dedicated wedding inquiry form (weddings-inquire.html). On submit
// it sends TWO branded emails via Resend:
//   1. the couple    → a warm, wedding-toned confirmation
//   2. the business  → the full wedding brief
//
// Env: RESEND_API_KEY (required). Optional: MJ_EMAIL_FROM, MJ_BUSINESS_EMAIL.

const FROM = process.env.MJ_EMAIL_FROM || 'Made by MJ <bookings@eventsmadebymj.com>';
const BUSINESS_INBOX = process.env.MJ_BUSINESS_EMAIL || 'angelosmbj@gmail.com';

const _hits = new Map();
function rateLimited(ip) {
  const now = Date.now(), WINDOW = 60000, MAX = 5;
  const arr = (_hits.get(ip) || []).filter((t) => now - t < WINDOW);
  arr.push(now); _hits.set(ip, arr);
  if (_hits.size > 5000) _hits.clear();
  return arr.length > MAX;
}

const INK = '#110820';
const DEEPROSE = '#9e3060';
const PEARL = '#fefbff';

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

async function sendEmail({ to, subject, html, replyTo }) {
  if (!process.env.RESEND_API_KEY) { console.error('RESEND_API_KEY not set:', subject); return { ok: false }; }
  const payload = { from: FROM, to: Array.isArray(to) ? to : [to], subject, html };
  if (replyTo) payload.reply_to = replyTo;
  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!r.ok) { console.error('Resend failed:', subject, r.status, await r.text()); return { ok: false }; }
    return { ok: true };
  } catch (err) { console.error('Resend threw:', subject, err); return { ok: false }; }
}

function shell(innerHtml) {
  return `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f4eef1;">
  <div style="max-width:560px;margin:0 auto;padding:32px 18px;font-family:'DM Sans',Segoe UI,Helvetica,Arial,sans-serif;">
    <div style="background:${PEARL};border:1px solid rgba(17,8,32,.08);border-radius:14px;overflow:hidden;">
      <div style="background:${INK};padding:30px 32px;text-align:center;">
        <p style="margin:0;font-family:Georgia,'Times New Roman',serif;font-size:26px;color:${PEARL};font-weight:300;">Made <em style="color:#c4527a;">by</em> MJ</p>
        <p style="margin:7px 0 0;font-size:10px;letter-spacing:.26em;text-transform:uppercase;color:rgba(254,251,255,.5);">Weddings &amp; vow renewals</p>
      </div>
      <div style="padding:40px 34px;">${innerHtml}</div>
      <div style="padding:22px 32px;border-top:1px solid rgba(17,8,32,.08);text-align:center;">
        <p style="margin:0;font-size:12px;color:rgba(17,8,32,.5);">Made by MJ · Colorado Springs, CO · <a href="tel:+17196456836" style="color:${DEEPROSE};text-decoration:none;">(719) 645-6836</a></p>
      </div>
    </div>
  </div></body></html>`;
}
function hr() { return `<div style="height:1px;background:rgba(17,8,32,.1);margin:26px 0;"></div>`; }
function row(label, value) {
  if (value == null || value === '' || value === '—') return '';
  return `<tr><td style="padding:7px 0;font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:rgba(17,8,32,.45);vertical-align:top;white-space:nowrap;padding-right:20px;">${esc(label)}</td><td style="padding:7px 0;font-size:15px;color:${INK};">${esc(value)}</td></tr>`;
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return res.status(405).json({ error: 'Method not allowed' }); }

  const ip = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';
  if (rateLimited(ip)) return res.status(429).json({ error: 'Too many requests — please try again in a minute.' });

  const body = req.body || {};
  if (body._gotcha) return res.status(200).json({ ok: true, skipped: 'honeypot' });
  const _t = Number(body.t);
  if (!_t || (Date.now() - _t) < 2000 || (Date.now() - _t) > 24 * 3600 * 1000) {
    return res.status(200).json({ ok: true, skipped: 'timing' });
  }

  const names = String(body.names || '').trim();
  const email = String(body.email || '').trim();
  const phone = String(body.phone || '').trim();
  const date = String(body.date || '').trim();
  const venue = String(body.venue || '').trim();
  const guests = String(body.guests || '').trim();
  const collection = String(body.collection || '').trim();
  const vision = String(body.vision || '').trim();

  if (!names || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !vision || vision.length > 5000) {
    return res.status(400).json({ error: 'Invalid submission' });
  }
  const firstName = names.split(/\s+/)[0] || 'there';

  const detailTable = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-top:6px;">
    ${row('Names', names)}
    ${row('Wedding date', date)}
    ${row('Venue', venue)}
    ${row('Guests', guests)}
    ${row('Collection', collection || '(undecided — we\'ll help choose)')}
  </table>`;

  const coupleHtml = shell(`
    <p style="margin:0 0 16px;font-family:Georgia,serif;font-size:26px;line-height:1.25;color:${INK};">Your day is in good hands, ${esc(firstName)}.</p>
    <p style="margin:0 0 18px;font-size:15px;line-height:1.75;color:rgba(17,8,32,.72);">Thank you for thinking of Made by MJ for your celebration. We'll reply within <strong>one business day</strong> with a design direction and one transparent, all-inclusive quote — no surprises, no line items.</p>
    ${hr()}
    <p style="margin:0 0 12px;font-size:12px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:${DEEPROSE};">Here's what you shared</p>
    ${detailTable}
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:14px;"><tr><td style="background:rgba(196,82,122,.06);border-radius:10px;padding:14px 16px;font-size:15px;line-height:1.6;color:${INK};">${esc(vision).replace(/\n/g, '<br/>')}</td></tr></table>
    <p style="margin:22px 0 0;font-size:14px;line-height:1.7;color:rgba(17,8,32,.6);">Anything on your mind before then? Just reply here, or text us at (719) 645-6836.<br/><br/>With care,<br/><strong style="color:${INK};font-weight:500;">MJ &amp; Gelo — Made by MJ</strong></p>
  `);

  const businessHtml = shell(`
    <p style="margin:0 0 6px;font-family:Georgia,serif;font-size:23px;color:${INK};">New wedding inquiry</p>
    <p style="margin:0 0 16px;font-size:13px;color:rgba(17,8,32,.55);">Reply within 1 business day with a design direction + all-inclusive quote.</p>
    ${detailTable}
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:8px;border-top:1px solid rgba(17,8,32,.1);">
      ${row('Email', email)}
      ${row('Phone', phone)}
    </table>
    <p style="margin:18px 0 6px;font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:rgba(17,8,32,.45);">Their vision</p>
    <div style="padding:14px 16px;background:rgba(17,8,32,.04);border-radius:10px;font-size:15px;line-height:1.6;color:${INK};">${esc(vision).replace(/\n/g, '<br/>')}</div>
  `);

  try {
    await Promise.all([
      sendEmail({ to: email, subject: 'Your wedding inquiry is with us — Made by MJ', html: coupleHtml, replyTo: BUSINESS_INBOX }),
      sendEmail({ to: BUSINESS_INBOX, subject: `New WEDDING inquiry — ${names}${date ? ' · ' + date : ''}`, html: businessHtml, replyTo: email }),
    ]);
  } catch (err) {
    console.error('Wedding inquiry email error:', err);
  }
  return res.status(200).json({ ok: true });
};
