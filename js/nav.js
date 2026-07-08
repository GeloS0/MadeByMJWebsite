/* Made by MJ — shared site nav. Edit the nav in ONE place: this file. */
(function () {
  var NAV = `<header id="site-nav" class="fixed inset-x-0 top-0 z-50">
  <nav class="mx-auto flex max-w-7xl items-center justify-between px-6 py-5 lg:px-10" aria-label="Main">
    <a href="index.html" class="font-display text-2xl tracking-tight">Made <em class="text-deeprose">by</em> MJ</a>

    <div class="hidden items-center gap-10 md:flex">
      <a href="gallery.html" class="nav-link text-[13px] font-bold uppercase tracking-[0.18em] text-ink hover:text-deeprose">Gallery</a>
      <a href="process.html" class="nav-link text-[13px] font-bold uppercase tracking-[0.18em] text-ink hover:text-deeprose">Our process</a>
      <a href="grabandgo.html" class="nav-link text-[13px] font-bold uppercase tracking-[0.18em] text-ink hover:text-deeprose">Grab &amp; Go</a>
      <a href="diy-kits.html" class="nav-link text-[13px] font-bold uppercase tracking-[0.18em] text-ink hover:text-deeprose">DIY Kits</a>
      <a href="rentals.html" class="nav-link text-[13px] font-bold uppercase tracking-[0.18em] text-ink hover:text-deeprose">Rentals</a>
      <a href="corporate.html" class="nav-link text-[13px] font-bold uppercase tracking-[0.18em] text-ink hover:text-deeprose">Corporate</a>
      <a href="faq.html" class="nav-link text-[13px] font-bold uppercase tracking-[0.18em] text-ink hover:text-deeprose">FAQ</a>
      <div class="flex items-center gap-3">
        <a href="contact.html" class="rounded-full border border-ink/25 px-5 py-2.5 text-[13px] font-medium uppercase tracking-[0.18em] text-ink transition hover:border-deeprose hover:text-deeprose">Inquire</a>
        <a href="inquire.html" class="btn-primary rounded-full bg-rose px-6 py-2.5 text-[13px] font-medium uppercase tracking-[0.18em] text-pearl hover:bg-deeprose">Book Now</a>
      </div>
    </div>

    <button id="menu-btn" class="md:hidden" aria-label="Open menu" aria-expanded="false" aria-controls="mobile-menu">
      <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M4 7h16M4 12h16M4 17h16"/></svg>
    </button>
  </nav>

  <div id="mobile-menu" class="hidden border-t border-ink/10 bg-pearl/95 px-6 py-6 backdrop-blur-md md:hidden">
    <div class="flex flex-col gap-5">
      <a href="index.html" class="mobile-link text-sm font-bold uppercase tracking-[0.18em] text-ink">Home</a>
      <a href="gallery.html" class="mobile-link text-sm font-bold uppercase tracking-[0.18em] text-ink">Gallery</a>
      <a href="process.html" class="mobile-link text-sm font-bold uppercase tracking-[0.18em] text-ink">Our process</a>
      <a href="grabandgo.html" class="mobile-link text-sm font-bold uppercase tracking-[0.18em] text-ink">Grab &amp; Go</a>
      <a href="diy-kits.html" class="mobile-link text-sm font-bold uppercase tracking-[0.18em] text-ink">DIY Kits</a>
      <a href="rentals.html" class="mobile-link text-sm font-bold uppercase tracking-[0.18em] text-ink">Rentals</a>
      <a href="corporate.html" class="mobile-link text-sm font-bold uppercase tracking-[0.18em] text-ink">Corporate</a>
      <a href="faq.html" class="mobile-link text-sm font-bold uppercase tracking-[0.18em] text-ink">FAQ</a>
      <a href="contact.html" class="mobile-link w-fit rounded-full border border-ink/20 px-6 py-2.5 text-sm font-medium uppercase tracking-[0.18em] text-ink">Inquire</a>
      <a href="inquire.html" class="mobile-link w-fit rounded-full bg-rose px-6 py-2.5 text-sm font-medium uppercase tracking-[0.18em] text-pearl">Book Now</a>
    </div>
  </div>
</header>`;
  var mount = document.getElementById('site-nav-root');
  if (mount) mount.outerHTML = NAV;
})();
