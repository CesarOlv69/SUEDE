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

async function sbFetch(path, method='GET', body=null) {
  const opts = {
    method,
    headers: {
      'apikey': SB_KEY,
      'Authorization': 'Bearer ' + SB_KEY,
      'Content-Type': 'application/json',
      'Prefer': method === 'POST' ? 'return=representation' : ''
    }
  };
  if (body) opts.body = JSON.stringify(body);
  try {
    const res = await fetch(SB_URL + '/rest/v1/' + path, opts);
    if (!res.ok) return null;
    const text = await res.text();
    return text ? JSON.parse(text) : [];
  } catch(e) { console.log('SB error:', e); return null; }
}

// ══════════════════════════════════
// STATE
// ══════════════════════════════════
let currentPage = 'home';
let prevPage = 'home';
let favorites = JSON.parse(localStorage.getItem('stockholm-favs') || '[]');
let customSteps = [];
let selectedPhotoBase64 = null;
let editingStepId = null;

const DAY_PHOTO_KEYS = {
  arrival: 'photo-override-arrival',
  day1:    'photo-override-day1',
  day2:    'photo-override-day2',
  day3:    'photo-override-day3',
  day4:    'photo-override-day4',
};

// ══════════════════════════════════
// NAVIGATION
// ══════════════════════════════════
function showPage(id) {
  document.querySelectorAll('.page').forEach(p => {
    p.classList.remove('active');
    p.style.display = 'none';
  });
  const el = document.getElementById('page-' + id);
  if (el) {
    el.style.display = 'block';
    setTimeout(() => el.classList.add('active'), 10);
    window.scrollTo(0, 0);
  }
}

function navigate(tab) {
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  const btn = document.getElementById('nav-' + tab);
  if (btn) btn.classList.add('active');
  prevPage = currentPage;
  currentPage = tab;
  if (tab === 'favorites') renderFavorites();
  showPage(tab);
}

function showDay(dayId) {
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  prevPage = currentPage;
  currentPage = dayId;
  showPage(dayId);
}

function goBack() {
  const back = ['home','days','favorites'].includes(prevPage) ? prevPage : 'home';
  navigate(back);
}

// ══════════════════════════════════
// WEATHER - dates exactes 3-7 avril 2026
// ══════════════════════════════════
function openWeather() {
  window.location.href = 'weather://';
  setTimeout(() => {
    window.open('https://weather.com/weather/today/l/59.3293,18.0686', '_blank');
  }, 400);
}

