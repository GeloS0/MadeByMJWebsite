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

const FROM = process.env.MJ_EMAIL_FROM || 'Made by MJ <bookings@madebymj.com>';
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
function btn(href, label) {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:22px auto 4px;"><tr><td style="border-radius:8px;background:${DEEPROSE};">
    <a href="${esc(href)}" style="display:inline-block;padding:13px 28px;font-size:15px;font-weight:700;color:${PEARL};text-decoration:none;">${esc(label)}</a></td></tr></table>`;
}
function p(txt) { return `<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:rgba(17,8,32,.72);">${txt}</p>`; }
function h(txt) { return `<p style="margin:0 0 16px;font-family:Georgia,serif;font-size:23px;font-weight:300;color:${INK};">${txt}</p>`; }

/* ── The four templates ── */
function colorsEmail(m) {
  const fn = esc(firstNameOf(m));
  const ev = m.eventDate ? ` on <strong>${esc(m.eventDate)}</strong>` : '';
  return shell(
    h(`Two weeks out, ${fn} — let's lock your look`) +
    p(`Your ${esc(m.milestone || 'event')}${ev} is coming up, and now's the perfect moment to confirm the details so install day is effortless.`) +
    p(`Quick check — <strong>has anything changed?</strong> Your color palette, the theme, guest count, or the venue? If your design is still exactly what we planned, there's nothing you need to do.`) +
    p(`Heads up: color and design changes are free up to 14 days out. Inside that window a small rush fee may apply, so this is the best time to tweak anything.`) +
    btn(`sms:+17196456836`, 'Text us any changes') +
    p(`<span style="font-size:13px;color:rgba(17,8,32,.55);">Prefer email? Just reply to this one.</span>`) +
    p(`With care,<br/>MJ &amp; Gelo — Made by MJ`)
  );
}
function finalEmail(m) {
  const fn = esc(firstNameOf(m));
  return shell(
    h(`We're all set for your big day, ${fn} 🎈`) +
    p(`Your ${esc(m.milestone || 'event')} is just days away and your installation is on our schedule. Two last things so setup is seamless:`) +
    p(`• <strong>Venue access & timing</strong> — please confirm the install window and the best day-of contact number.<br/>• <strong>Anything change about the space?</strong> Ceilings, walls, or where you'd like the focal piece.`) +
    (m.venue ? p(`We have your venue as: <strong>${esc(m.venue)}</strong>.`) : '') +
    (m.balanceDue && Number(m.balanceDue) > 0 ? p(`Reminder: your remaining balance of <strong>$${esc(m.balanceDue)}</strong> is due by event day.`) : '') +
    btn(`sms:+17196456836`, 'Confirm access & contact') +
    p(`We'll arrive with enough buffer to have everything built and photo-ready before your first guest walks in.`) +
    p(`See you soon,<br/>MJ &amp; Gelo — Made by MJ`)
  );
}
function reviewEmail(m) {
  const fn = esc(firstNameOf(m));
  return shell(
    h(`Did we make your day a little more magical, ${fn}?`) +
    p(`It was such a joy bringing your ${esc(m.milestone || 'event')} to life. We hope it looked absolutely stunning and that your guests felt the difference.`) +
    p(`If you have two minutes, a quick <strong>Google review</strong> would mean the world to our small studio — it's the number-one way other Colorado Springs hosts find us.`) +
    btn(REVIEW_URL, 'Leave a Google review ★') +
    p(`And if you have a moment more, we'd love your honest feedback so we keep getting better:`) +
    btn(SURVEY_URL, 'Share quick feedback') +
    p(`Thank you again for letting us be part of your celebration.<br/>MJ &amp; Gelo — Made by MJ`)
  );
}
function thanksEmail(m) {
  const fn = esc(firstNameOf(m));
  return shell(
    h(`A month later, and still smiling about your day, ${fn}`) +
    p(`It's been about a month since your ${esc(m.milestone || 'event')} — we hope the memories are still bringing you joy.`) +
    p(`Thank you for trusting Made by MJ. Being part of your celebration is exactly why we do this.`) +
    (m.referralCodeIssued ? p(`If you know someone planning something worth celebrating, your referral code <strong>${esc(m.referralCodeIssued)}</strong> gives them 10% off — and earns you a $50 credit each time it's used.`) : p(`If you know someone planning something worth celebrating, we'd be so grateful for the introduction.`)) +
    btn(`${SITE_URL}/inquire.html`, 'Plan your next celebration') +
    p(`Warmly,<br/>MJ &amp; Gelo — Made by MJ`)
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
