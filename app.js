// Kill any old service workers and caches immediately
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then(function(regs) { regs.forEach(function(r) { r.unregister(); }); });
  caches.keys().then(function(keys) { keys.forEach(function(k) { caches.delete(k); }); });
}

// ══════════════════════════════════
// SUPABASE CONFIG
// ══════════════════════════════════
var SB_URL = 'https://tuarjmzjvnhmnpfkxcbo.supabase.co';
var SB_KEY = 'sb_publishable_GVl8wU8THUveLkWRiKB4Rg_MhBT7J_3';
var SB_TABLE = 'stockholm_steps';

async function sbFetch(path, method, body) {
  method = method || 'GET';
  var opts = {
    method: method,
    headers: {
      'apikey': SB_KEY,
      'Authorization': 'Bearer ' + SB_KEY,
      'Content-Type': 'application/json',
      'Prefer': method === 'POST' ? 'return=representation' : ''
    }
  };
  if (body) opts.body = JSON.stringify(body);
  try {
    var res = await fetch(SB_URL + '/rest/v1/' + path, opts);
    if (!res.ok) return null;
    var text = await res.text();
    return text ? JSON.parse(text) : [];
  } catch(e) { console.log('SB:', e); return null; }
}

// ══════════════════════════════════
// STATE
// ══════════════════════════════════
var currentPage = 'home';
var prevPage = 'home';
var favorites = JSON.parse(localStorage.getItem('stockholm-favs') || '[]');
var customSteps = [];
var selectedPhotoBase64 = null;
var editingStepId = null;

var DAY_PHOTO_KEYS = {
  arrival: 'day-hero-arrival',
  day1:    'day-hero-day1',
  day2:    'day-hero-day2',
  day3:    'day-hero-day3',
  day4:    'day-hero-day4'
};

// ══════════════════════════════════
// NAVIGATION
// ══════════════════════════════════
function showPage(id) {
  document.querySelectorAll('.page').forEach(function(p) {
    p.classList.remove('active');
    p.style.display = 'none';
  });
  var el = document.getElementById('page-' + id);
  if (el) {
    el.style.display = 'block';
    setTimeout(function() { el.classList.add('active'); }, 10);
    window.scrollTo(0, 0);
  }
}

function navigate(tab) {
  document.querySelectorAll('.nav-btn').forEach(function(b) { b.classList.remove('active'); });
  var btn = document.getElementById('nav-' + tab);
  if (btn) btn.classList.add('active');
  prevPage = currentPage;
  currentPage = tab;
  if (tab === 'favorites') renderFavorites();
  showPage(tab);
}

function showDay(dayId) {
  document.querySelectorAll('.nav-btn').forEach(function(b) { b.classList.remove('active'); });
  prevPage = currentPage;
  currentPage = dayId;
  showPage(dayId);
}

function goBack() {
  var back = ['home','days','favorites'].indexOf(prevPage) > -1 ? prevPage : 'home';
  navigate(back);
}

// ══════════════════════════════════
// WEATHER — start_date/end_date fixes
// ══════════════════════════════════
function openWeather() {
  window.location.href = 'weather://';
  setTimeout(function() {
    window.open('https://weather.com/weather/tenday/l/Stockholm+Sweden+SWXX0027:1:SW', '_blank');
  }, 400);
}

function wIcon(c) {
  if (c === 0) return '\u2600\uFE0F';
  if (c <= 2) return '\uD83C\uDF24\uFE0F';
  if (c <= 3) return '\u2601\uFE0F';
  if (c <= 48) return '\uD83C\uDF2B\uFE0F';
  if (c <= 67) return '\uD83C\uDF27\uFE0F';
  if (c <= 77) return '\uD83C\uDF28\uFE0F';
  if (c <= 82) return '\uD83C\uDF26\uFE0F';
  if (c <= 99) return '\u26C8\uFE0F';
  return '\uD83C\uDF24\uFE0F';
}

