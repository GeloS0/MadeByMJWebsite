/* MadeByMJ — leads.js
   ─────────────────────────────────────────────────────────────────
   THE single lead-capture wire for the whole site.
   Listens (capture phase) for EVERY form submission on every page and
   POSTs the fields to one endpoint — without touching the existing
   per-page UX code (confirmations, wizards, validation all keep working).

   TO GO LIVE (one-time, ~3 min):
     1. Sign up free at https://formspree.io  (50 submissions/mo free)
     2. Create a form → copy your ID (looks like "xdorwkpq")
     3. Replace REPLACE_WITH_FORM_ID below with that ID
     4. Redeploy (npx vercel --prod)
   Every form on the site then emails you, tagged by page + form id.
   ───────────────────────────────────────────────────────────────── */

window.MJ_LEADS_ENDPOINT = 'https://formspree.io/f/REPLACE_WITH_FORM_ID';

(function () {
  var RESEND_COOLDOWN_MS = 30000; // don't double-send the same form within 30s

  function looksLikeContact(v) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) || /[\d\-() +.]{7,}/.test(v);
  }

  document.addEventListener('submit', function (e) {
    try {
      var form = e.target;
      if (!form || form.nodeName !== 'FORM') return;

      // Forms with a real Formspree action post themselves (js/main.js) — skip.
      var action = form.getAttribute('action') || '';
      if (action.indexOf('formspree.io') !== -1) return;

      var ep = window.MJ_LEADS_ENDPOINT;
      if (!ep || ep.indexOf('REPLACE_WITH_FORM_ID') !== -1) return; // not wired yet

      // Collect fields (by name, falling back to id — some forms use ids only).
      var payload = {};
      var hasContact = false;
      var fields = form.querySelectorAll('input, select, textarea');
      for (var i = 0; i < fields.length; i++) {
        var f = fields[i];
        if (f.type === 'password') continue;
        var key = f.name || f.id;
        if (!key) continue;
        var val;
        if (f.type === 'checkbox' || f.type === 'radio') {
          if (!f.checked) continue;
          val = f.value || 'yes';
          if (payload[key]) val = payload[key] + ', ' + val;
        } else {
          val = (f.value || '').trim();
        }
        if (!val) continue;
        payload[key] = val;
        if (looksLikeContact(val)) hasContact = true;
      }

      // Only send if there's a way to reach the person (skips failed validation & junk).
      if (!hasContact) return;

      // De-dupe rapid resubmits of the same form.
      var now = Date.now();
      if (form.dataset.mjSentAt && now - Number(form.dataset.mjSentAt) < RESEND_COOLDOWN_MS) return;
      form.dataset.mjSentAt = String(now);

      payload.formType = form.id || form.className || 'form';
      payload.page = location.pathname.split('/').pop() || 'index.html';
      payload.submittedAt = new Date().toISOString();

      // Fire-and-forget: never block or break the page's own confirmation UX.
      fetch(ep, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(payload)
      }).catch(function () { /* silent — page UX already confirmed to the user */ });
    } catch (err) { /* never break the page over lead capture */ }
  }, true); // capture phase: runs even though page handlers call preventDefault()
})();
