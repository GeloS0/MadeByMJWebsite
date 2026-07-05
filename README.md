# MadeByMJ — Balloon Décor Site

4-page static site. No build step, no npm install.

## Pages
- `index.html` — Home
- `services.html` — Services + pricing
- `gallery.html` — Filterable gallery
- `contact.html` — Booking form

## Preview locally
```bash
python3 -m http.server 8000
# open http://localhost:8000
```

## Swap in real photos
Drop images into an `img/` folder, then replace the `<div class="gallery-placeholder">` blocks in `gallery.html` and `index.html` with:
```html
<img src="img/your-photo.jpg" alt="Event description" class="gallery-item__img">
```

## Wire up the contact form (Formspree — free)
1. Sign up at https://formspree.io
2. Create a new form → copy the endpoint URL
3. Add `action="https://formspree.io/f/yourcode"` to the `<form>` in `contact.html`

## Brand palette
Edit at the top of `css/styles.css`:
```css
--plum:  #2D1B3D;
--coral: #E8604C;
--gold:  #F2C14E;
--sage:  #7BAE84;
--cream: #FDF6EC;
```

## Push to GitHub & connect Claude Code
```bash
git add -A
git commit -m "Initial commit: MadeByMJ site"
git branch -M main
git remote add origin <your-github-url>
git push -u origin main

# Then in this folder:
claude
```
Inside Claude Code, run `/run-skill-generator` once to generate the verification skill.
