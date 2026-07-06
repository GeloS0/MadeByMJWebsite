// api/stripe-webhook.js
// Vercel serverless function (plain Node runtime — no framework).
//
// Listens for Stripe's `checkout.session.completed` event and, on a
// confirmed retainer payment, sends TWO emails via Resend:
//   1. the customer  → a warm retainer receipt (the word is "retainer", never "deposit")
//   2. the business  → the full booking, with the retainer confirmed paid
//
// The signature is verified against the raw request body, so the default
// body parser MUST be disabled (see `config` at the bottom of this file).
//
// ── Required environment variables (set in Vercel → Project → Settings →
//    Environment Variables) ──────────────────────────────────────────────
//   STRIPE_SECRET_KEY      — your Stripe secret key (already set for checkout)
//   STRIPE_WEBHOOK_SECRET  — the signing secret for THIS webhook endpoint.
//                            Get it in Stripe: Developers → Webhooks → add an
//                            endpoint pointing at https://<your-domain>/api/stripe-webhook
//                            for the event `checkout.session.completed`, then
//                            copy the "Signing secret" (starts with `whsec_`).
//   RESEND_API_KEY         — your Resend API key (starts with `re_`).
//
// ── Optional environment variables ────────────────────────────────────────
//   MJ_EMAIL_FROM      — the "From" address. Default: "Made by MJ <bookings@madebymj.com>".
//                        The domain must be verified in Resend before Resend
//                        will deliver from it.
//   MJ_BUSINESS_EMAIL  — where the internal copy goes. Default: angelosmbj@gmail.com

const Stripe = require('stripe');

const FROM = process.env.MJ_EMAIL_FROM || 'Made by MJ <bookings@madebymj.com>';
const BUSINESS_INBOX = process.env.MJ_BUSINESS_EMAIL || 'angelosmbj@gmail.com';

/* ── Brand tokens (Rose and Ink) ── */
const INK = '#110820';
const DEEPROSE = '#9e3060';
const PEARL = '#fefbff';

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function money(n) {
  const num = Number(n);
  if (!Number.isFinite(num)) return '$0';
  return '$' + (Math.round(num * 100) / 100).toLocaleString('en-US', {
    minimumFractionDigits: num % 1 ? 2 : 0,
    maximumFractionDigits: 2,
  });
}

// Read the raw request body (bodyParser is disabled below).
function getRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(typeof c === 'string' ? Buffer.from(c) : c));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

// Minimal Resend client via fetch — avoids adding an npm dependency.
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

