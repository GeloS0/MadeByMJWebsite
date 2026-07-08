// api/cron-lifecycle.js
// Vercel Cron function (plain Node runtime — no framework).
//
// Runs once a day and sends Made by MJ's TIMED lifecycle emails, keyed off
// each booking's EVENT DATE. There is no database — every paid booking already
// carries its details in the Stripe PaymentIntent metadata (set by
// create-checkout-session.js via payment_intent_data.metadata), so this file
// treats Stripe as the source of truth and stamps a "sent" flag back onto the
// PaymentIntent metadata so no email ever goes out twice.
//
// The four timed emails (the immediate booking confirmation + receipt already
// fire from stripe-webhook.js at payment time):
//   1. ~2 weeks out  → color / last-minute-changes check-in   (flag: lc_colors)
//   2. 48–72h out    → final logistics confirmation            (flag: lc_final)
//   3. day after     → feedback survey + Google review ask     (flag: lc_review)
//   4. 30 days after → thank-you + referral nudge              (flag: lc_thanks)
//
// ── Required env vars (Vercel → Project → Settings → Environment Variables) ──
//   STRIPE_SECRET_KEY   — already set (used by checkout).
//   RESEND_API_KEY      — already set (used by the webhook).
// ── Recommended env vars ────────────────────────────────────────────────────
//   CRON_SECRET         — a random string. Vercel Cron sends it as
//                         "Authorization: Bearer <CRON_SECRET>"; we reject calls
//                         without it so the endpoint can't be triggered publicly.
//   GOOGLE_REVIEW_URL   — your Google review short link (the "leave a review" URL).
//   SURVEY_URL          — link to your feedback survey (Google Form, etc.).
//   MJ_EMAIL_FROM       — "From" address (default below); domain must be verified in Resend.
//   MJ_BUSINESS_EMAIL   — internal inbox (default below).
//   SITE_URL            — production origin, e.g. https://www.eventsmadebymj.com

const Stripe = require('stripe');

const FROM = process.env.MJ_EMAIL_FROM || 'Made by MJ <bookings@eventsmadebymj.com>';
const BUSINESS_INBOX = process.env.MJ_BUSINESS_EMAIL || 'angelosmbj@gmail.com';
const SITE_URL = process.env.SITE_URL || 'https://www.eventsmadebymj.com';
const REVIEW_URL = process.env.GOOGLE_REVIEW_URL || `${SITE_URL}/contact.html`;
const SURVEY_URL = process.env.SURVEY_URL || `${SITE_URL}/contact.html`;

/* ── Brand tokens (Rose and Ink) ── */
const INK = '#110820';
const DEEPROSE = '#9e3060';
const PEARL = '#fefbff';

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function firstNameOf(m) {
  return (m.customerName || '').trim().split(/\s+/)[0] || 'friend';
}

// Whole calendar days from today (UTC midnight) until the event date (YYYY-MM-DD).
// Positive = event is in the future; negative = it already happened.
function daysUntilEvent(eventDate) {
  if (!eventDate || !/^\d{4}-\d{2}-\d{2}$/.test(eventDate)) return null;
  const [y, mo, d] = eventDate.split('-').map(Number);
  const ev = Date.UTC(y, mo - 1, d);
  const now = new Date();
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Math.round((ev - today) / 86400000);
}

