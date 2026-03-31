// Kill any old service workers and caches immediately
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then(regs => regs.forEach(r => r.unregister()));
  caches.keys().then(keys => keys.forEach(k => caches.delete(k)));
}

// ══════════════════════════════════
// SUPABASE CONFIG
// ══════════════════════════════════
const SB_URL = 'https://tuarjmzjvnhmnpfkxcbo.supabase.co';
const SB_KEY = 'sb_publishable_GVl8wU8THUveLkWRiKB4Rg_MhBT7J_3';
const SB_TABLE = 'stockholm_steps';

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
  } catch(e) { console.log('SB error:', e); return null; }
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
  arrival: 'photo-override-arrival',
  day1:    'photo-override-day1',
  day2:    'photo-override-day2',
  day3:    'photo-override-day3',
  day4:    'photo-override-day4'
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
// WEATHER — dates exactes 3-7 avril
// ══════════════════════════════════
function openWeather() {
  window.location.href = 'weather://';
  setTimeout(function() {
    window.open('https://weather.com/weather/today/l/59.3293,18.0686', '_blank');
  }, 400);
}

function weatherIcon(code) {
  if (code === 0) return '\u2600\uFE0F';
  if (code <= 2) return '\uD83C\uDF24';
  if (code <= 3) return '\u2601\uFE0F';
  if (code <= 48) return '\uD83C\uDF2B';
  if (code <= 67) return '\uD83C\uDF27';
  if (code <= 77) return '\uD83C\uDF28';
  if (code <= 82) return '\uD83C\uDF26';
  if (code <= 99) return '\u26C8';
  return '\uD83C\uDF24';
}

function weatherDesc(code) {
  if (code === 0) return 'Ciel dégagé';
  if (code <= 2) return 'Partiellement nuageux';
  if (code <= 3) return 'Couvert';
  if (code <= 48) return 'Brumeux';
  if (code <= 67) return 'Pluvieux';
  if (code <= 77) return 'Neigeux';
  if (code <= 82) return 'Averses';
  if (code <= 99) return 'Orageux';
  return 'Variable';
}

