/* ============================================================
   Made by MJ — shared gallery
   ONE photo list renders on every page that has <div id="gallery-grid">
   (the home page AND the gallery page), so a photo added here shows on both.

   TO ADD A PHOTO:
     1) drop the image file into images/
     2) add one { } line to MBJ_GALLERY below (copy an existing line)
   The masonry layout keeps spacing tight automatically — no matter how many
   photos or what shape they are.
   ============================================================ */
(function () {
  var MBJ_GALLERY = [
  { src:"images/july4-porch-column.jpg", alt:"Tall red, white, and blue balloon column topped with a large blue balloon on a front porch beside a red door", cat:"celebration", catLabel:"Celebration", title:"Stars & Stripes Column", tag:"Balloon column" },
  { src:"images/july4-firecracker-column.jpg", alt:"Red and blue balloon column styled as a firecracker with silver, red, and blue starburst foils bursting from the top", cat:"celebration", catLabel:"Celebration", title:"Firecracker Column", tag:"Balloon column" },
  { src:"images/july4-porch-garland.jpg", alt:"Red, white, and blue Fourth of July balloon garland with balloon star clusters and a silver starburst styled along a porch railing", cat:"celebration", catLabel:"Celebration", title:"Fourth on the Porch", tag:"Porch garland" },
  { src:"images/welcome-home-garland.jpg", alt:"Red, white, and blue balloon garland with a silver starburst on a front-porch railing", cat:"celebration", catLabel:"Celebration", title:"Welcome Home, Hero", tag:"Patriotic garland" },
  { src:"images/pastel-wall.jpg", alt:"Full pastel balloon wall in yellow, mint, blue, pink, and purple", cat:"celebration", catLabel:"Celebration", title:"Pastel Rainbow Wall", tag:"Balloon wall" },
  { src:"images/lavender-arch.jpg", alt:"Lavender, pearl, and ice-blue balloon arch with iridescent streamers", cat:"celebration", catLabel:"Celebration", title:"Lavender Dream Arch", tag:"Full arch" },
  { src:"images/grad-backdrop.jpg", alt:"Graduation backdrop with purple fringe and two purple and black balloon columns", cat:"grad", catLabel:"Graduation", title:"Class of 2026", tag:"Backdrop + columns" },
  { src:"images/spiderman-arch.jpg", alt:"Spider-Man themed red, white, and blue balloon arch with a silver number two", cat:"bday", catLabel:"Birthday", title:"Spidey Turns Two", tag:"Arch + number" },
  { src:"images/plum-garland-window.jpg", alt:"Purple, lavender, and black balloon garland with tinsel over a bay window", cat:"celebration", catLabel:"Celebration", title:"Plum & Noir, Window", tag:"Garland \u00b7 12 ft" },
  { src:"images/grad-column.jpg", alt:"Black, gold, and white graduation balloon column with balloon bows", cat:"grad", catLabel:"Graduation", title:"Congratulations Grad", tag:"Column + bows" },
  { src:"images/frozen-centerpieces.jpg", alt:"Pair of blue and pearl Frozen-themed balloon centerpieces on a dining table", cat:"bday", catLabel:"Birthday", title:"Frozen Table Toppers", tag:"Centerpieces" },
  { src:"images/lavender-arch-entry.jpg", alt:"Lavender and pearl balloon arch framing a home entryway", cat:"celebration", catLabel:"Celebration", title:"Lavender Arch, Entry", tag:"Entry install" },
  { src:"images/plum-garland.jpg", alt:"Close-up of a purple and black balloon garland with foil tinsel", cat:"celebration", catLabel:"Celebration", title:"Plum & Noir, Detail", tag:"The close-up" },
  { src:"images/july4-indoor-arch.jpg", alt:"Red, white, and blue balloon arch with silver, red, and blue starburst clusters framing an indoor doorway", cat:"celebration", catLabel:"Celebration", title:"Fourth at the Door", tag:"Doorway arch" }
  ];

  var GAP = 24; // px, matches design spacing
  function esc(s){ return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
  function columnsFor(w){ return w >= 1024 ? 3 : (w >= 640 ? 2 : 1); }

  function tileHTML(it){
    return '<article class="g-tile" data-cat="'+esc(it.cat)+'">'
      + '<figure class="overflow-hidden rounded-lg bg-ink/5">'
      + '<img src="'+esc(it.src)+'" alt="'+esc(it.alt)+'" loading="lazy" class="tile-art w-full h-auto" />'
      + '</figure>'
      + '<div class="mt-4 flex items-baseline justify-between gap-4"><div>'
      + '<p class="text-[11px] font-medium uppercase tracking-[0.2em] text-ink/40">'+esc(it.catLabel)+'</p>'
      + '<p class="font-display text-xl italic">'+esc(it.title)+'</p></div>'
      + '<p class="shrink-0 text-[11px] uppercase tracking-[0.16em] text-deeprose">'+esc(it.tag)+'</p></div>'
      + '</article>';
  }

  function layout(grid){
    var W = grid.clientWidth; if (!W) return;
    var cols = columnsFor(W);
    var colW = (W - GAP*(cols-1)) / cols;
    var colH = []; for (var i=0;i<cols;i++) colH.push(0);
    var tiles = [].slice.call(grid.children);
    tiles.forEach(function(t){
      if (!t.classList || !t.classList.contains('g-tile') || t.style.display === 'none') return;
      t.style.width = colW + 'px';
      var m = 0; for (var i=1;i<cols;i++){ if (colH[i] < colH[m]) m = i; }
      t.style.left = (m*(colW+GAP)) + 'px';
      t.style.top  = colH[m] + 'px';
      colH[m] += t.offsetHeight + GAP;
      t.style.opacity = '1';
    });
    grid.style.height = Math.max.apply(null, colH) + 'px';
  }

  function init(){
    var grid = document.getElementById('gallery-grid'); if (!grid) return;
    var lim = parseInt(grid.getAttribute('data-gallery-limit'), 10);
    var items = isNaN(lim) ? MBJ_GALLERY : MBJ_GALLERY.slice(0, lim);
    grid.classList.add('mbj-gallery');
    grid.innerHTML = items.map(tileHTML).join('');

    var raf, relayout = function(){ cancelAnimationFrame(raf); raf = requestAnimationFrame(function(){ layout(grid); }); };
    [].slice.call(grid.querySelectorAll('img')).forEach(function(img){
      if (img.complete) relayout(); else { img.addEventListener('load', relayout); img.addEventListener('error', relayout); }
    });
    layout(grid);
    window.addEventListener('resize', relayout);

    var pills = document.querySelectorAll('.f-pill');
    pills.forEach(function(p){
      p.addEventListener('click', function(){
        if (p.disabled || p.classList.contains('is-active')) return;
        pills.forEach(function(x){ x.classList.remove('is-active'); });
        p.classList.add('is-active');
        var cat = p.dataset.filter;
        [].slice.call(grid.children).forEach(function(t){
          if (!t.classList || !t.classList.contains('g-tile')) return;
          t.style.display = (cat === 'all' || t.dataset.cat === cat) ? '' : 'none';
        });
        layout(grid);
      });
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