function wDesc(c) {
  if (c === 0) return 'Ciel dégagé';
  if (c <= 2) return 'Partiellement nuageux';
  if (c <= 3) return 'Couvert';
  if (c <= 48) return 'Brumeux';
  if (c <= 67) return 'Pluvieux';
  if (c <= 77) return 'Neigeux';
  if (c <= 82) return 'Averses';
  return 'Orageux';
}

async function loadWeather() {
  // start_date + end_date = exactement les 5 dates du voyage, peu importe quand on appelle
  var url = 'https://api.open-meteo.com/v1/forecast'
    + '?latitude=59.3293&longitude=18.0686'
    + '&daily=temperature_2m_max,temperature_2m_min,weathercode'
    + '&timezone=Europe/Stockholm'
    + '&start_date=2026-04-03&end_date=2026-04-07';

  var labels = ['Ven 3','Sam 4','Dim 5','Lun 6','Mar 7'];
  var dayTempIds = [null,'day1-temp','day2-temp','day3-temp','day4-temp'];

  try {
    var res = await fetch(url);
    if (!res.ok) throw new Error('API');
    var data = await res.json();
    var d = data.daily;

    // Index 0=3 avril, 1=4 avril, 2=5 avril, 3=6 avril, 4=7 avril — toujours
    var mainMax  = Math.round(d.temperature_2m_max[1]);
    var mainCode = d.weathercode[1];

    var el; 
    el = document.getElementById('w-icon'); if (el) el.textContent = wIcon(mainCode);
    el = document.getElementById('w-temp'); if (el) el.textContent = mainMax + '\u00B0C';
    el = document.getElementById('w-desc'); if (el) el.textContent = wDesc(mainCode) + ' \u00B7 Stockholm 3\u20137 avril';

    var forecastEl = document.getElementById('w-forecast');
    if (forecastEl) {
      forecastEl.innerHTML = '';
      for (var i = 0; i < 5; i++) {
        var max = Math.round(d.temperature_2m_max[i]);
        var min = Math.round(d.temperature_2m_min[i]);
        var wc  = d.weathercode[i];
        var div = document.createElement('div');
        div.className = 'weather-day';
        div.innerHTML = '<div class="weather-day-label">' + labels[i] + '</div>'
          + '<div class="weather-day-icon">' + wIcon(wc) + '</div>'
          + '<div class="weather-day-temp">' + max + '\u00B0</div>';
        forecastEl.appendChild(div);
        if (i >= 1 && dayTempIds[i]) {
          el = document.getElementById(dayTempIds[i]);
          if (el) el.textContent = max + '\u00B0C';
        }
      }
    }
  } catch(e) {
    console.log('Weather error:', e);
    el = document.getElementById('w-icon'); if (el) el.textContent = '\uD83C\uDF24\uFE0F';
    el = document.getElementById('w-temp'); if (el) el.textContent = '~7\u00B0C';
    el = document.getElementById('w-desc'); if (el) el.textContent = 'Stockholm \u00B7 d\u00E9but avril';
    var fe = document.getElementById('w-forecast');
    if (fe) fe.innerHTML =
      '<div class="weather-day"><div class="weather-day-label">Ven 3</div><div class="weather-day-icon">\uD83C\uDF24\uFE0F</div><div class="weather-day-temp">5\u00B0</div></div>' +
      '<div class="weather-day"><div class="weather-day-label">Sam 4</div><div class="weather-day-icon">\u2601\uFE0F</div><div class="weather-day-temp">7\u00B0</div></div>' +
      '<div class="weather-day"><div class="weather-day-label">Dim 5</div><div class="weather-day-icon">\uD83C\uDF26\uFE0F</div><div class="weather-day-temp">6\u00B0</div></div>' +
      '<div class="weather-day"><div class="weather-day-label">Lun 6</div><div class="weather-day-icon">\u26C5</div><div class="weather-day-temp">8\u00B0</div></div>' +
      '<div class="weather-day"><div class="weather-day-label">Mar 7</div><div class="weather-day-icon">\uD83C\uDF24\uFE0F</div><div class="weather-day-temp">9\u00B0</div></div>';
  }
}