async function loadWeather() {
  // Open-Meteo : on demande les 16 prochains jours et on filtre 3-7 avril
  var url = 'https://api.open-meteo.com/v1/forecast'
    + '?latitude=59.3293&longitude=18.0686'
    + '&daily=temperature_2m_max,temperature_2m_min,weathercode'
    + '&timezone=Europe/Stockholm'
    + '&forecast_days=16';

  try {
    var res = await fetch(url);
    if (!res.ok) throw new Error('API error');
    var data = await res.json();

    var days = data.daily;
    var targets = ['2026-04-03','2026-04-04','2026-04-05','2026-04-06','2026-04-07'];
    var labels  = ['Ven','Sam','Dim','Lun','Mar'];
    var dayTempIds = [null,'day1-temp','day2-temp','day3-temp','day4-temp'];

    // Trouver l'index de chaque date cible dans le tableau renvoyé
    var indices = targets.map(function(t) { return days.time.indexOf(t); });

    var forecastEl = document.getElementById('w-forecast');
    if (forecastEl) forecastEl.innerHTML = '';

    var firstValidIdx = -1;
    for (var i = 0; i < indices.length; i++) {
      var di = indices[i];
      var label = labels[i];

      if (di === -1) {
        // Date pas encore dans la plage de prévision — afficher placeholder
        if (forecastEl) {
          var d = document.createElement('div');
          d.className = 'weather-day';
          d.innerHTML = '<div class="weather-day-label">' + label + '</div>'
            + '<div class="weather-day-icon" style="font-size:14px;opacity:0.4">—</div>'
            + '<div class="weather-day-temp" style="opacity:0.4">?°</div>';
          forecastEl.appendChild(d);
        }
        continue;
      }

      if (firstValidIdx === -1) firstValidIdx = i;
      var maxT = Math.round(days.temperature_2m_max[di]);
      var wc   = days.weathercode[di];

      if (forecastEl) {
        var d = document.createElement('div');
        d.className = 'weather-day';
        d.innerHTML = '<div class="weather-day-label">' + label + '</div>'
          + '<div class="weather-day-icon">' + weatherIcon(wc) + '</div>'
          + '<div class="weather-day-temp">' + maxT + '°</div>';
        forecastEl.appendChild(d);
      }

      // Mettre à jour temp sur la page du jour
      if (i >= 1 && dayTempIds[i]) {
        var el = document.getElementById(dayTempIds[i]);
        if (el) el.textContent = maxT + '°C';
      }
    }

    // Widget principal : premier jour valide, sinon 4 avril
    var mainIdx = firstValidIdx > -1 ? indices[firstValidIdx] : indices[1];
    if (mainIdx > -1) {
      var mc = days.weathercode[mainIdx];
      var mt = Math.round(days.temperature_2m_max[mainIdx]);
      var iconEl = document.getElementById('w-icon');
      var tempEl = document.getElementById('w-temp');
      var descEl = document.getElementById('w-desc');
      if (iconEl) iconEl.textContent = weatherIcon(mc);
      if (tempEl) tempEl.textContent = mt + '°C';
      if (descEl) descEl.textContent = weatherDesc(mc) + ' · Stockholm avril';
    } else {
      // Prévisions pas encore dispos (voyage dans +16j)
      var iconEl = document.getElementById('w-icon');
      var tempEl = document.getElementById('w-temp');
      var descEl = document.getElementById('w-desc');
      if (iconEl) iconEl.textContent = '\uD83C\uDF24';
      if (tempEl) tempEl.textContent = '~7°C';
      if (descEl) descEl.textContent = 'Prévisions disponibles à J-14 · Stockholm avril';
    }

  } catch(e) {
    console.log('Weather error:', e);
    var iconEl = document.getElementById('w-icon');
    var tempEl = document.getElementById('w-temp');
    var descEl = document.getElementById('w-desc');
    if (iconEl) iconEl.textContent = '\uD83C\uDF24';
    if (tempEl) tempEl.textContent = '~7°C';
    if (descEl) descEl.textContent = 'Stockholm · début avril';
    var forecastEl = document.getElementById('w-forecast');
    if (forecastEl) {
      forecastEl.innerHTML =
        '<div class="weather-day"><div class="weather-day-label">Ven</div><div class="weather-day-icon">\uD83C\uDF24</div><div class="weather-day-temp">5°</div></div>' +
        '<div class="weather-day"><div class="weather-day-label">Sam</div><div class="weather-day-icon">\u2601\uFE0F</div><div class="weather-day-temp">7°</div></div>' +
        '<div class="weather-day"><div class="weather-day-label">Dim</div><div class="weather-day-icon">\uD83C\uDF26</div><div class="weather-day-temp">6°</div></div>' +
        '<div class="weather-day"><div class="weather-day-label">Lun</div><div class="weather-day-icon">\u26C5</div><div class="weather-day-temp">8°</div></div>' +
        '<div class="weather-day"><div class="weather-day-label">Mar</div><div class="weather-day-icon">\uD83C\uDF24</div><div class="weather-day-temp">9°</div></div>';
    }
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
  if (favorites.length === 0) {
    list.innerHTML = '<div class="empty-state"><div class="empty-icon">\u2661</div><div class="empty-title">Vos coups de cœur</div><div class="empty-sub">Appuyez sur \u2661 sur un restaurant ou lieu pour le sauvegarder ici.</div></div>';
    return;
  }
  var typeLabels = { brunch:'Brunch', lunch:'Déjeuner', dinner:'Dîner', place:'Lieu' };
  list.innerHTML = '<div style="padding:0 16px;display:flex;flex-direction:column;gap:10px;padding-bottom:16px;">' +
    favorites.map(function(f) {
      return '<div style="background:var(--surface);border-radius:var(--radius-sm);border:1px solid rgba(199,180,160,0.2);padding:16px 18px;display:flex;align-items:center;justify-content:space-between;gap:12px;">' +
        '<div><div style="font-size:10px;letter-spacing:0.1em;text-transform:uppercase;color:var(--accent);font-weight:500;margin-bottom:4px;">' + (typeLabels[f.type] || f.type) + '</div>' +
        '<div style="font-family:var(--serif);font-size:18px;font-weight:400;color:var(--text);">' + f.name + '</div></div>' +
        '<div style="color:var(--highlight);font-size:20px;">\u2665</div></div>';
    }).join('') + '</div>';
}

function restoreFavStates() {
  favorites.forEach(function(f) {
    document.querySelectorAll('.icon-btn.fav').forEach(function(btn) {
      var closest = btn.closest('.option-item-photo') || btn.closest('.option-item');
      if (!closest) return;
      var nameEl = closest.querySelector('.option-photo-name') || closest.querySelector('.option-name');
      if (nameEl && nameEl.textContent.trim() === f.name) btn.classList.add('saved');
    });
  });
}

// ══════════════════════════════════
// PHOTOS DES JOURS — bouton explicite
// ══════════════════════════════════
function initDayPhotoEdit() {
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
    if (!file) { document.body.removeChild(input); return; }
    var reader = new FileReader();
    reader.onload = function(e) {
      var img = new Image();
      img.onload = function() {
        var canvas = document.createElement('canvas');
        var MAX = 1200;
        var w = img.width, h = img.height;
        if (w > MAX) { h = Math.round(h * MAX / w); w = MAX; }
        if (h > MAX) { w = Math.round(w * MAX / h); h = MAX; }
        canvas.width = w; canvas.height = h;
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
        var b64 = canvas.toDataURL('image/jpeg', 0.82);
        localStorage.setItem(DAY_PHOTO_KEYS[day], b64);
        applyDayPhoto(day, b64);
        showToast('\u2713 Photo mise à jour');
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
    document.body.removeChild(input);
  };
  input.click();
}

function applyDayPhoto(day, b64) {
  var bg = document.querySelector('#page-' + day + ' .day-hero-bg');
  if (bg) bg.style.backgroundImage = 'url(' + b64 + ')';
}

function showToast(msg) {
  var toast = document.getElementById('app-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'app-toast';
    toast.style.cssText = 'position:fixed;top:calc(env(safe-area-inset-top,0px)+16px);left:50%;transform:translateX(-50%);background:rgba(29,29,27,0.92);color:#F6F2EC;font-size:13px;font-weight:500;padding:10px 20px;border-radius:100px;z-index:500;backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);transition:opacity 0.3s;font-family:var(--sans);letter-spacing:0.03em;white-space:nowrap;pointer-events:none;';
    document.body.appendChild(toast);
  }
  toast.textContent = msg;
  toast.style.opacity = '1';
  clearTimeout(toast._t);
  toast._t = setTimeout(function() { toast.style.opacity = '0'; }, 2500);
}

// ══════════════════════════════════
// CUSTOM STEPS — injection dans timeline
// ══════════════════════════════════
async function loadCustomSteps() {
  var data = await sbFetch(SB_TABLE + '?order=created_at.asc');
  if (data && data.length >= 0) {
    customSteps = data;
    localStorage.setItem('custom_steps_cache', JSON.stringify(customSteps));
  } else {
    customSteps = JSON.parse(localStorage.getItem('custom_steps_cache') || '[]');
  }
  renderAllCustomSteps();
  setTimeout(loadCustomSteps, 30000);
}

// Convertit "HH:MM" en nombre de minutes pour tri
function timeToMinutes(t) {
  if (!t) return 9999;
  var parts = t.split(':');
  return parseInt(parts[0], 10) * 60 + (parseInt(parts[1], 10) || 0);
}

function renderAllCustomSteps() {
  ['arrival','day1','day2','day3','day4'].forEach(function(day) {
    renderCustomStepsForDay(day);
  });
  updateSyncBadge();
}

function renderCustomStepsForDay(day) {
  var timeline = document.getElementById('timeline-' + day);
  if (!timeline) return;

  // Supprimer les anciennes cartes custom injectées
  timeline.querySelectorAll('.custom-injected').forEach(function(el) { el.remove(); });

  var daySteps = customSteps.filter(function(s) { return s.day === day; });
  if (daySteps.length === 0) return;

  // Récupérer tous les timeline-items existants avec leur heure
  var existingItems = Array.from(timeline.querySelectorAll('.timeline-item'));

  daySteps.forEach(function(step) {
    var stepMinutes = timeToMinutes(step.time);

    // Trouver le bon endroit dans la timeline
    // On cherche le dernier item existant dont l'heure est <= heure du step
    var insertBefore = null;
    for (var i = 0; i < existingItems.length; i++) {
      var timeEl = existingItems[i].querySelector('.timeline-time');
      if (!timeEl) continue;
      var existingMins = timeToMinutes(timeEl.textContent.trim());
      if (existingMins > stepMinutes) {
        insertBefore = existingItems[i];
        break;
      }
    }

    var card = buildCustomTimelineItem(step);
    if (insertBefore) {
      timeline.insertBefore(card, insertBefore);
    } else {
      timeline.appendChild(card);
    }
  });
}

function buildCustomTimelineItem(step) {
  var wrapper = document.createElement('div');
  wrapper.className = 'timeline-item custom-injected';

  var typeLabels = {
    restaurant:'\uD83C\uDF7D Restaurant', brunch:'\u2615 Brunch', visit:'\uD83C\uDFDB Visite',
    walk:'\uD83D\uDEB6 Balade', wellness:'\uD83E\uDDD6 Wellness', shopping:'\uD83D\uDECD Shopping',
    bar:'\uD83C\uDF78 Bar', other:'\u2746 Autre'
  };

  var mapsUrl = 'https://maps.google.com/?q=' + encodeURIComponent((step.address || step.name) + ' Stockholm');
  var timeDisplay = step.time || '';
  var photoHtml = '';
  if (step.photo) {
    photoHtml = '<div style="margin:-16px -18px 14px;height:120px;background:url(' + step.photo + ') center/cover;border-radius:12px 12px 0 0;"></div>';
  }
  var noteHtml = step.note ? '<div class="event-note">' + step.note + '</div>' : '';

  wrapper.innerHTML =
    '<div class="timeline-left">' +
      '<div class="timeline-time">' + timeDisplay + '</div>' +
      '<div class="timeline-line"></div>' +
    '</div>' +
    '<div class="timeline-dot" style="background:var(--highlight);box-shadow:0 0 0 1px var(--highlight);"></div>' +
    '<div class="event-card" style="border-left:2px solid var(--highlight);position:relative;">' +
      '<div style="position:absolute;top:12px;right:12px;display:flex;gap:6px;">' +
        '<a href="' + mapsUrl + '" target="_blank" class="icon-btn" title="Maps">' +
          '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>' +
        '</a>' +
        '<button class="icon-btn" onclick="openEditStep(\'' + step.id + '\')" title="Modifier" style="color:var(--accent-dark);">' +
          '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>' +
        '</button>' +
        '<button class="icon-btn" onclick="deleteStep(\'' + step.id + '\')" title="Supprimer" style="color:#c0695a;">' +
          '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/></svg>' +
        '</button>' +
      '</div>' +
      photoHtml +
      '<div class="event-type-tag" style="background:rgba(198,181,154,0.18);color:var(--highlight);">' + (typeLabels[step.type] || '\u2746') + '</div>' +
      '<div class="event-title">' + step.name + '</div>' +
      noteHtml +
      (step.address ? '<a class="map-btn" href="' + mapsUrl + '" target="_blank">' +
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>' +
        step.address + '</a>' : '') +
    '</div>';

  return wrapper;
}

function updateSyncBadge() {
  var el = document.getElementById('sync-status');
  if (!el) return;
  if (customSteps.length > 0) {
    el.style.display = 'block';
    el.textContent = '\u2746 ' + customSteps.length + ' ajout' + (customSteps.length > 1 ? 's' : '') + ' partagé' + (customSteps.length > 1 ? 's' : '') + ' avec Lucie';
  } else {
    el.style.display = 'none';
  }
}

async function deleteStep(id) {
  if (!confirm('Supprimer cette étape ?')) return;
  await sbFetch(SB_TABLE + '?id=eq.' + id, 'DELETE');
  customSteps = customSteps.filter(function(s) { return s.id !== id; });
  localStorage.setItem('custom_steps_cache', JSON.stringify(customSteps));
  renderAllCustomSteps();
}

// ══════════════════════════════════
// MODAL AJOUTER / MODIFIER
// ══════════════════════════════════
function openEditModal() {
  var modal = document.getElementById('edit-modal');
  if (!modal) return;
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
  document.getElementById('new-name').value = '';
  document.getElementById('new-address').value = '';
  document.getElementById('new-note').value = '';
  document.getElementById('new-time').value = '';
  var preview = document.getElementById('photo-preview');
  if (preview) preview.style.backgroundImage = '';
  var status = document.getElementById('submit-status');
  if (status) status.style.display = 'none';
  selectedPhotoBase64 = null;
  var titleEl = document.querySelector('#edit-modal > div:first-child > div:first-child');
  if (titleEl) titleEl.textContent = 'Ajouter une étape';
  var btn = document.getElementById('submit-btn');
  if (btn) btn.textContent = "Ajouter à l'itinéraire";
}

function openEditStep(id) {
  var step = customSteps.find(function(s) { return s.id === id; });
  if (!step) return;
  editingStepId = id;
  document.getElementById('new-name').value = step.name || '';
  document.getElementById('new-address').value = step.address || '';
  document.getElementById('new-type').value = step.type || 'restaurant';
  document.getElementById('new-day').value = step.day || 'day1';
  document.getElementById('new-time').value = step.time || '';
  document.getElementById('new-note').value = step.note || '';
  if (step.photo) {
    document.getElementById('photo-preview').style.backgroundImage = 'url(' + step.photo + ')';
    selectedPhotoBase64 = step.photo;
  }
  var titleEl = document.querySelector('#edit-modal > div:first-child > div:first-child');
  if (titleEl) titleEl.textContent = "Modifier l'étape";
  var btn = document.getElementById('submit-btn');
  if (btn) btn.textContent = 'Enregistrer les modifications';
  openEditModal();
}

function handlePhotoSelect(input) {
  var file = input.files[0];
  if (!file) return;
  var reader = new FileReader();
  reader.onload = function(e) {
    var img = new Image();
    img.onload = function() {
      var canvas = document.createElement('canvas');
      var MAX = 800;
      var w = img.width, h = img.height;
      if (w > MAX) { h = Math.round(h * MAX / w); w = MAX; }
      if (h > MAX) { w = Math.round(w * MAX / h); h = MAX; }
      canvas.width = w; canvas.height = h;
      canvas.getContext('2d').drawImage(img, 0, 0, w, h);
      selectedPhotoBase64 = canvas.toDataURL('image/jpeg', 0.75);
      var preview = document.getElementById('photo-preview');
      if (preview) preview.style.backgroundImage = 'url(' + selectedPhotoBase64 + ')';
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
    btn.textContent = 'Enregistrement…';
    var currentStep = customSteps.find(function(s) { return s.id === editingStepId; });
    var updatedStep = {
      id: editingStepId,
      name: name,
      address: document.getElementById('new-address').value.trim(),
      type: document.getElementById('new-type').value,
      day: document.getElementById('new-day').value,
      time: document.getElementById('new-time').value,
      note: document.getElementById('new-note').value.trim(),
      photo: selectedPhotoBase64 || (currentStep ? currentStep.photo : null) || null,
      created_at: (currentStep ? currentStep.created_at : null) || new Date().toISOString()
    };
    await sbFetch(SB_TABLE + '?id=eq.' + editingStepId, 'DELETE');
    await sbFetch(SB_TABLE, 'POST', updatedStep);
    var idx = customSteps.findIndex(function(s) { return s.id === editingStepId; });
    if (idx > -1) customSteps[idx] = updatedStep;
    localStorage.setItem('custom_steps_cache', JSON.stringify(customSteps));
    renderAllCustomSteps();
    status.style.display = 'block';
    status.textContent = '\u2713 Modifié et synchronisé avec Lucie';
    btn.disabled = false;
    btn.textContent = 'Enregistrer les modifications';
    var targetDay = updatedStep.day;
    setTimeout(function() { closeEditModal(); showDay(targetDay); }, 900);

  } else {
    btn.textContent = 'Ajout en cours…';
    var step = {
      id: Date.now().toString(),
      name: name,
      address: document.getElementById('new-address').value.trim(),
      type: document.getElementById('new-type').value,
      day: document.getElementById('new-day').value,
      time: document.getElementById('new-time').value,
      note: document.getElementById('new-note').value.trim(),
      photo: selectedPhotoBase64 || null,
      created_at: new Date().toISOString()
    };
    var result = await sbFetch(SB_TABLE, 'POST', step);
    customSteps.push(step);
    localStorage.setItem('custom_steps_cache', JSON.stringify(customSteps));
    renderAllCustomSteps();
    status.style.display = 'block';
    status.textContent = result ? '\u2713 Synchronisé avec Lucie !' : '\u2713 Ajouté en local';
    btn.disabled = false;
    btn.textContent = "Ajouter à l'itinéraire";
    var targetDay2 = step.day;
    setTimeout(function() { closeEditModal(); showDay(targetDay2); }, 900);
  }
}

// ══════════════════════════════════
// INSTALL BANNER
// ══════════════════════════════════
function checkInstallPrompt() {
  var isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
  var isStandalone = window.navigator.standalone;
  var dismissed = localStorage.getItem('install-dismissed');
  if (isIOS && !isStandalone && !dismissed) {
    setTimeout(function() {
      var banner = document.getElementById('install-banner');
      if (banner) banner.classList.add('visible');
    }, 3000);
  }
}

function dismissInstall() {
  var banner = document.getElementById('install-banner');
  if (banner) banner.classList.remove('visible');
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
  var countEl = document.getElementById('fav-count');
  if (countEl) countEl.textContent = favorites.length + ' lieu' + (favorites.length !== 1 ? 'x' : '');
});

// SW disabled