function weatherIcon(code) {
  if (code === 0) return '\u2600\ufe0f';
  if (code <= 2) return '\ud83c\udf24';
  if (code <= 3) return '\u2601\ufe0f';
  if (code <= 48) return '\ud83c\udf2b';
  if (code <= 67) return '\ud83c\udf27';
  if (code <= 77) return '\ud83c\udf28';
  if (code <= 82) return '\ud83c\udf26';
  if (code <= 99) return '\u26c8';
  return '\ud83c\udf24';
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
  try {
    // Cibler EXACTEMENT les dates du voyage : 3-7 avril 2026
    const url = 'https://api.open-meteo.com/v1/forecast'
      + '?latitude=59.3293&longitude=18.0686'
      + '&daily=temperature_2m_max,temperature_2m_min,weathercode'
      + '&timezone=Europe/Stockholm'
      + '&start_date=2026-04-03&end_date=2026-04-07'
      + '&cache=' + Date.now();

    const res = await fetch(url);
    if (!res.ok) throw new Error('Weather API failed');
    const data = await res.json();

    const days = data.daily;
    const labels = ['Ven', 'Sam', 'Dim', 'Lun', 'Mar'];
    const dayTempIds = [null, 'day1-temp', 'day2-temp', 'day3-temp', 'day4-temp'];
    const dayIconIds = [null, 'day1-wicon', 'day2-wicon', 'day3-wicon', 'day4-wicon'];

    // Widget home : météo du 4 avril (Jour 1, index 1)
    const mainCode = days.weathercode[1];
    const mainMax  = Math.round(days.temperature_2m_max[1]);

    const iconEl     = document.getElementById('w-icon');
    const tempEl     = document.getElementById('w-temp');
    const descEl     = document.getElementById('w-desc');
    const forecastEl = document.getElementById('w-forecast');

    if (iconEl) iconEl.textContent = weatherIcon(mainCode);
    if (tempEl) tempEl.textContent = mainMax + '\u00b0C';
    if (descEl) descEl.textContent = weatherDesc(mainCode) + ' \u00b7 semaine du voyage';

    if (forecastEl) {
      forecastEl.innerHTML = '';
      for (let i = 0; i < 5; i++) {
        const maxT = Math.round(days.temperature_2m_max[i]);
        const wc   = days.weathercode[i];
        const d = document.createElement('div');
        d.className = 'weather-day';
        d.innerHTML =
          '<div class="weather-day-label">' + labels[i] + '</div>' +
          '<div class="weather-day-icon">' + weatherIcon(wc) + '</div>' +
          '<div class="weather-day-temp">' + maxT + '\u00b0</div>';
        forecastEl.appendChild(d);
        if (i >= 1 && dayTempIds[i]) {
          const el = document.getElementById(dayTempIds[i]);
          if (el) el.textContent = maxT + '\u00b0C';
        }
        if (i >= 1 && dayIconIds[i]) {
          const el = document.getElementById(dayIconIds[i]);
          if (el) el.textContent = weatherIcon(wc);
        }
      }
    }
  } catch(e) {
    console.log('Weather error:', e);
    const tempEl = document.getElementById('w-temp');
    const descEl = document.getElementById('w-desc');
    const iconEl = document.getElementById('w-icon');
    if (tempEl) tempEl.textContent = '7\u00b0C';
    if (descEl) descEl.textContent = 'Stockholm en avril';
    if (iconEl) iconEl.textContent = '\ud83c\udf24';
    const forecastEl = document.getElementById('w-forecast');
    if (forecastEl) {
      forecastEl.innerHTML =
        '<div class="weather-day"><div class="weather-day-label">Ven</div><div class="weather-day-icon">\ud83c\udf24</div><div class="weather-day-temp">5\u00b0</div></div>' +
        '<div class="weather-day"><div class="weather-day-label">Sam</div><div class="weather-day-icon">\u2601\ufe0f</div><div class="weather-day-temp">7\u00b0</div></div>' +
        '<div class="weather-day"><div class="weather-day-label">Dim</div><div class="weather-day-icon">\ud83c\udf26</div><div class="weather-day-temp">6\u00b0</div></div>' +
        '<div class="weather-day"><div class="weather-day-label">Lun</div><div class="weather-day-icon">\u26c5</div><div class="weather-day-temp">8\u00b0</div></div>' +
        '<div class="weather-day"><div class="weather-day-label">Mar</div><div class="weather-day-icon">\ud83c\udf24</div><div class="weather-day-temp">9\u00b0</div></div>';
    }
  }
}

// ══════════════════════════════════
// FAVORITES
// ══════════════════════════════════
function toggleFav(btn, name, type) {
  const idx = favorites.findIndex(f => f.name === name);
  if (idx > -1) {
    favorites.splice(idx, 1);
    btn.classList.remove('saved');
  } else {
    favorites.push({ name, type, saved: new Date().toISOString() });
    btn.classList.add('saved');
    btn.style.transform = 'scale(1.35)';
    setTimeout(() => { btn.style.transform = ''; }, 200);
  }
  localStorage.setItem('stockholm-favs', JSON.stringify(favorites));
  document.getElementById('fav-count').textContent = favorites.length + ' lieu' + (favorites.length !== 1 ? 'x' : '');
}

function renderFavorites() {
  const list = document.getElementById('fav-list');
  const countEl = document.getElementById('fav-count');
  if (countEl) countEl.textContent = favorites.length + ' lieu' + (favorites.length !== 1 ? 'x' : '');
  if (!list) return;
  if (favorites.length === 0) {
    list.innerHTML = '<div class="empty-state"><div class="empty-icon">\u2661</div><div class="empty-title">Vos coups de c\u0153ur</div><div class="empty-sub">Appuyez sur \u2661 sur un restaurant ou lieu pour le sauvegarder ici.</div></div>';
    return;
  }
  const typeLabels = { brunch:'Brunch', lunch:'D\u00e9jeuner', dinner:'D\u00eener', place:'Lieu' };
  list.innerHTML = '<div style="padding:0 16px;display:flex;flex-direction:column;gap:10px;padding-bottom:16px;">' +
    favorites.map(f => '<div style="background:var(--surface);border-radius:var(--radius-sm);border:1px solid rgba(199,180,160,0.2);padding:16px 18px;display:flex;align-items:center;justify-content:space-between;gap:12px;"><div><div style="font-size:10px;letter-spacing:0.1em;text-transform:uppercase;color:var(--accent);font-weight:500;margin-bottom:4px;">' + (typeLabels[f.type] || f.type) + '</div><div style="font-family:var(--serif);font-size:18px;font-weight:400;color:var(--text);">' + f.name + '</div></div><div style="color:var(--highlight);font-size:20px;">\u2665</div></div>').join('') +
    '</div>';
}

