/* MadeByMJ — main.js */

// ── Nav hamburger ──────────────────────────────
const hamburger = document.querySelector('.nav__hamburger');
const navLinks  = document.querySelector('.nav__links');

if (hamburger && navLinks) {
  hamburger.addEventListener('click', () => {
    navLinks.classList.toggle('open');
    hamburger.setAttribute('aria-expanded', navLinks.classList.contains('open'));
  });
}

// ── Active nav link ────────────────────────────
(function () {
  const page = location.pathname.split('/').pop() || 'index.html';
  document.querySelectorAll('.nav__links a').forEach(a => {
    const href = a.getAttribute('href');
    if (href === page || (page === '' && href === 'index.html')) {
      a.classList.add('active');
    }
  });
})();

// ── Contact form (Formspree-ready) ─────────────
const form  = document.getElementById('bookingForm');
const flash = document.getElementById('formFlash');

if (form) {
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = form.querySelector('button[type="submit"]');
    btn.textContent = 'Sending…';
    btn.disabled = true;

    // If you add a Formspree action to the form, this fetch will POST to it.
    // For now it just simulates success after a short delay.
    const action = form.getAttribute('action');
    if (action && action.startsWith('https://formspree.io')) {
      try {
        const resp = await fetch(action, {
          method: 'POST',
          body: new FormData(form),
          headers: { Accept: 'application/json' }
        });
        if (!resp.ok) throw new Error('Network error');
      } catch {
        btn.textContent = 'Send Request';
        btn.disabled = false;
        alert('Something went wrong — please email us directly at hello@madebymj.com');
        return;
      }
    } else {
      await new Promise(r => setTimeout(r, 800));
    }

    form.reset();
    btn.textContent = 'Send Request';
    btn.disabled = false;
    if (flash) {
      flash.classList.add('show');
      flash.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      setTimeout(() => flash.classList.remove('show'), 6000);
    }
  });
}

// ── Scroll-reveal (lightweight) ────────────────
const observer = new IntersectionObserver((entries) => {
  entries.forEach(e => {
    if (e.isIntersecting) {
      e.target.style.opacity  = '1';
      e.target.style.transform = 'translateY(0)';
      observer.unobserve(e.target);
    }
  });
}, { threshold: 0.1 });

document.querySelectorAll('.service-card, .gallery-item, .testimonial').forEach(el => {
  el.style.opacity   = '0';
  el.style.transform = 'translateY(24px)';
  el.style.transition = 'opacity .5s ease, transform .5s ease';
  observer.observe(el);
});