// ══════════════════════════════════
// FAVORITES
// ══════════════════════════════════
function toggleFav(btn, name, type) {
  var idx = favorites.findIndex(function(f) { return f.name === name; });
  if (idx > -1) {
    favorites.splice(idx, 1);
    btn.classList.remove('saved');
  } else {
    favorites.push({ name: name, type: type, saved: new Date().toISOString() });
    btn.classList.add('saved');
    btn.style.transform = 'scale(1.35)';
    setTimeout(function() { btn.style.transform = ''; }, 200);
  }
  localStorage.setItem('stockholm-favs', JSON.stringify(favorites));
  var fc = document.getElementById('fav-count');
  if (fc) fc.textContent = favorites.length + ' lieu' + (favorites.length !== 1 ? 'x' : '');
}

function renderFavorites() {
  var list = document.getElementById('fav-list');
  var countEl = document.getElementById('fav-count');
  if (countEl) countEl.textContent = favorites.length + ' lieu' + (favorites.length !== 1 ? 'x' : '');
  if (!list) return;
  if (!favorites.length) {
    list.innerHTML = '<div class="empty-state"><div class="empty-icon">\u2661</div><div class="empty-title">Vos coups de c\u0153ur</div><div class="empty-sub">Appuyez sur \u2661 sur un restaurant pour le sauvegarder ici.</div></div>';
    return;
  }
  var tl = { brunch:'Brunch', lunch:'D\u00E9jeuner', dinner:'D\u00EEner', place:'Lieu' };
  list.innerHTML = '<div style="padding:0 16px;display:flex;flex-direction:column;gap:10px;padding-bottom:16px;">' +
    favorites.map(function(f) {
      return '<div style="background:var(--surface);border-radius:var(--radius-sm);border:1px solid rgba(199,180,160,0.2);padding:16px 18px;display:flex;align-items:center;justify-content:space-between;gap:12px;">'
        + '<div><div style="font-size:10px;letter-spacing:0.1em;text-transform:uppercase;color:var(--accent);font-weight:500;margin-bottom:4px;">' + (tl[f.type] || f.type) + '</div>'
        + '<div style="font-family:var(--serif);font-size:18px;font-weight:400;">' + f.name + '</div></div>'
        + '<div style="color:var(--highlight);font-size:20px;">\u2665</div></div>';
    }).join('') + '</div>';
}

function restoreFavStates() {
  favorites.forEach(function(f) {
    document.querySelectorAll('.icon-btn.fav').forEach(function(btn) {
      var c = btn.closest('.option-item-photo') || btn.closest('.option-item');
      if (!c) return;
      var n = c.querySelector('.option-photo-name') || c.querySelector('.option-name');
      if (n && n.textContent.trim() === f.name) btn.classList.add('saved');
    });
  });
}