function restoreFavStates() {
  favorites.forEach(f => {
    document.querySelectorAll('.icon-btn.fav').forEach(btn => {
      const nameEl = btn.closest('.option-item, .option-item-photo') &&
                     (btn.closest('.option-item-photo') ?
                      btn.closest('.option-item-photo').querySelector('.option-photo-name') :
                      btn.closest('.option-item').querySelector('.option-name'));
      if (nameEl && nameEl.textContent.trim() === f.name) {
        btn.classList.add('saved');
      }
    });
  });
}

// ══════════════════════════════════
// MODIFIER PHOTOS DES JOURS (appui long)
// ══════════════════════════════════
function initDayPhotoEdit() {
  // Restaurer les photos sauvegardées
  Object.entries(DAY_PHOTO_KEYS).forEach(function(entry) {
    const day = entry[0], key = entry[1];
    const saved = localStorage.getItem(key);
    if (saved) applyDayPhoto(day, saved);
  });

  // Attacher les listeners appui long sur chaque hero
  ['arrival','day1','day2','day3','day4'].forEach(function(day) {
    const hero = document.querySelector('#page-' + day + ' .day-hero-bg');
    if (!hero) return;
    hero.style.cursor = 'pointer';
    hero.title = 'Appui long pour changer la photo';

    let timer = null;
    const startLong = function() {
      timer = setTimeout(function() {
        triggerDayPhotoChange(day);
        if (navigator.vibrate) navigator.vibrate(30);
      }, 600);
    };
    const cancelLong = function() { if (timer) clearTimeout(timer); };

    hero.addEventListener('touchstart', startLong, { passive: true });
    hero.addEventListener('touchend', cancelLong);
    hero.addEventListener('touchmove', cancelLong);
    hero.addEventListener('mousedown', startLong);
    hero.addEventListener('mouseup', cancelLong);
    hero.addEventListener('mouseleave', cancelLong);
  });
}

