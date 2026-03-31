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
// WEATHER
// ══════════════════════════════════
function openWeather() {
  window.location.href = 'weather://';
  setTimeout(() => {
    window.open('https://weather.com/weather/today/l/59.3293,18.0686', '_blank');
  }, 400);
}

function weatherIcon(code) {
  if (code === 0) return '☀️';
  if (code <= 2) return '🌤';
  if (code <= 3) return '☁️';
  if (code <= 48) return '🌫';
  if (code <= 67) return '🌧';
  if (code <= 77) return '🌨';
  if (code <= 82) return '🌦';
  if (code <= 99) return '⛈';
  return '🌤';
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
    const url = 'https://api.open-meteo.com/v1/forecast?latitude=59.3293&longitude=18.0686&daily=temperature_2m_max,temperature_2m_min,weathercode&current_weather=true&timezone=Europe/Stockholm&forecast_days=5';
    const res = await fetch(url);
    if (!res.ok) throw new Error('Weather API failed');
    const data = await res.json();
    const curr = data.current_weather;
    const temp = Math.round(curr.temperature);
    const code = curr.weathercode;

    const iconEl = document.getElementById('w-icon');
    const tempEl = document.getElementById('w-temp');
    const descEl = document.getElementById('w-desc');
    const forecastEl = document.getElementById('w-forecast');

    if (iconEl) iconEl.textContent = weatherIcon(code);
    if (tempEl) tempEl.textContent = temp + '°C';
    if (descEl) descEl.textContent = weatherDesc(code);

    if (forecastEl) {
      const days = data.daily;
      const labels = ['Ven', 'Sam', 'Dim', 'Lun', 'Mar'];
      forecastEl.innerHTML = '';
      for (let i = 0; i < 5; i++) {
        const maxT = Math.round(days.temperature_2m_max[i]);
        const wc = days.weathercode[i];
        const d = document.createElement('div');
        d.className = 'weather-day';
        d.innerHTML = '<div class="weather-day-label">' + labels[i] + '</div>' +
          '<div class="weather-day-icon">' + weatherIcon(wc) + '</div>' +
          '<div class="weather-day-temp">' + maxT + '°</div>';
        forecastEl.appendChild(d);
        // Update day pages temps
        const dayTemps = [null,'day1-temp','day2-temp','day3-temp','day4-temp'];
        if (i >= 1 && dayTemps[i]) {
          const el = document.getElementById(dayTemps[i]);
          if (el) el.textContent = maxT + '°C';
        }
      }
    }
  } catch(e) {
    const tempEl = document.getElementById('w-temp');
    const descEl = document.getElementById('w-desc');
    const iconEl = document.getElementById('w-icon');
    if (tempEl) tempEl.textContent = '7°C';
    if (descEl) descEl.textContent = 'Stockholm en avril';
    if (iconEl) iconEl.textContent = '🌤';
    const forecastEl = document.getElementById('w-forecast');
    if (forecastEl) {
      forecastEl.innerHTML = 
        '<div class="weather-day"><div class="weather-day-label">Ven</div><div class="weather-day-icon">🌤</div><div class="weather-day-temp">5°</div></div>' +
        '<div class="weather-day"><div class="weather-day-label">Sam</div><div class="weather-day-icon">☁️</div><div class="weather-day-temp">7°</div></div>' +
        '<div class="weather-day"><div class="weather-day-label">Dim</div><div class="weather-day-icon">🌦</div><div class="weather-day-temp">6°</div></div>' +
        '<div class="weather-day"><div class="weather-day-label">Lun</div><div class="weather-day-icon">⛅</div><div class="weather-day-temp">8°</div></div>' +
        '<div class="weather-day"><div class="weather-day-label">Mar</div><div class="weather-day-icon">🌤</div><div class="weather-day-temp">9°</div></div>';
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
    list.innerHTML = '<div class="empty-state"><div class="empty-icon">♡</div><div class="empty-title">Vos coups de cœur</div><div class="empty-sub">Appuyez sur ♡ sur un restaurant ou lieu pour le sauvegarder ici.</div></div>';
    return;
  }
  const typeLabels = { brunch:'Brunch', lunch:'Déjeuner', dinner:'Dîner', place:'Lieu' };
  list.innerHTML = '<div style="padding:0 16px;display:flex;flex-direction:column;gap:10px;padding-bottom:16px;">' +
    favorites.map(f => '<div style="background:var(--surface);border-radius:var(--radius-sm);border:1px solid rgba(199,180,160,0.2);padding:16px 18px;display:flex;align-items:center;justify-content:space-between;gap:12px;"><div><div style="font-size:10px;letter-spacing:0.1em;text-transform:uppercase;color:var(--accent);font-weight:500;margin-bottom:4px;">' + (typeLabels[f.type] || f.type) + '</div><div style="font-family:var(--serif);font-size:18px;font-weight:400;color:var(--text);">' + f.name + '</div></div><div style="color:var(--highlight);font-size:20px;">♥</div></div>').join('') +
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
// CUSTOM STEPS (Supabase + local)
// ══════════════════════════════════
async function loadCustomSteps() {
  // Try Supabase
  const data = await sbFetch(SB_TABLE + '?order=created_at.asc');
  if (data && data.length >= 0) {
    customSteps = data;
    localStorage.setItem('custom_steps_cache', JSON.stringify(customSteps));
  } else {
    // Fallback to cache
    customSteps = JSON.parse(localStorage.getItem('custom_steps_cache') || '[]');
  }
  renderAllCustomSteps();
  // Poll every 30s
  setTimeout(loadCustomSteps, 30000);
}

function renderAllCustomSteps() {
  ['arrival','day1','day2','day3','day4'].forEach(day => {
    const daySteps = customSteps.filter(s => s.day === day);
    const container = document.getElementById('custom-' + day);
    const listEl = document.getElementById('custom-' + day + '-list');
    if (!container || !listEl) return;
    if (daySteps.length > 0) {
      container.style.display = 'block';
      listEl.innerHTML = daySteps.map(s => renderCustomCard(s)).join('');
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
    el.textContent = '✦ ' + customSteps.length + ' ajout' + (customSteps.length > 1 ? 's' : '') + ' partagé' + (customSteps.length > 1 ? 's' : '') + ' avec Lucie';
  } else {
    el.style.display = 'none';
  }
}

function renderCustomCard(step) {
  const mapsUrl = 'https://maps.google.com/?q=' + encodeURIComponent((step.address || step.name) + ' Stockholm');
  const typeLabels = { restaurant:'🍽 Restaurant', brunch:'☕ Brunch', visit:'🏛 Visite', walk:'🚶 Balade', wellness:'🧖 Wellness', shopping:'🛍 Shopping', bar:'🍸 Bar', other:'✦ Autre' };
  const photoStyle = step.photo ? 'background-image:url(' + step.photo + ')' : 'background:var(--surface2)';
  return '<div class="custom-card">' +
    '<div class="custom-card-photo" style="' + photoStyle + '"></div>' +
    '<div class="custom-card-body">' +
      '<div class="custom-card-info">' +
        '<div class="custom-card-type">' + (typeLabels[step.type] || '✦') + (step.time ? ' · ' + step.time : '') + '</div>' +
        '<div class="custom-card-name">' + step.name + '</div>' +
        (step.note ? '<div style="font-size:12px;color:var(--text-muted);font-weight:300;margin-top:2px;">' + step.note + '</div>' : '') +
      '</div>' +
      '<div style="display:flex;gap:6px;flex-shrink:0;margin-left:10px;">' +
        '<a href="' + mapsUrl + '" target="_blank" class="icon-btn">' +
          '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>' +
        '</a>' +
        '<button class="custom-card-delete" onclick="deleteStep(\'' + step.id + '\')">✕</button>' +
      '</div>' +
    '</div>' +
  '</div>';
}

async function deleteStep(id) {
  if (!confirm('Supprimer cette étape ?')) return;
  await sbFetch(SB_TABLE + '?id=eq.' + id, 'DELETE');
  customSteps = customSteps.filter(s => s.id !== id);
  localStorage.setItem('custom_steps_cache', JSON.stringify(customSteps));
  renderAllCustomSteps();
}

// ══════════════════════════════════
// EDIT MODAL
// ══════════════════════════════════
function openEditModal() {
  const modal = document.getElementById('edit-modal');
  if (!modal) return;
  modal.style.display = 'flex';
  document.body.style.overflow = 'hidden';
  // Pre-select current day
  const daySelect = document.getElementById('new-day');
  if (daySelect && ['arrival','day1','day2','day3','day4'].includes(currentPage)) {
    daySelect.value = currentPage;
  }
}

function closeEditModal() {
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
}

function handlePhotoSelect(input) {
  const file = input.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    const img = new Image();
    img.onload = () => {
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
  const address = document.getElementById('new-address').value.trim();
  const type = document.getElementById('new-type').value;
  const day = document.getElementById('new-day').value;
  const time = document.getElementById('new-time').value;
  const note = document.getElementById('new-note').value.trim();

  const btn = document.getElementById('submit-btn');
  const status = document.getElementById('submit-status');
  btn.disabled = true;
  btn.textContent = 'Ajout en cours…';

  const step = {
    id: Date.now().toString(),
    name, address, type, day, time, note,
    photo: selectedPhotoBase64 || null,
    created_at: new Date().toISOString()
  };

  const result = await sbFetch(SB_TABLE, 'POST', step);
  
  customSteps.push(step);
  localStorage.setItem('custom_steps_cache', JSON.stringify(customSteps));
  renderAllCustomSteps();

  status.style.display = 'block';
  status.textContent = result ? '✓ Synchronisé avec Lucie !' : '✓ Ajouté en local';

  btn.disabled = false;
  btn.textContent = "Ajouter à l'itinéraire";

  setTimeout(() => {
    closeEditModal();
    showDay(day);
  }, 1000);
}

// ══════════════════════════════════
// INSTALL BANNER
// ══════════════════════════════════
function checkInstallPrompt() {
  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const isStandalone = window.navigator.standalone;
  const dismissed = localStorage.getItem('install-dismissed');
  if (isIOS && !isStandalone && !dismissed) {
    setTimeout(() => {
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
document.addEventListener('DOMContentLoaded', () => {
  showPage('home');
  loadWeather();
  checkInstallPrompt();
  restoreFavStates();
  loadCustomSteps();
  const countEl = document.getElementById('fav-count');
  if (countEl) countEl.textContent = favorites.length + ' lieu' + (favorites.length !== 1 ? 'x' : '');
});

// SW disabled