async function sendEmail({ to, subject, html, replyTo }) {
  if (!process.env.RESEND_API_KEY) {
    console.error('RESEND_API_KEY not set — cannot send:', subject);
    return { ok: false };
  }
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
        <p style="margin:7px 0 0;font-size:10px;letter-spacing:.26em;text-transform:uppercase;color:rgba(254,251,255,.5);">Celebrations, styled.</p>
      </div>
      <div style="padding:40px 34px;">${innerHtml}</div>
      <div style="padding:22px 32px;border-top:1px solid rgba(17,8,32,.08);text-align:center;">
        <p style="margin:0;font-size:12px;color:rgba(17,8,32,.5);">Made by MJ · Colorado Springs, CO · <a href="tel:+17196456836" style="color:${DEEPROSE};text-decoration:none;">(719) 645-6836</a></p>
      </div>
    </div>
  </div></body></html>`;
}
function hr() { return `<div style="height:1px;background:rgba(17,8,32,.1);margin:30px 0;"></div>`; }
function btn(href, label) {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;margin:6px 0 8px;"><tr><td style="border-radius:10px;background:${DEEPROSE};text-align:center;">
    <a href="${esc(href)}" style="display:block;padding:16px 22px;font-size:15px;font-weight:700;letter-spacing:.01em;color:${PEARL};text-decoration:none;">${esc(label)}</a></td></tr></table>`;
}
function btnGhost(href, label) {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;margin:6px 0 8px;"><tr><td style="border-radius:10px;border:1.5px solid ${DEEPROSE};text-align:center;">
    <a href="${esc(href)}" style="display:block;padding:14px 22px;font-size:15px;font-weight:700;color:${DEEPROSE};text-decoration:none;">${esc(label)}</a></td></tr></table>`;
}
function bullets(items) {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;margin:0 0 18px;">` +
    items.map((it) => `<tr><td style="padding:5px 0;vertical-align:top;width:20px;"><span style="color:${DEEPROSE};font-size:16px;line-height:1.6;">&bull;</span></td><td style="padding:5px 0;font-size:15px;line-height:1.6;color:rgba(17,8,32,.8);">${it}</td></tr>`).join('') +
    `</table>`;
}
function note(txt) { return `<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;margin:0 0 18px;"><tr><td style="background:rgba(158,48,96,.07);border-radius:10px;padding:14px 16px;font-size:14px;line-height:1.55;color:${INK};">${txt}</td></tr></table>`; }
function p(txt) { return `<p style="margin:0 0 18px;font-size:15px;line-height:1.75;color:rgba(17,8,32,.72);">${txt}</p>`; }
function pc(txt) { return `<p style="margin:0 0 4px;text-align:center;font-size:13px;line-height:1.6;color:rgba(17,8,32,.55);">${txt}</p>`; }
function h(txt) { return `<p style="margin:0 0 18px;font-family:Georgia,serif;font-size:26px;line-height:1.25;font-weight:400;color:${INK};">${txt}</p>`; }
function sub(txt) { return `<p style="margin:0 0 12px;font-size:12px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:${DEEPROSE};">${txt}</p>`; }
function signoff(line) { return `<p style="margin:28px 0 0;font-size:14px;line-height:1.6;color:rgba(17,8,32,.6);">${line}<br/><strong style="color:${INK};font-weight:500;">MJ &amp; Gelo — Made by MJ</strong></p>`; }

/* ── The four templates ── */
function colorsEmail(m) {
  const fn = esc(firstNameOf(m));
  const ev = m.eventDate ? ` on <strong>${esc(m.eventDate)}</strong>` : '';
  return shell(
    h(`Two weeks out, ${fn}.<br/>Let's lock your look.`) +
    p(`Your ${esc(m.milestone || 'event')}${ev} is almost here — now's the perfect moment to confirm the details so install day is effortless.`) +
    hr() +
    sub('A quick check — has anything changed?') +
    bullets(['Colors or palette', 'Theme, characters, or style', 'Guest count or timing', 'Venue or address']) +
    p(`If everything's still exactly as we planned, there's nothing you need to do.`) +
    note(`Good to know: color and design changes are free up to 14 days out — so now's the moment.`) +
    hr() +
    btn(`sms:+17196456836`, 'Text us any changes →') +
    pc('Prefer email? Just reply to this one.') +
    signoff('With care,')
  );
}
function finalEmail(m) {
  const fn = esc(firstNameOf(m));
  return shell(
    h(`Almost showtime, ${fn}.`) +
    p(`Your ${esc(m.milestone || 'event')} is just days away and your installation is on our schedule. Two quick confirmations and we're set:`) +
    hr() +
    sub('Before install day') +
    bullets(['Your install window + venue access time', 'The best day-of contact number', 'Anything that changed about the space']) +
    (m.venue ? p(`We have your venue as <strong>${esc(m.venue)}</strong>.`) : '') +
    (m.balanceDue && Number(m.balanceDue) > 0 ? note(`Balance due on event day: <strong>$${esc(m.balanceDue)}</strong>.`) : '') +
    hr() +
    btn(`sms:+17196456836`, 'Confirm access & contact →') +
    p(`We'll arrive with buffer to have everything built and photo-ready before your first guest walks in.`) +
    signoff('See you soon,')
  );
}
function reviewEmail(m) {
  const fn = esc(firstNameOf(m));
  return shell(
    h(`Did we make your day<br/>a little more magical, ${fn}?`) +
    p(`It was such a joy bringing your ${esc(m.milestone || 'event')} to life. We hope it looked absolutely stunning — and that your guests felt the difference.`) +
    hr() +
    sub('One small favor') +
    p(`A quick <strong>Google review</strong> is the number-one way other Colorado Springs hosts find us — and it means the world to a two-person studio.`) +
    btn(REVIEW_URL, '★  Leave a Google review  →') +
    pc('Takes about 60 seconds.') +
    hr() +
    p(`Have a moment more? Tell us honestly how we did:`) +
    btnGhost(SURVEY_URL, 'Share quick feedback') +
    signoff('Thank you, truly —')
  );
}
function thanksEmail(m) {
  const fn = esc(firstNameOf(m));
  const ref = m.referralCodeIssued
    ? note(`<span style="display:block;font-size:11px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:${DEEPROSE};text-align:center;">Your referral code</span>` +
           `<span style="display:block;margin:6px 0 4px;text-align:center;font-family:Georgia,serif;font-size:24px;letter-spacing:.05em;color:${INK};">${esc(m.referralCodeIssued)}</span>` +
           `<span style="display:block;text-align:center;font-size:12px;color:rgba(17,8,32,.55);">They get 10% off — you earn a $50 credit each time it's used.</span>`)
    : p(`If you know someone planning something worth celebrating, we'd be so grateful for the introduction.`);
  return shell(
    h(`A month on — and still<br/>smiling about your day, ${fn}.`) +
    p(`It's been about a month since your ${esc(m.milestone || 'event')}. We hope the memories are still bringing you joy.`) +
    p(`Thank you for trusting Made by MJ. Being part of your celebration is exactly why we do this.`) +
    hr() +
    ref +
    btn(`${SITE_URL}/inquire.html`, 'Plan your next celebration →') +
    signoff('Warmly,')
  );
}