function triggerDayPhotoChange(day) {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';
  input.style.display = 'none';
  document.body.appendChild(input);

  input.onchange = function() {
    const file = input.files[0];
    if (!file) { document.body.removeChild(input); return; }
    const reader = new FileReader();
    reader.onload = function(e) {
      const img = new Image();
      img.onload = function() {
        const canvas = document.createElement('canvas');
        const MAX = 1200;
        let w = img.width, h = img.height;
        if (w > MAX) { h = Math.round(h * MAX / w); w = MAX; }
        if (h > MAX) { w = Math.round(w * MAX / h); h = MAX; }
        canvas.width = w; canvas.height = h;
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
        const b64 = canvas.toDataURL('image/jpeg', 0.80);
        localStorage.setItem(DAY_PHOTO_KEYS[day], b64);
        applyDayPhoto(day, b64);
        showPhotoToast('\u2713 Photo mise \u00e0 jour');
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
    document.body.removeChild(input);
  };

  input.click();
}

function applyDayPhoto(day, b64) {
  const bg = document.querySelector('#page-' + day + ' .day-hero-bg');
  if (bg) bg.style.backgroundImage = 'url(' + b64 + ')';
}

function showPhotoToast(msg) {
  let toast = document.getElementById('photo-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'photo-toast';
    toast.style.cssText = 'position:fixed;top:calc(env(safe-area-inset-top,0px)+20px);left:50%;transform:translateX(-50%);background:rgba(29,29,27,0.9);color:#F6F2EC;font-size:13px;font-weight:500;padding:10px 20px;border-radius:100px;z-index:500;backdrop-filter:blur(10px);transition:opacity 0.3s;font-family:var(--sans);letter-spacing:0.03em;white-space:nowrap;';
    document.body.appendChild(toast);
  }
  toast.textContent = msg;
  toast.style.opacity = '1';
  clearTimeout(toast._timer);
  toast._timer = setTimeout(function() { toast.style.opacity = '0'; }, 2500);
}

// ══════════════════════════════════
// CUSTOM STEPS (Supabase + local)
// ══════════════════════════════════
async function loadCustomSteps() {
  const data = await sbFetch(SB_TABLE + '?order=created_at.asc');
  if (data && data.length >= 0) {
    customSteps = data;
    localStorage.setItem('custom_steps_cache', JSON.stringify(customSteps));
  } else {
    customSteps = JSON.parse(localStorage.getItem('custom_steps_cache') || '[]');
  }
  renderAllCustomSteps();
  setTimeout(loadCustomSteps, 30000);
}

function renderAllCustomSteps() {
  ['arrival','day1','day2','day3','day4'].forEach(function(day) {
    const daySteps = customSteps.filter(function(s) { return s.day === day; });
    const container = document.getElementById('custom-' + day);
    const listEl = document.getElementById('custom-' + day + '-list');
    if (!container || !listEl) return;
    if (daySteps.length > 0) {
      container.style.display = 'block';
      listEl.innerHTML = daySteps.map(function(s) { return renderCustomCard(s); }).join('');
    } else {
      container.style.display = 'none';
    }
  });
  updateSyncBadge();
}

function updateSyncBadge() {
  const el = document.getElementById('sync-status');
  if (!el) return;
  if (customSteps.length > 0) {
    el.style.display = 'block';
    el.textContent = '\u2746 ' + customSteps.length + ' ajout' + (customSteps.length > 1 ? 's' : '') + ' partag\u00e9' + (customSteps.length > 1 ? 's' : '') + ' avec Lucie';
  } else {
    el.style.display = 'none';
  }
}

function renderCustomCard(step) {
  const mapsUrl = 'https://maps.google.com/?q=' + encodeURIComponent((step.address || step.name) + ' Stockholm');
  const typeLabels = {
    restaurant:'\ud83c\udf7d Restaurant', brunch:'\u2615 Brunch', visit:'\ud83c\udfdb Visite',
    walk:'\ud83d\udeb6 Balade', wellness:'\ud83e\uddd6 Wellness', shopping:'\ud83d\udecd Shopping',
    bar:'\ud83c\udf78 Bar', other:'\u2746 Autre'
  };
  const photoStyle = step.photo ? 'background-image:url(' + step.photo + ')' : 'background:var(--surface2)';

  return '<div class="custom-card">' +
    '<div class="custom-card-photo" style="' + photoStyle + '"></div>' +
    '<div class="custom-card-body">' +
      '<div class="custom-card-info">' +
        '<div class="custom-card-type">' + (typeLabels[step.type] || '\u2746') + (step.time ? ' \u00b7 ' + step.time : '') + '</div>' +
        '<div class="custom-card-name">' + step.name + '</div>' +
        (step.note ? '<div style="font-size:12px;color:var(--text-muted);font-weight:300;margin-top:2px;">' + step.note + '</div>' : '') +
      '</div>' +
      '<div style="display:flex;gap:6px;flex-shrink:0;margin-left:10px;">' +
        '<a href="' + mapsUrl + '" target="_blank" class="icon-btn" title="Maps">' +
          '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>' +
        '</a>' +
        '<button class="icon-btn" onclick="openEditStep(\'' + step.id + '\')" title="Modifier" style="color:var(--accent-dark);">' +
          '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>' +
        '</button>' +
        '<button class="custom-card-delete" onclick="deleteStep(\'' + step.id + '\')" title="Supprimer">\u2715</button>' +
      '</div>' +
    '</div>' +
  '</div>';
}

async function deleteStep(id) {
  if (!confirm('Supprimer cette \u00e9tape ?')) return;
  await sbFetch(SB_TABLE + '?id=eq.' + id, 'DELETE');
  customSteps = customSteps.filter(function(s) { return s.id !== id; });
  localStorage.setItem('custom_steps_cache', JSON.stringify(customSteps));
  renderAllCustomSteps();
}

// ══════════════════════════════════
// MODAL AJOUTER / MODIFIER
// ══════════════════════════════════
function openEditModal() {
  const modal = document.getElementById('edit-modal');
  if (!modal) return;
  modal.style.display = 'flex';
  document.body.style.overflow = 'hidden';
  const daySelect = document.getElementById('new-day');
  if (daySelect && ['arrival','day1','day2','day3','day4'].includes(currentPage)) {
    daySelect.value = currentPage;
  }
}

function closeEditModal() {
  editingStepId = null;
  const modal = document.getElementById('edit-modal');
  if (!modal) return;
  modal.style.display = 'none';
  document.body.style.overflow = '';
  document.getElementById('new-name').value = '';
  document.getElementById('new-address').value = '';
  document.getElementById('new-note').value = '';
  document.getElementById('new-time').value = '';
  const preview = document.getElementById('photo-preview');
  if (preview) preview.style.backgroundImage = '';
  const status = document.getElementById('submit-status');
  if (status) status.style.display = 'none';
  selectedPhotoBase64 = null;
  const titleEl = document.querySelector('#edit-modal > div:first-child > div:first-child');
  if (titleEl) titleEl.textContent = 'Ajouter une \u00e9tape';
  const btn = document.getElementById('submit-btn');
  if (btn) btn.textContent = "Ajouter \u00e0 l'itin\u00e9raire";
}

function openEditStep(id) {
  const step = customSteps.find(function(s) { return s.id === id; });
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

  const titleEl = document.querySelector('#edit-modal > div:first-child > div:first-child');
  if (titleEl) titleEl.textContent = "Modifier l'\u00e9tape";
  const btn = document.getElementById('submit-btn');
  if (btn) btn.textContent = 'Enregistrer les modifications';

  openEditModal();
}

function handlePhotoSelect(input) {
  const file = input.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = function(e) {
    const img = new Image();
    img.onload = function() {
      const canvas = document.createElement('canvas');
      const MAX = 800;
      let w = img.width, h = img.height;
      if (w > MAX) { h = Math.round(h * MAX / w); w = MAX; }
      if (h > MAX) { w = Math.round(w * MAX / h); h = MAX; }
      canvas.width = w; canvas.height = h;
      canvas.getContext('2d').drawImage(img, 0, 0, w, h);
      selectedPhotoBase64 = canvas.toDataURL('image/jpeg', 0.75);
      const preview = document.getElementById('photo-preview');
      if (preview) preview.style.backgroundImage = 'url(' + selectedPhotoBase64 + ')';
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

function updateMapsPreview() {
  const val = document.getElementById('new-address').value.trim();
  const preview = document.getElementById('maps-preview');
  const link = document.getElementById('maps-preview-link');
  if (!preview || !link) return;
  if (val.length > 3) {
    link.href = 'https://maps.google.com/?q=' + encodeURIComponent(val);
    preview.style.display = 'block';
  } else {
    preview.style.display = 'none';
  }
}

async function submitNewStep() {
  const name = document.getElementById('new-name').value.trim();
  if (!name) { alert('Ajoute un nom'); return; }

  const btn = document.getElementById('submit-btn');
  const status = document.getElementById('submit-status');
  btn.disabled = true;

  if (editingStepId) {
    btn.textContent = 'Enregistrement\u2026';
    const currentStep = customSteps.find(function(s) { return s.id === editingStepId; });
    const updatedStep = {
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
    const idx = customSteps.findIndex(function(s) { return s.id === editingStepId; });
    if (idx > -1) customSteps[idx] = updatedStep;
    localStorage.setItem('custom_steps_cache', JSON.stringify(customSteps));
    renderAllCustomSteps();
    status.style.display = 'block';
    status.textContent = '\u2713 Modifi\u00e9 et synchronis\u00e9 avec Lucie';
    btn.disabled = false;
    btn.textContent = 'Enregistrer les modifications';
    setTimeout(function() { closeEditModal(); showDay(updatedStep.day); }, 1000);

  } else {
    btn.textContent = 'Ajout en cours\u2026';
    const step = {
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
    const result = await sbFetch(SB_TABLE, 'POST', step);
    customSteps.push(step);
    localStorage.setItem('custom_steps_cache', JSON.stringify(customSteps));
    renderAllCustomSteps();
    status.style.display = 'block';
    status.textContent = result ? '\u2713 Synchronis\u00e9 avec Lucie !' : '\u2713 Ajout\u00e9 en local';
    btn.disabled = false;
    btn.textContent = "Ajouter \u00e0 l'itin\u00e9raire";
    const day = step.day;
    setTimeout(function() { closeEditModal(); showDay(day); }, 1000);
  }
}

// ══════════════════════════════════
// INSTALL BANNER
// ══════════════════════════════════
function checkInstallPrompt() {
  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const isStandalone = window.navigator.standalone;
  const dismissed = localStorage.getItem('install-dismissed');
  if (isIOS && !isStandalone && !dismissed) {
    setTimeout(function() {
      const banner = document.getElementById('install-banner');
      if (banner) banner.classList.add('visible');
    }, 3000);
  }
}

function dismissInstall() {
  const banner = document.getElementById('install-banner');
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
  const countEl = document.getElementById('fav-count');
  if (countEl) countEl.textContent = favorites.length + ' lieu' + (favorites.length !== 1 ? 'x' : '');
});

// SW disabled
