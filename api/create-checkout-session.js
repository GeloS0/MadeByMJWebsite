// api/create-checkout-session.js
// Vercel serverless function (plain Node runtime — this site has no build step
// or framework; this file and package.json's "stripe" dependency are the only
// backend pieces in the project).
//
// Creates a Stripe Checkout Session (mode: 'payment') for the booking deposit
// collected at the end of the Book Now flow (inquire.html). The dollar amount
// always comes from the client's selected package/deposit — this file never
// hardcodes a price.
//
// Required env var (set in Vercel: Project Settings → Environment Variables):
//   STRIPE_SECRET_KEY   — your Stripe secret key (sk_test_... or sk_live_...)
//
// Optional env var:
//   SITE_URL            — your production origin, e.g. https://madebymj.com
//                          Falls back to the request's Origin header, then to
//                          this project's Vercel URL if neither is present.

const Stripe = require('stripe');

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!process.env.STRIPE_SECRET_KEY) {
    console.error('STRIPE_SECRET_KEY is not set in this environment.');
    return res.status(500).json({ error: 'Payment processing is not configured' });
  }

  const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

  try {
    const body = req.body || {};
    const { amount, clientEmail, eventType, eventDate, packageName, refCode, metadata } = body;

    // Stripe metadata: keys/values must be strings, <=500 chars, <=50 keys.
    // We stash the full booking here so the webhook can build the receipt
    // emails from the Stripe event alone (no database needed).
    const cleanMetadata = {};
    if (metadata && typeof metadata === 'object') {
      Object.keys(metadata).slice(0, 45).forEach((k) => {
        const v = metadata[k];
        if (v == null || v === '') return;
        cleanMetadata[k] = String(v).slice(0, 500);
      });
    }
    if (refCode) cleanMetadata.referralCodeIssued = String(refCode).slice(0, 500);

    // amount must arrive already in cents, computed from the selected
    // package's 50% deposit — reject anything that isn't a sane positive integer.
    const amountInCents = Math.round(Number(amount));
    if (!Number.isFinite(amountInCents) || amountInCents <= 0) {
      return res.status(400).json({ error: 'Invalid amount' });
    }

    const origin =
      req.headers.origin ||
      process.env.SITE_URL ||
      'https://madebymj.vercel.app';

    // Built by hand (not URLSearchParams) so the {CHECKOUT_SESSION_ID} template
    // token reaches Stripe unencoded — Stripe substitutes it at redirect time.
    const refParam = refCode ? `&ref=${encodeURIComponent(refCode)}` : '';
    const successUrl = `${origin}/inquire.html?payment=success${refParam}&session_id={CHECKOUT_SESSION_ID}`;

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      customer_email: typeof clientEmail === 'string' && clientEmail ? clientEmail : undefined,
      line_items: [
        {
          price_data: {
            currency: 'usd',
            unit_amount: amountInCents,
            product_data: {
              name: `Made by MJ — Booking Retainer${packageName ? ` (${packageName})` : ''}`,
              description: [eventType, eventDate].filter(Boolean).join(' · ') || undefined,
            },
          },
          quantity: 1,
        },
      ],
      success_url: successUrl,
      cancel_url: `${origin}/inquire.html?payment=cancelled`,
      metadata: cleanMetadata,
      payment_intent_data: { metadata: cleanMetadata },
    });

    return res.status(200).json({ url: session.url, id: session.id });
  } catch (err) {
    console.error('Stripe Checkout Session creation failed:', err);
    return res.status(500).json({ error: 'Unable to start checkout' });
  }
};