function row(label, value) {
  if (value == null || value === '' || value === '—') return '';
  return `<tr>
    <td style="padding:8px 0;font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:rgba(17,8,32,.45);vertical-align:top;white-space:nowrap;padding-right:20px;">${esc(label)}</td>
    <td style="padding:8px 0;font-size:15px;color:${INK};text-align:right;">${esc(value)}</td>
  </tr>`;
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

function orderTable(m) {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-top:8px;">
    ${row('Milestone', m.milestone)}
    ${row('Event date', m.eventDate)}
    ${row('Guests', m.guests)}
    ${row('Venue', m.venue)}
    ${row('Package', m.packageName ? `${m.packageName} — ${money(m.packagePrice)}` : '')}
    ${row('Vinyl decal', m.vinylText)}
    ${row('Add-ons', m.addons && m.addons !== 'None' ? m.addons : '')}
    ${m.rushApplies === 'yes' ? row('Rush fee', money(m.rushFee)) : ''}
    <tr><td colspan="2" style="padding-top:10px;border-top:1px solid rgba(17,8,32,.1);"></td></tr>
    ${row('Order total', money(m.orderTotal))}
    <tr>
      <td style="padding:10px 0;font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:${DEEPROSE};font-weight:700;">Retainer paid today</td>
      <td style="padding:10px 0;font-size:18px;color:${DEEPROSE};text-align:right;font-weight:700;">${money(m.retainer)}</td>
    </tr>
    ${row('Balance due on event day', money(m.balanceDue))}
  </table>`;
}

function customerEmailHtml(m, firstName) {
  return shell(`
    <p style="margin:0 0 16px;font-family:Georgia,serif;font-size:24px;font-weight:300;color:${INK};">Your date is secured, ${esc(firstName)}.</p>
    <p style="margin:0 0 20px;font-size:15px;line-height:1.6;color:rgba(17,8,32,.7);">
      We've received your <strong>retainer</strong> — thank you. This confirms your booking and holds your date.
      Here's your receipt:
    </p>
    ${orderTable(m)}
    <p style="margin:22px 0 0;font-size:15px;line-height:1.6;color:rgba(17,8,32,.7);">
      We'll be in touch within one business day to finalize your design details. The balance is due on event day.
    </p>
    ${m.referralCodeIssued ? `<div style="margin-top:24px;padding:18px;border:1px solid rgba(158,48,96,.3);border-radius:10px;text-align:center;">
      <p style="margin:0;font-size:11px;letter-spacing:.2em;text-transform:uppercase;color:${DEEPROSE};">Your referral code</p>
      <p style="margin:6px 0 0;font-family:Georgia,serif;font-size:26px;font-weight:300;letter-spacing:.06em;color:${INK};">${esc(m.referralCodeIssued)}</p>
      <p style="margin:8px 0 0;font-size:12px;color:rgba(17,8,32,.5);">Friends who book with it get 10% off — and you earn a $50 credit each time.</p>
    </div>` : ''}
    <p style="margin:24px 0 0;font-size:14px;line-height:1.6;color:rgba(17,8,32,.6);">With care,<br/>MJ &amp; Gelo — Made by MJ</p>
  `);
}

function businessEmailHtml(m) {
  return shell(`
    <p style="margin:0 0 8px;font-family:Georgia,serif;font-size:22px;font-weight:300;color:${INK};">New booking — retainer paid ✅</p>
    <p style="margin:0 0 18px;font-size:14px;color:rgba(17,8,32,.6);">${esc(m.customerName || 'Customer')} just paid their retainer via Stripe.</p>
    ${orderTable(m)}
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-top:16px;border-top:1px solid rgba(17,8,32,.1);">
      ${row('Name', m.customerName)}
      ${row('Phone', m.customerPhone)}
      ${row('Email', m.customerEmail)}
      ${row('Referral code used', m.referralCodeUsed)}
      ${row('Referral code issued', m.referralCodeIssued)}
      ${row('Vision / notes', m.vision)}
    </table>
  `);
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (!process.env.STRIPE_SECRET_KEY || !process.env.STRIPE_WEBHOOK_SECRET) {
    console.error('Stripe webhook is not configured (missing STRIPE_SECRET_KEY or STRIPE_WEBHOOK_SECRET).');
    return res.status(500).json({ error: 'Webhook not configured' });
  }

  const stripe = Stripe(process.env.STRIPE_SECRET_KEY);
  const sig = req.headers['stripe-signature'];

  let event;
  try {
    const rawBody = await getRawBody(req);
    event = stripe.webhooks.constructEvent(rawBody, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return res.status(400).json({ error: `Webhook Error: ${err.message}` });
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const m = session.metadata || {};

    // Prefer the amount Stripe actually captured for the retainer figure.
    if (session.amount_total != null) m.retainer = session.amount_total / 100;
    const customerEmail = m.customerEmail || session.customer_details?.email || session.customer_email || '';
    const firstName = (m.customerName || '').trim().split(/\s+/)[0] || 'friend';

    try {
      const jobs = [];
      if (customerEmail) {
        jobs.push(sendEmail({
          to: customerEmail,
          subject: 'Your retainer is confirmed — Made by MJ',
          html: customerEmailHtml(m, firstName),
          replyTo: BUSINESS_INBOX,
        }));
      }
      jobs.push(sendEmail({
        to: BUSINESS_INBOX,
        subject: `New booking (retainer paid) — ${m.customerName || 'Customer'} · ${m.milestone || 'event'}`,
        html: businessEmailHtml(m),
        replyTo: customerEmail || undefined,
      }));
      await Promise.all(jobs);
    } catch (err) {
      // Never fail the webhook over email — Stripe would retry the whole event.
      console.error('Post-payment email send error:', err);
    }
  }

  return res.status(200).json({ received: true });
};

// Stripe signature verification needs the raw body, so disable body parsing.
module.exports.config = { api: { bodyParser: false } };