// ══════════════════════════════════
// CHANGER UNE PHOTO (universel)
// ══════════════════════════════════
function changePhoto(btnOrEl, key) {
  var input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';
  input.style.display = 'none';
  document.body.appendChild(input);
  input.onchange = function() {
    var file = input.files[0];
    document.body.removeChild(input);
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function(e) {
      var img = new Image();
      img.onload = function() {
        var canvas = document.createElement('canvas');
        var MAX = 1200, w = img.width, h = img.height;
        if (w > MAX) { h = Math.round(h*MAX/w); w = MAX; }
        if (h > MAX) { w = Math.round(w*MAX/h); h = MAX; }
        canvas.width = w; canvas.height = h;
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
        var b64 = canvas.toDataURL('image/jpeg', 0.82);
        try { localStorage.setItem('photo-' + key, b64); } catch(e) { console.log('Storage full:', e); }
        var target = document.getElementById(key);
        if (target) target.style.backgroundImage = 'url(' + b64 + ')';
        showToast('\u2713 Photo mise \u00E0 jour');
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  };
  input.click();
}

function restoreAllPhotos() {
  for (var i = 0; i < localStorage.length; i++) {
    var k = localStorage.key(i);
    if (!k || !k.startsWith('photo-')) continue;
    var id = k.replace('photo-', '');
    var b64 = localStorage.getItem(k);
    if (!b64) continue;
    var el = document.getElementById(id);
    if (el) el.style.backgroundImage = 'url(' + b64 + ')';
  }
}

// ══════════════════════════════════
// PHOTOS DES JOURS
// ══════════════════════════════════
function initDayPhotoEdit() {
  // Les photos sont restaurées par restoreAllPhotos() au DOMContentLoaded
  // DAY_PHOTO_KEYS conservé pour compatibilité avec anciennes données
  Object.keys(DAY_PHOTO_KEYS).forEach(function(day) {
    var saved = localStorage.getItem(DAY_PHOTO_KEYS[day]);
    if (saved) applyDayPhoto(day, saved);
  });
}

function triggerDayPhotoChange(day) {
  var input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';
  input.style.display = 'none';
  document.body.appendChild(input);
  input.onchange = function() {
    var file = input.files[0];
    document.body.removeChild(input);
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function(e) {
      var img = new Image();
      img.onload = function() {
        var canvas = document.createElement('canvas');
        var MAX = 1200, w = img.width, h = img.height;
        if (w > MAX) { h = Math.round(h*MAX/w); w = MAX; }
        if (h > MAX) { w = Math.round(w*MAX/h); h = MAX; }
        canvas.width = w; canvas.height = h;
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
        var b64 = canvas.toDataURL('image/jpeg', 0.82);
        try { localStorage.setItem(DAY_PHOTO_KEYS[day], b64); } catch(e) { console.log('Storage full'); }
        applyDayPhoto(day, b64);
        showToast('\u2713 Photo mise \u00E0 jour');
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  };
  input.click();
}

function applyDayPhoto(day, b64) {
  var bg = document.querySelector('#page-' + day + ' .day-hero-bg');
  if (bg) bg.style.backgroundImage = 'url(' + b64 + ')';
}

function showToast(msg) {
  var t = document.getElementById('app-toast');
  if (!t) {
    t = document.createElement('div');
    t.id = 'app-toast';
    t.style.cssText = 'position:fixed;top:calc(env(safe-area-inset-top,0px)+16px);left:50%;'
      + 'transform:translateX(-50%);background:rgba(29,29,27,0.92);color:#F6F2EC;'
      + 'font-size:13px;font-weight:500;padding:10px 20px;border-radius:100px;z-index:500;'
      + 'backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);'
      + 'transition:opacity 0.4s;font-family:var(--sans);white-space:nowrap;pointer-events:none;';
    document.body.appendChild(t);
  }
  t.textContent = msg;
  t.style.opacity = '1';
  clearTimeout(t._tm);
  t._tm = setTimeout(function() { t.style.opacity = '0'; }, 2500);
}

// ══════════════════════════════════
// CUSTOM STEPS — injectés dans timeline
// ══════════════════════════════════
async function loadCustomSteps() {
  var data = await sbFetch(SB_TABLE + '?order=created_at.asc');
  if (data && Array.isArray(data)) {
    customSteps = data;
    try { localStorage.setItem('custom_steps_cache', JSON.stringify(customSteps)); } catch(e) {}
  } else {
    customSteps = JSON.parse(localStorage.getItem('custom_steps_cache') || '[]');
  }
  renderAllCustomSteps();
  setTimeout(loadCustomSteps, 30000);
}

function timeToMin(t) {
  if (!t) return 9999;
  var p = t.split(':');
  return parseInt(p[0],10)*60 + (parseInt(p[1],10)||0);
}

function renderAllCustomSteps() {
  ['arrival','day1','day2','day3','day4'].forEach(function(day) {
    renderCustomStepsForDay(day);
  });
  updateSyncBadge();
}

function renderCustomStepsForDay(day) {
  var tl = document.getElementById('timeline-' + day);
  if (!tl) return;

  // Retirer les cartes custom précédemment injectées
  tl.querySelectorAll('.custom-injected').forEach(function(el) { el.remove(); });

  var steps = customSteps.filter(function(s) { return s.day === day; });
  if (!steps.length) return;

  var existing = Array.from(tl.querySelectorAll('.timeline-item:not(.custom-injected)'));

  steps.forEach(function(step) {
    var sm = timeToMin(step.time);
    var insertBefore = null;
    for (var i = 0; i < existing.length; i++) {
      var te = existing[i].querySelector('.timeline-time');
      if (te && timeToMin(te.textContent.trim()) > sm) {
        insertBefore = existing[i];
        break;
      }
    }
    var card = buildCustomItem(step);
    if (insertBefore) tl.insertBefore(card, insertBefore);
    else tl.appendChild(card);
  });
}

function buildCustomItem(step) {
  var wrap = document.createElement('div');
  wrap.className = 'timeline-item custom-injected';

  var typeMap = {
    restaurant:'\uD83C\uDF7D Restaurant', brunch:'\u2615 Brunch', visit:'\uD83C\uDFDB Visite',
    walk:'\uD83D\uDEB6 Balade', wellness:'\uD83E\uDDD6 Wellness', shopping:'\uD83D\uDECD Shopping',
    bar:'\uD83C\uDF78 Bar', other:'\u2746 Autre'
  };

  var mapsUrl = 'https://maps.google.com/?q=' + encodeURIComponent((step.address || step.name) + ' Stockholm');
  var photoHtml = step.photo
    ? '<div style="margin:-16px -18px 14px;height:120px;background:url(\'' + step.photo + '\') center/cover;border-radius:12px 12px 0 0;"></div>'
    : '';
  var noteHtml = step.note ? '<div class="event-note">' + step.note + '</div>' : '';
  var addrHtml = step.address
    ? '<a class="map-btn" href="' + mapsUrl + '" target="_blank"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>' + step.address + '</a>'
    : '';

  wrap.innerHTML =
    '<div class="timeline-left">'
      + '<div class="timeline-time">' + (step.time || '') + '</div>'
      + '<div class="timeline-line"></div>'
    + '</div>'
    + '<div class="timeline-dot" style="background:var(--highlight);box-shadow:0 0 0 1px var(--highlight);"></div>'
    + '<div class="event-card" style="border-left:2px solid rgba(198,181,154,0.5);position:relative;">'
      + '<div style="position:absolute;top:10px;right:10px;display:flex;gap:5px;">'
        + '<a href="' + mapsUrl + '" target="_blank" class="icon-btn" title="Maps"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg></a>'
        + '<button class="icon-btn" onclick="openEditStep(\'' + step.id + '\')" title="Modifier" style="color:var(--accent-dark);"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>'
        + '<button class="icon-btn" onclick="deleteStep(\'' + step.id + '\')" title="Supprimer" style="color:#b85c50;"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/></svg></button>'
      + '</div>'
      + photoHtml
      + '<div class="event-type-tag" style="background:rgba(198,181,154,0.15);color:var(--highlight);">' + (typeMap[step.type] || '\u2746') + '</div>'
      + '<div class="event-title">' + step.name + '</div>'
      + noteHtml
      + addrHtml
    + '</div>';

  return wrap;
}

function updateSyncBadge() {
  var el = document.getElementById('sync-status');
  if (!el) return;
  if (customSteps.length > 0) {
    el.style.display = 'block';
    el.textContent = '\u2746 ' + customSteps.length + ' ajout' + (customSteps.length > 1 ? 's' : '') + ' partag\u00E9' + (customSteps.length > 1 ? 's' : '') + ' avec Lucie';
  } else {
    el.style.display = 'none';
  }
}

async function deleteStep(id) {
  if (!confirm('Supprimer cette \u00E9tape ?')) return;
  await sbFetch(SB_TABLE + '?id=eq.' + id, 'DELETE');
  customSteps = customSteps.filter(function(s) { return s.id !== id; });
  try { localStorage.setItem('custom_steps_cache', JSON.stringify(customSteps)); } catch(e) {}
  renderAllCustomSteps();
}

// ══════════════════════════════════
// MODAL AJOUTER / MODIFIER
// ══════════════════════════════════
function openEditModal() {
  editingStepId = null; // reset mode to "add" par défaut
  var modal = document.getElementById('edit-modal');
  if (!modal) return;
  var titleEl = document.querySelector('#edit-modal > div:first-child > div:first-child');
  if (titleEl) titleEl.textContent = 'Ajouter une \u00E9tape';
  var btn = document.getElementById('submit-btn');
  if (btn) btn.textContent = "Ajouter \u00E0 l'itin\u00E9raire";
  modal.style.display = 'flex';
  document.body.style.overflow = 'hidden';
  var daySelect = document.getElementById('new-day');
  if (daySelect && ['arrival','day1','day2','day3','day4'].indexOf(currentPage) > -1) {
    daySelect.value = currentPage;
  }
}

function closeEditModal() {
  editingStepId = null;
  var modal = document.getElementById('edit-modal');
  if (!modal) return;
  modal.style.display = 'none';
  document.body.style.overflow = '';
  ['new-name','new-address','new-note'].forEach(function(id) {
    var el = document.getElementById(id); if (el) el.value = '';
  });
  document.getElementById('new-time').value = '';
  var pp = document.getElementById('photo-preview'); if (pp) pp.style.backgroundImage = '';
  var st = document.getElementById('submit-status'); if (st) st.style.display = 'none';
  var mp = document.getElementById('maps-preview'); if (mp) mp.style.display = 'none';
  selectedPhotoBase64 = null;
}

function openEditStep(id) {
  var step = customSteps.find(function(s) { return s.id === id; });
  if (!step) return;
  editingStepId = id;
  document.getElementById('new-name').value    = step.name    || '';
  document.getElementById('new-address').value = step.address || '';
  document.getElementById('new-type').value    = step.type    || 'restaurant';
  document.getElementById('new-day').value     = step.day     || 'day1';
  document.getElementById('new-time').value    = step.time    || '';
  document.getElementById('new-note').value    = step.note    || '';
  if (step.photo) {
    var pp = document.getElementById('photo-preview');
    if (pp) pp.style.backgroundImage = 'url(' + step.photo + ')';
    selectedPhotoBase64 = step.photo;
  }
  var modal = document.getElementById('edit-modal');
  if (!modal) return;
  var titleEl = document.querySelector('#edit-modal > div:first-child > div:first-child');
  if (titleEl) titleEl.textContent = "Modifier l'\u00E9tape";
  var btn = document.getElementById('submit-btn');
  if (btn) btn.textContent = 'Enregistrer';
  modal.style.display = 'flex';
  document.body.style.overflow = 'hidden';
}

function handlePhotoSelect(input) {
  var file = input.files[0];
  if (!file) return;
  var reader = new FileReader();
  reader.onload = function(e) {
    var img = new Image();
    img.onload = function() {
      var canvas = document.createElement('canvas');
      var MAX = 800, w = img.width, h = img.height;
      if (w > MAX) { h = Math.round(h*MAX/w); w = MAX; }
      if (h > MAX) { w = Math.round(w*MAX/h); h = MAX; }
      canvas.width = w; canvas.height = h;
      canvas.getContext('2d').drawImage(img, 0, 0, w, h);
      selectedPhotoBase64 = canvas.toDataURL('image/jpeg', 0.75);
      var pp = document.getElementById('photo-preview');
      if (pp) pp.style.backgroundImage = 'url(' + selectedPhotoBase64 + ')';
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

function updateMapsPreview() {
  var val = document.getElementById('new-address').value.trim();
  var preview = document.getElementById('maps-preview');
  var link = document.getElementById('maps-preview-link');
  if (!preview || !link) return;
  if (val.length > 3) {
    link.href = 'https://maps.google.com/?q=' + encodeURIComponent(val);
    preview.style.display = 'block';
  } else {
    preview.style.display = 'none';
  }
}

async function submitNewStep() {
  var name = document.getElementById('new-name').value.trim();
  if (!name) { alert('Ajoute un nom'); return; }
  var btn = document.getElementById('submit-btn');
  var status = document.getElementById('submit-status');
  btn.disabled = true;

  if (editingStepId) {
    // ── ÉDITION ──
    btn.textContent = 'Enregistrement\u2026';
    var cur = customSteps.find(function(s) { return s.id === editingStepId; });
    var upd = {
      id: editingStepId,
      name: name,
      address: document.getElementById('new-address').value.trim(),
      type:    document.getElementById('new-type').value,
      day:     document.getElementById('new-day').value,
      time:    document.getElementById('new-time').value,
      note:    document.getElementById('new-note').value.trim(),
      photo:   selectedPhotoBase64 || (cur ? cur.photo : null) || null,
      created_at: (cur ? cur.created_at : null) || new Date().toISOString()
    };
    await sbFetch(SB_TABLE + '?id=eq.' + editingStepId, 'DELETE');
    await sbFetch(SB_TABLE, 'POST', upd);
    var i = customSteps.findIndex(function(s) { return s.id === editingStepId; });
    if (i > -1) customSteps[i] = upd;
    try { localStorage.setItem('custom_steps_cache', JSON.stringify(customSteps)); } catch(e) {}
    renderAllCustomSteps();
    status.textContent = '\u2713 Synchronis\u00E9 avec Lucie';
    status.style.display = 'block';
    btn.disabled = false;
    btn.textContent = 'Enregistrer';
    var td = upd.day;
    setTimeout(function() { closeEditModal(); showDay(td); }, 800);

  } else {
    // ── AJOUT ──
    btn.textContent = 'Ajout\u2026';
    var step = {
      id: Date.now().toString(),
      name: name,
      address: document.getElementById('new-address').value.trim(),
      type:    document.getElementById('new-type').value,
      day:     document.getElementById('new-day').value,
      time:    document.getElementById('new-time').value,
      note:    document.getElementById('new-note').value.trim(),
      photo:   selectedPhotoBase64 || null,
      created_at: new Date().toISOString()
    };
    var result = await sbFetch(SB_TABLE, 'POST', step);
    customSteps.push(step);
    try { localStorage.setItem('custom_steps_cache', JSON.stringify(customSteps)); } catch(e) {}
    renderAllCustomSteps();
    status.textContent = result ? '\u2713 Synchronis\u00E9 avec Lucie !' : '\u2713 Ajout\u00E9 en local';
    status.style.display = 'block';
    btn.disabled = false;
    btn.textContent = "Ajouter \u00E0 l'itin\u00E9raire";
    var td2 = step.day;
    setTimeout(function() { closeEditModal(); showDay(td2); }, 800);
  }
}

// ══════════════════════════════════
// INSTALL BANNER
// ══════════════════════════════════
function checkInstallPrompt() {
  var isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
  if (isIOS && !window.navigator.standalone && !localStorage.getItem('install-dismissed')) {
    setTimeout(function() {
      var b = document.getElementById('install-banner');
      if (b) b.classList.add('visible');
    }, 3000);
  }
}

function dismissInstall() {
  var b = document.getElementById('install-banner');
  if (b) b.classList.remove('visible');
  localStorage.setItem('install-dismissed', '1');
}

// ══════════════════════════════════
// INIT
// ══════════════════════════════════
document.addEventListener('DOMContentLoaded', function() {
  showPage('home');
  loadWeather();
  checkInstallPrompt();
  restoreFavStates();
  loadCustomSteps();
  initDayPhotoEdit();
  restoreAllPhotos();
  var fc = document.getElementById('fav-count');
  if (fc) fc.textContent = favorites.length + ' lieu' + (favorites.length !== 1 ? 'x' : '');
});

// SW disabled