// Decide which (if any) email a booking is due for today. Windows are generous
// so a missed cron day still gets caught, and each stage is gated by its flag.
function pickStage(md) {
  const d = daysUntilEvent(md.eventDate);
  if (d == null) return null;
  if (d <= 14 && d > 3 && md.lc_colors !== 'sent')
    return { flag: 'lc_colors', subject: 'Two weeks out — let’s confirm your colors', html: colorsEmail(md) };
  if (d <= 3 && d >= 0 && md.lc_final !== 'sent')
    return { flag: 'lc_final', subject: 'Your Made by MJ install is almost here', html: finalEmail(md) };
  if (d <= -1 && d >= -6 && md.lc_review !== 'sent')
    return { flag: 'lc_review', subject: 'How did we do? (a quick review means a lot)', html: reviewEmail(md) };
  if (d <= -30 && md.lc_thanks !== 'sent')
    return { flag: 'lc_thanks', subject: 'Thank you from Made by MJ', html: thanksEmail(md) };
  return null;
}

module.exports = async (req, res) => {
  // Auth: only Vercel Cron (or someone with the secret) may run this.
  if (process.env.CRON_SECRET) {
    const auth = req.headers['authorization'] || '';
    if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
  }
  if (!process.env.STRIPE_SECRET_KEY) {
    return res.status(500).json({ error: 'STRIPE_SECRET_KEY not set' });
  }
  const dryRun = String(req.query?.dryRun || '') === '1';
  const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

  const summary = { scanned: 0, sent: {}, dryRun };
  const bump = (flag) => { summary.sent[flag] = (summary.sent[flag] || 0) + 1; };

  try {
    // Look back ~120 days: enough to cover the 30-day thank-you plus a buffer.
    const since = Math.floor(Date.now() / 1000) - 120 * 86400;
    let startingAfter;
    for (let page = 0; page < 20; page++) { // hard cap on pagination
      const params = { limit: 100, created: { gte: since } };
      if (startingAfter) params.starting_after = startingAfter;
      const batch = await stripe.paymentIntents.list(params);
      for (const pi of batch.data) {
        if (pi.status !== 'succeeded') continue;
        const md = pi.metadata || {};
        if (!md.eventDate || !md.customerEmail) continue;
        summary.scanned++;
        const stage = pickStage(md);
        if (!stage) continue;
        if (dryRun) { bump(stage.flag + ':would-send'); continue; }
        const r = await sendEmail({
          to: md.customerEmail,
          subject: stage.subject,
          html: stage.html,
          replyTo: BUSINESS_INBOX,
        });
        if (r.ok) {
          // Merge the flag into existing metadata so it never re-sends.
          await stripe.paymentIntents.update(pi.id, { metadata: { [stage.flag]: 'sent' } });
          bump(stage.flag);
        } else {
          bump(stage.flag + ':failed');
        }
      }
      if (!batch.has_more) break;
      startingAfter = batch.data[batch.data.length - 1].id;
    }
    return res.status(200).json({ ok: true, ...summary });
  } catch (err) {
    console.error('cron-lifecycle error:', err);
    return res.status(500).json({ error: 'cron failed', detail: String(err && err.message || err) });
  }
};
