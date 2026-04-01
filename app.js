// ── SERVICE WORKER CLEANUP ──
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then(function(r){r.forEach(function(s){s.unregister();});});
  caches.keys().then(function(k){k.forEach(function(c){caches.delete(c);});});
}

// ══════════════════════════════════════
// CONFIG SUPABASE
// ══════════════════════════════════════
var SB_URL   = 'https://tuarjmzjvnhmnpfkxcbo.supabase.co';
var SB_KEY   = 'sb_publishable_GVl8wU8THUveLkWRiKB4Rg_MhBT7J_3';
var SB_STEPS = 'stockholm_steps';
var SB_CARDS = 'stockholm_card_edits';

async function sbFetch(path, method, body) {
  method = method || 'GET';
  var h = { 'apikey': SB_KEY, 'Authorization': 'Bearer '+SB_KEY, 'Content-Type': 'application/json', 'Prefer': method==='POST'?'return=representation':'' };
  var opts = { method: method, headers: h };
  if (body) opts.body = JSON.stringify(body);
  try {
    var res = await fetch(SB_URL+'/rest/v1/'+path, opts);
    if (!res.ok) return null;
    var t = await res.text();
    return t ? JSON.parse(t) : [];
  } catch(e) { return null; }
}

// ══════════════════════════════════════
// STATE
// ══════════════════════════════════════
var currentPage = 'home';
var prevPage    = 'home';
var favorites   = JSON.parse(localStorage.getItem('stockholm-favs') || '[]');
var customSteps = [];
var cardEditsCache = {};
var selectedPhotoBase64 = null;
var editingStepId = null;
var editingCardId = null;
var cardEditPhoto  = null;
var currentMapDay  = 'all';

// ══════════════════════════════════════
// NAVIGATION
// ══════════════════════════════════════
function showPage(id) {
  document.querySelectorAll('.page').forEach(function(p){ p.classList.remove('active'); p.style.display='none'; });
  var el = document.getElementById('page-'+id);
  if (el) { el.style.display='block'; setTimeout(function(){ el.classList.add('active'); },10); window.scrollTo(0,0); }
  if (id === 'map') renderMapDay(currentMapDay);
}

function navigate(tab) {
  document.querySelectorAll('.nav-btn').forEach(function(b){ b.classList.remove('active'); });
  var btn = document.getElementById('nav-'+tab);
  if (btn) btn.classList.add('active');
  prevPage = currentPage; currentPage = tab;
  if (tab === 'favorites') renderFavorites();
  showPage(tab);
}

function showDay(dayId) {
  document.querySelectorAll('.nav-btn').forEach(function(b){ b.classList.remove('active'); });
  prevPage = currentPage; currentPage = dayId;
  showPage(dayId);
}

function goBack() {
  var back = ['home','days','favorites','map'].indexOf(prevPage) > -1 ? prevPage : 'home';
  navigate(back);
}

// ══════════════════════════════════════
// MÉTÉO — start_date/end_date exactes
// ══════════════════════════════════════
function openWeather() {
  window.location.href = 'weather://';
  setTimeout(function(){ window.open('https://weather.com/weather/tenday/l/Stockholm+Sweden','_blank'); }, 400);
}

function wIcon(c) {
  if (c===0) return '\u2600\uFE0F';
  if (c<=2)  return '\uD83C\uDF24\uFE0F';
  if (c<=3)  return '\u2601\uFE0F';
  if (c<=48) return '\uD83C\uDF2B\uFE0F';
  if (c<=67) return '\uD83C\uDF27\uFE0F';
  if (c<=77) return '\uD83C\uDF28\uFE0F';
  if (c<=82) return '\uD83C\uDF26\uFE0F';
  return '\u26C8\uFE0F';
}

function wDesc(c) {
  if (c===0) return 'Ciel dégagé';
  if (c<=2)  return 'Partiellement nuageux';
  if (c<=3)  return 'Couvert';
  if (c<=48) return 'Brumeux';
  if (c<=67) return 'Pluvieux';
  if (c<=77) return 'Neigeux';
  if (c<=82) return 'Averses';
  return 'Orageux';
}

async function loadWeather() {
  var targets = ['2026-04-03','2026-04-04','2026-04-05','2026-04-06','2026-04-07'];
  var labels  = ['Ven 3','Sam 4','Dim 5','Lun 6','Mar 7'];
  var dayTempIds = [null,'day1-temp','day2-temp','day3-temp','day4-temp'];
  var url = 'https://api.open-meteo.com/v1/forecast?latitude=59.3293&longitude=18.0686&daily=temperature_2m_max,temperature_2m_min,weathercode&timezone=Europe/Stockholm&forecast_days=16';

  function fallback() {
    var e;
    e=document.getElementById('w-icon'); if(e) e.textContent='\uD83C\uDF24\uFE0F';
    e=document.getElementById('w-temp'); if(e) e.textContent='~5\u00B0C';
    e=document.getElementById('w-desc'); if(e) e.textContent='Stockholm \u00B7 prévisions dès J-14';
    var fe=document.getElementById('w-forecast');
    if(fe) fe.innerHTML='<div class="weather-day"><div class="weather-day-label">Ven 3</div><div class="weather-day-icon">\uD83C\uDF24\uFE0F</div><div class="weather-day-temp">~5\u00B0</div></div><div class="weather-day"><div class="weather-day-label">Sam 4</div><div class="weather-day-icon">\u2601\uFE0F</div><div class="weather-day-temp">~7\u00B0</div></div><div class="weather-day"><div class="weather-day-label">Dim 5</div><div class="weather-day-icon">\uD83C\uDF26\uFE0F</div><div class="weather-day-temp">~6\u00B0</div></div><div class="weather-day"><div class="weather-day-label">Lun 6</div><div class="weather-day-icon">\u26C5</div><div class="weather-day-temp">~8\u00B0</div></div><div class="weather-day"><div class="weather-day-label">Mar 7</div><div class="weather-day-icon">\uD83C\uDF24\uFE0F</div><div class="weather-day-temp">~9\u00B0</div></div>';
  }

  try {
    var res = await fetch(url);
    if (!res.ok) throw new Error();
    var data = await res.json();
    var d = data.daily;
    var found = targets.map(function(t){ return d.time.indexOf(t); });
    var fe = document.getElementById('w-forecast');
    if (fe) fe.innerHTML = '';
    var mainSet = false;
    for (var i=0; i<5; i++) {
      var di = found[i];
      if (di===-1) {
        if(fe){ var div=document.createElement('div'); div.className='weather-day'; div.innerHTML='<div class="weather-day-label">'+labels[i]+'</div><div class="weather-day-icon" style="opacity:.35">—</div><div class="weather-day-temp" style="opacity:.35">?</div>'; fe.appendChild(div); }
        continue;
      }
      var maxT=Math.round(d.temperature_2m_max[di]), wc=d.weathercode[di];
      if(fe){ var div=document.createElement('div'); div.className='weather-day'; div.innerHTML='<div class="weather-day-label">'+labels[i]+'</div><div class="weather-day-icon">'+wIcon(wc)+'</div><div class="weather-day-temp">'+maxT+'\u00B0</div>'; fe.appendChild(div); }
      if(i>=1 && dayTempIds[i]){ var el=document.getElementById(dayTempIds[i]); if(el) el.textContent=maxT+'\u00B0C'; }
      if (!mainSet && i>=1) {
        var e;
        e=document.getElementById('w-icon'); if(e) e.textContent=wIcon(wc);
        e=document.getElementById('w-temp'); if(e) e.textContent=maxT+'\u00B0C';
        e=document.getElementById('w-desc'); if(e) e.textContent=wDesc(wc)+' \u00B7 Stockholm 3\u20137 avril';
        mainSet=true;
      }
    }
    if (!mainSet) fallback();
  } catch(e) { fallback(); }
}

// ══════════════════════════════════════
// FAVORIS
// ══════════════════════════════════════
function toggleFav(btn, name, type) {
  var idx = favorites.findIndex(function(f){ return f.name===name; });
  if (idx>-1) { favorites.splice(idx,1); btn.classList.remove('saved'); }
  else { favorites.push({name:name,type:type,saved:new Date().toISOString()}); btn.classList.add('saved'); btn.style.transform='scale(1.35)'; setTimeout(function(){ btn.style.transform=''; },200); }
  localStorage.setItem('stockholm-favs', JSON.stringify(favorites));
  var fc=document.getElementById('fav-count'); if(fc) fc.textContent=favorites.length+' lieu'+(favorites.length!==1?'x':'');
}

function renderFavorites() {
  var list=document.getElementById('fav-list'), countEl=document.getElementById('fav-count');
  if(countEl) countEl.textContent=favorites.length+' lieu'+(favorites.length!==1?'x':'');
  if(!list) return;
  if(!favorites.length) { list.innerHTML='<div class="empty-state"><div class="empty-icon">\u2661</div><div class="empty-title">Vos coups de cœur</div><div class="empty-sub">Appuyez sur \u2661 pour sauvegarder un lieu.</div></div>'; return; }
  var tl={brunch:'Brunch',lunch:'Déjeuner',dinner:'Dîner',place:'Lieu'};
  list.innerHTML='<div style="padding:0 16px;display:flex;flex-direction:column;gap:10px;padding-bottom:16px;">'+favorites.map(function(f){ return '<div style="background:var(--surface);border-radius:var(--radius-sm);border:1px solid rgba(199,180,160,0.2);padding:16px 18px;display:flex;align-items:center;justify-content:space-between;gap:12px;"><div><div style="font-size:10px;letter-spacing:0.1em;text-transform:uppercase;color:var(--accent);font-weight:500;margin-bottom:4px;">'+(tl[f.type]||f.type)+'</div><div style="font-family:var(--serif);font-size:18px;font-weight:400;">'+f.name+'</div></div><div style="color:var(--highlight);font-size:20px;">\u2665</div></div>'; }).join('')+'</div>';
}

function restoreFavStates() {
  favorites.forEach(function(f){
    document.querySelectorAll('.icon-btn.fav').forEach(function(btn){
      var c=btn.closest('.option-item-photo')||btn.closest('.option-item'); if(!c) return;
      var n=c.querySelector('.option-photo-name')||c.querySelector('.option-name');
      if(n && n.textContent.trim()===f.name) btn.classList.add('saved');
    });
  });
}

// ══════════════════════════════════════
// PHOTOS — système universel
// ══════════════════════════════════════
function changePhoto(elOrBtn, key) {
  var input = document.createElement('input');
  input.type='file'; input.accept='image/*'; input.style.display='none';
  document.body.appendChild(input);
  input.onchange = function() {
    var file=input.files[0]; document.body.removeChild(input);
    if(!file) return;
    var reader=new FileReader();
    reader.onload=function(e){
      var img=new Image();
      img.onload=function(){
        var canvas=document.createElement('canvas'), MAX=1200, w=img.width, h=img.height;
        if(w>MAX){h=Math.round(h*MAX/w);w=MAX;} if(h>MAX){w=Math.round(w*MAX/h);h=MAX;}
        canvas.width=w; canvas.height=h;
        canvas.getContext('2d').drawImage(img,0,0,w,h);
        var b64=canvas.toDataURL('image/jpeg',0.82);
        try { localStorage.setItem('photo-'+key, b64); } catch(e) {}
        var target=document.getElementById(key);
        if(target){ target.style.backgroundImage='url('+b64+')'; target.classList.add('has-photo'); var sv=target.querySelector('svg'),sp=target.querySelector('span'); if(sv)sv.style.display='none'; if(sp)sp.style.display='none'; }
        showToast('\u2713 Photo mise à jour');
      };
      img.src=e.target.result;
    };
    reader.readAsDataURL(file);
  };
  input.click();
}

function restoreAllPhotos() {
  for(var i=0;i<localStorage.length;i++){
    var k=localStorage.key(i); if(!k||!k.startsWith('photo-')) continue;
    var id=k.replace('photo-',''), b64=localStorage.getItem(k); if(!b64) continue;
    var el=document.getElementById(id);
    if(el){ el.style.backgroundImage='url('+b64+')'; el.classList.add('has-photo'); var sv=el.querySelector('svg'),sp=el.querySelector('span'); if(sv)sv.style.display='none'; if(sp)sp.style.display='none'; }
  }
}

function initDayPhotoEdit() {
  // Les photos de day-hero sont dans restoreAllPhotos()
  // Compat avec anciens localStorage
  var old={arrival:'day-hero-arrival',day1:'day-hero-day1',day2:'day-hero-day2',day3:'day-hero-day3',day4:'day-hero-day4'};
  Object.keys(old).forEach(function(day){
    var saved=localStorage.getItem(old[day]); if(!saved) return;
    var bg=document.querySelector('#page-'+day+' .day-hero-bg'); if(bg) bg.style.backgroundImage='url('+saved+')';
  });
}

function showToast(msg) {
  var t=document.getElementById('app-toast');
  if(!t){ t=document.createElement('div'); t.id='app-toast'; t.style.cssText='position:fixed;top:calc(env(safe-area-inset-top,0px)+16px);left:50%;transform:translateX(-50%);background:rgba(29,29,27,0.92);color:#F6F2EC;font-size:13px;font-weight:500;padding:10px 20px;border-radius:100px;z-index:500;backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);transition:opacity .4s;font-family:var(--sans);white-space:nowrap;pointer-events:none;'; document.body.appendChild(t); }
  t.textContent=msg; t.style.opacity='1'; clearTimeout(t._tm);
  t._tm=setTimeout(function(){ t.style.opacity='0'; },2500);
}

// ══════════════════════════════════════
// CARTE INTERACTIVE
// ══════════════════════════════════════
var MAP_DATA = {
  all: {
    query: 'Stockholm+Sweden',
    zoom: 13,
    places: [
      {name:'Villa Dahlia', type:'Hôtel', color:'#C6B59A', addr:'Villa Dahlia Stockholm', day:'all'},
      {name:'Södermalm', type:'Quartier', color:'#8C9A8B', addr:'Södermalm Stockholm', day:'day1'},
      {name:'Fjäderholmarna', type:'Île', color:'#7BA7BC', addr:'Fjaderholmarna Stockholm', day:'day2'},
      {name:'Gamla Stan', type:'Vieille ville', color:'#D4956A', addr:'Gamla Stan Stockholm', day:'day3'},
      {name:'Djurgården', type:'Parc', color:'#8C9A8B', addr:'Djurgarden Stockholm', day:'day3'},
      {name:'Gazza', type:'Restaurant · Réservé ✓', color:'#C6B59A', addr:'Gazza Stockholm', day:'day3'}
    ]
  },
  day1: {
    query: 'Södermalm+Stockholm',
    zoom: 14,
    places: [
      {name:'Villa Dahlia', type:'Départ · Hôtel', color:'#C6B59A', addr:'Villa Dahlia Stockholm'},
      {name:'Café a Lalo', type:'Brunch · 13h30', color:'#8C9A8B', addr:'Cafe a Lalo Stockholm'},
      {name:'Mahalo Stockholm', type:'Brunch (alt.)', color:'#8C9A8B', addr:'Mahalo Stockholm'},
      {name:'SoFo', type:'Balade · 15h', color:'#8C9A8B', addr:'SoFo Stockholm'},
      {name:'Fjällgatan', type:'Vue panoramique', color:'#7BA7BC', addr:'Fjallgatan Stockholm'},
      {name:'Monteliusvägen', type:'Coucher de soleil', color:'#D4956A', addr:'Monteliusvagen Stockholm'},
      {name:'Fabrique Bakery', type:'Goûter · 16h30', color:'#C6B59A', addr:'Fabrique Bakery Stockholm'},
      {name:'Wood Stockholm', type:'Dîner · 20h30', color:'#1D1D1B', addr:'Wood Stockholm'}
    ]
  },
  day2: {
    query: 'Fjaderholmarna+Stockholm',
    zoom: 12,
    places: [
      {name:'Slussen (ferry)', type:'Départ bateau · 11h', color:'#7BA7BC', addr:'Slussen Stockholm ferry'},
      {name:'Fjäderholmarna', type:'Île · Déjeuner · 12h', color:'#7BA7BC', addr:'Fjaderholmarna Stockholm'},
      {name:'Fjäderholmarnas Krog', type:'Déjeuner', color:'#8C9A8B', addr:'Fjaderholmarnas Krog'},
      {name:'Fittja Graffiti Hall', type:'Street art gratuit · 17h30', color:'#D4956A', addr:'Fittja Graffiti Hall Stockholm'},
      {name:'Riche', type:'Dîner · 20h', color:'#1D1D1B', addr:'Riche Stockholm'}
    ]
  },
  day3: {
    query: 'Gamla+Stan+Stockholm',
    zoom: 14,
    places: [
      {name:'Café Pascal', type:'Brunch · 11h30', color:'#8C9A8B', addr:'Cafe Pascal Stockholm'},
      {name:'Gamla Stan', type:'Balade · 13h', color:'#D4956A', addr:'Gamla Stan Stockholm'},
      {name:'Stortorget', type:'Place historique', color:'#D4956A', addr:'Stortorget Stockholm'},
      {name:'Palais Royal', type:'Architecture', color:'#C6B59A', addr:'Royal Palace Stockholm'},
      {name:'Djurgården', type:'Parc · promenade', color:'#8C9A8B', addr:'Djurgarden Stockholm'},
      {name:'Malvas Glutenfria', type:'Goûter semlor · 16h', color:'#C6B59A', addr:'Malvas Glutenfria Bageri Stockholm'},
      {name:'GAZZA ✓', type:'Réservé · 20h45', color:'#1D1D1B', addr:'Gazza Stockholm'}
    ]
  },
  day4: {
    query: 'Stockholm+City+Center',
    zoom: 14,
    places: [
      {name:'Villa Dahlia', type:'Sauna · 12h', color:'#C6B59A', addr:'Villa Dahlia Stockholm'},
      {name:'Déjeuner léger', type:'Avant vol · 13h30', color:'#8C9A8B', addr:'Östermalm Stockholm'},
      {name:'Stockholm Arlanda', type:'Aéroport · départ', color:'#1D1D1B', addr:'Stockholm Arlanda Airport'}
    ]
  }
};

function selectMapDay(day) {
  currentMapDay = day;
  document.querySelectorAll('.map-day-tab').forEach(function(t){ t.classList.remove('active'); });
  var tab = document.getElementById('map-tab-'+day);
  if (tab) tab.classList.add('active');
  renderMapDay(day);
}

function renderMapDay(day) {
  var mapData = MAP_DATA[day] || MAP_DATA.all;
  
  // Mettre à jour l'iframe Maps
  var iframe = document.getElementById('map-iframe');
  var loading = document.getElementById('map-loading');
  if (iframe) {
    if (loading) loading.style.display = 'flex';
    // Utiliser un embed Google Maps search
    var q = encodeURIComponent(mapData.query.replace(/\+/g,' '));
    iframe.src = 'https://maps.google.com/maps?q='+q+'&z='+mapData.zoom+'&output=embed&hl=fr';
    iframe.onload = function() { if(loading) loading.style.display='none'; };
  }
  
  // Mettre à jour le bouton "Ouvrir dans Maps"
  var openBtn = document.getElementById('map-open-btn');
  if (openBtn) {
    openBtn.href = 'https://maps.google.com/maps?q='+encodeURIComponent(mapData.query.replace(/\+/g,' '));
  }
  
  // Rendre la liste des lieux
  var container = document.getElementById('map-places-items');
  if (!container) return;
  container.innerHTML = mapData.places.map(function(p) {
    return '<a class="map-place-item" href="https://maps.google.com/?q='+encodeURIComponent(p.addr)+'" target="_blank">'
      + '<div class="map-place-dot" style="background:'+p.color+';"></div>'
      + '<div style="flex:1;">'
        + '<div style="font-family:var(--serif);font-size:17px;font-weight:400;color:var(--text);line-height:1.2;">'+p.name+'</div>'
        + '<div style="font-size:11px;color:var(--text-muted);font-weight:300;margin-top:2px;">'+p.type+'</div>'
      + '</div>'
      + '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--text-light)" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>'
    + '</a>';
  }).join('');
}

// ══════════════════════════════════════
// CUSTOM STEPS — injection dans timeline
// ══════════════════════════════════════
async function loadCustomSteps() {
  var data = await sbFetch(SB_STEPS+'?order=created_at.asc');
  if (data && Array.isArray(data)) {
    customSteps = data;
    try { localStorage.setItem('custom_steps_cache', JSON.stringify(customSteps)); } catch(e){}
  } else {
    customSteps = JSON.parse(localStorage.getItem('custom_steps_cache')||'[]');
  }
  renderAllCustomSteps();
  setTimeout(loadCustomSteps, 30000);
}

function timeToMin(t) { if(!t) return 9999; var p=t.split(':'); return parseInt(p[0],10)*60+(parseInt(p[1],10)||0); }

function renderAllCustomSteps() {
  ['arrival','day1','day2','day3','day4'].forEach(function(day){ renderCustomStepsForDay(day); });
  updateSyncBadge();
}

function renderCustomStepsForDay(day) {
  var tl=document.getElementById('timeline-'+day); if(!tl) return;
  tl.querySelectorAll('.custom-injected').forEach(function(el){ el.remove(); });
  var steps=customSteps.filter(function(s){ return s.day===day; }); if(!steps.length) return;
  var existing=Array.from(tl.querySelectorAll('.timeline-item:not(.custom-injected)'));
  steps.forEach(function(step){
    var sm=timeToMin(step.time), insertBefore=null;
    for(var i=0;i<existing.length;i++){
      var te=existing[i].querySelector('.timeline-time');
      if(te && timeToMin(te.textContent.trim())>sm){ insertBefore=existing[i]; break; }
    }
    var card=buildCustomItem(step);
    if(insertBefore) tl.insertBefore(card,insertBefore); else tl.appendChild(card);
  });
}

function buildCustomItem(step) {
  var wrap=document.createElement('div');
  wrap.className='timeline-item custom-injected';
  var typeMap={restaurant:'\uD83C\uDF7D Restaurant',brunch:'\u2615 Brunch',visit:'\uD83C\uDFDB Visite',walk:'\uD83D\uDEB6 Balade',wellness:'\uD83E\uDDD6 Wellness',shopping:'\uD83D\uDECD Shopping',bar:'\uD83C\uDF78 Bar',other:'\u2746 Autre'};
  var mapsUrl='https://maps.google.com/?q='+encodeURIComponent((step.address||step.name)+' Stockholm');
  var photoHtml=step.photo?'<div style="margin:-16px -18px 14px;height:120px;background:url(\''+step.photo+'\') center/cover;border-radius:12px 12px 0 0;"></div>':'';
  var noteHtml=step.note?'<div class="event-note">'+step.note+'</div>':'';
  var addrHtml=step.address?'<a class="map-btn" href="'+mapsUrl+'" target="_blank"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>'+step.address+'</a>':'';
  wrap.innerHTML='<div class="timeline-left"><div class="timeline-time">'+(step.time||'')+'</div><div class="timeline-line"></div></div>'
    +'<div class="timeline-dot" style="background:var(--highlight);box-shadow:0 0 0 1px var(--highlight);"></div>'
    +'<div class="event-card" style="border-left:2px solid rgba(198,181,154,0.5);position:relative;">'
      +'<div style="position:absolute;top:10px;right:10px;display:flex;gap:5px;">'
        +'<a href="'+mapsUrl+'" target="_blank" class="icon-btn" title="Maps"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg></a>'
        +'<button class="icon-btn" onclick="openEditStep(\''+step.id+'\')" title="Modifier" style="color:var(--accent-dark);"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>'
        +'<button class="icon-btn" onclick="deleteStep(\''+step.id+'\')" title="Supprimer" style="color:#b85c50;"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/></svg></button>'
      +'</div>'
      +photoHtml
      +'<div class="event-type-tag" style="background:rgba(198,181,154,0.15);color:var(--highlight);">'+(typeMap[step.type]||'\u2746')+'</div>'
      +'<div class="event-title">'+step.name+'</div>'
      +noteHtml+addrHtml
    +'</div>';
  return wrap;
}

function updateSyncBadge() {
  var el=document.getElementById('sync-status'); if(!el) return;
  if(customSteps.length>0){ el.style.display='block'; el.textContent='\u2746 '+customSteps.length+' ajout'+(customSteps.length>1?'s':'')+' partagé'+(customSteps.length>1?'s':'')+' avec Lucie'; }
  else el.style.display='none';
}

async function deleteStep(id) {
  if(!confirm('Supprimer cette étape ?')) return;
  await sbFetch(SB_STEPS+'?id=eq.'+id,'DELETE');
  customSteps=customSteps.filter(function(s){return s.id!==id;});
  try{localStorage.setItem('custom_steps_cache',JSON.stringify(customSteps));}catch(e){}
  renderAllCustomSteps();
}

// ══════════════════════════════════════
// MODAL AJOUTER/MODIFIER ÉTAPE CUSTOM
// ══════════════════════════════════════
function openEditModal() {
  editingStepId=null;
  var modal=document.getElementById('edit-modal'); if(!modal) return;
  var titleEl=document.querySelector('#edit-modal > div:first-child > div:first-child');
  if(titleEl) titleEl.textContent='Ajouter une étape';
  var btn=document.getElementById('submit-btn'); if(btn) btn.textContent="Ajouter à l'itinéraire";
  modal.style.display='flex'; document.body.style.overflow='hidden';
  var ds=document.getElementById('new-day');
  if(ds && ['arrival','day1','day2','day3','day4'].indexOf(currentPage)>-1) ds.value=currentPage;
}

function closeEditModal() {
  editingStepId=null;
  var modal=document.getElementById('edit-modal'); if(!modal) return;
  modal.style.display='none'; document.body.style.overflow='';
  ['new-name','new-address','new-note'].forEach(function(id){ var el=document.getElementById(id); if(el) el.value=''; });
  var te=document.getElementById('new-time'); if(te) te.value='';
  var pp=document.getElementById('photo-preview'); if(pp) pp.style.backgroundImage='';
  var st=document.getElementById('submit-status'); if(st) st.style.display='none';
  var mp=document.getElementById('maps-preview'); if(mp) mp.style.display='none';
  selectedPhotoBase64=null;
  var titleEl=document.querySelector('#edit-modal > div:first-child > div:first-child');
  if(titleEl) titleEl.textContent='Ajouter une étape';
  var btn=document.getElementById('submit-btn'); if(btn) btn.textContent="Ajouter à l'itinéraire";
}

function openEditStep(id) {
  var step=customSteps.find(function(s){return s.id===id;}); if(!step) return;
  editingStepId=id;
  document.getElementById('new-name').value=step.name||'';
  document.getElementById('new-address').value=step.address||'';
  document.getElementById('new-type').value=step.type||'restaurant';
  document.getElementById('new-day').value=step.day||'day1';
  document.getElementById('new-time').value=step.time||'';
  document.getElementById('new-note').value=step.note||'';
  if(step.photo){ var pp=document.getElementById('photo-preview'); if(pp) pp.style.backgroundImage='url('+step.photo+')'; selectedPhotoBase64=step.photo; }
  var titleEl=document.querySelector('#edit-modal > div:first-child > div:first-child');
  if(titleEl) titleEl.textContent="Modifier l'étape";
  var btn=document.getElementById('submit-btn'); if(btn) btn.textContent='Enregistrer';
  var modal=document.getElementById('edit-modal'); if(!modal) return;
  modal.style.display='flex'; document.body.style.overflow='hidden';
}

function handlePhotoSelect(input) {
  var file=input.files[0]; if(!file) return;
  var reader=new FileReader();
  reader.onload=function(e){
    var img=new Image();
    img.onload=function(){
      var canvas=document.createElement('canvas'),MAX=800,w=img.width,h=img.height;
      if(w>MAX){h=Math.round(h*MAX/w);w=MAX;} if(h>MAX){w=Math.round(w*MAX/h);h=MAX;}
      canvas.width=w;canvas.height=h;canvas.getContext('2d').drawImage(img,0,0,w,h);
      selectedPhotoBase64=canvas.toDataURL('image/jpeg',0.75);
      var pp=document.getElementById('photo-preview'); if(pp) pp.style.backgroundImage='url('+selectedPhotoBase64+')';
    };img.src=e.target.result;
  };reader.readAsDataURL(file);
}

function updateMapsPreview() {
  var val=document.getElementById('new-address').value.trim();
  var preview=document.getElementById('maps-preview'),link=document.getElementById('maps-preview-link');
  if(!preview||!link) return;
  if(val.length>3){ link.href='https://maps.google.com/?q='+encodeURIComponent(val); preview.style.display='block'; }
  else preview.style.display='none';
}

async function submitNewStep() {
  var name=document.getElementById('new-name').value.trim();
  if(!name){ alert('Ajoute un nom'); return; }
  var btn=document.getElementById('submit-btn'),status=document.getElementById('submit-status');
  btn.disabled=true;

  if (editingStepId) {
    btn.textContent='Enregistrement…';
    var cur=customSteps.find(function(s){return s.id===editingStepId;});
    var upd={id:editingStepId,name:name,address:document.getElementById('new-address').value.trim(),type:document.getElementById('new-type').value,day:document.getElementById('new-day').value,time:document.getElementById('new-time').value,note:document.getElementById('new-note').value.trim(),photo:selectedPhotoBase64||(cur?cur.photo:null)||null,created_at:(cur?cur.created_at:null)||new Date().toISOString()};
    await sbFetch(SB_STEPS+'?id=eq.'+editingStepId,'DELETE');
    await sbFetch(SB_STEPS,'POST',upd);
    var i=customSteps.findIndex(function(s){return s.id===editingStepId;}); if(i>-1) customSteps[i]=upd;
    try{localStorage.setItem('custom_steps_cache',JSON.stringify(customSteps));}catch(e){}
    renderAllCustomSteps();
    status.textContent='\u2713 Synchronisé avec Lucie'; status.style.display='block';
    btn.disabled=false; btn.textContent='Enregistrer';
    var td=upd.day; setTimeout(function(){closeEditModal();showDay(td);},800);
  } else {
    btn.textContent='Ajout…';
    var step={id:Date.now().toString(),name:name,address:document.getElementById('new-address').value.trim(),type:document.getElementById('new-type').value,day:document.getElementById('new-day').value,time:document.getElementById('new-time').value,note:document.getElementById('new-note').value.trim(),photo:selectedPhotoBase64||null,created_at:new Date().toISOString()};
    var result=await sbFetch(SB_STEPS,'POST',step);
    customSteps.push(step);
    try{localStorage.setItem('custom_steps_cache',JSON.stringify(customSteps));}catch(e){}
    renderAllCustomSteps();
    status.textContent=result?'\u2713 Synchronisé avec Lucie !':'\u2713 Ajouté en local'; status.style.display='block';
    btn.disabled=false; btn.textContent="Ajouter à l'itinéraire";
    var td2=step.day; setTimeout(function(){closeEditModal();showDay(td2);},800);
  }
}

// ══════════════════════════════════════
// ÉDITION ÉTAPES HARDCODÉES — Supabase
// ══════════════════════════════════════
async function loadCardEdits() {
  var data=await sbFetch(SB_CARDS+'?select=card_id,title,note,photo');
  if(data && Array.isArray(data)){
    cardEditsCache={};
    data.forEach(function(row){ cardEditsCache[row.card_id]=row; });
    try{localStorage.setItem('card_edits_cache',JSON.stringify(cardEditsCache));}catch(e){}
  } else {
    try{cardEditsCache=JSON.parse(localStorage.getItem('card_edits_cache')||'{}');}catch(e){cardEditsCache={};}
  }
  applyAllCardEdits();
}

function applyAllCardEdits() {
  Object.keys(cardEditsCache).forEach(function(cardId){ applyCardEdit(cardId,cardEditsCache[cardId]); });
}

function applyCardEdit(cardId, data) {
  var card=document.getElementById(cardId); if(!card||!data) return;
  if(data.title){ var t=card.querySelector('.event-title'); if(t) t.textContent=data.title; }
  if(data.note){
    var n=card.querySelector('.event-desc')||card.querySelector('.event-note');
    if(n){ n.textContent=data.note; }
    else { var t2=card.querySelector('.event-title'); if(t2){ var nn=document.createElement('div'); nn.className='event-note'; nn.textContent=data.note; t2.insertAdjacentElement('afterend',nn); } }
  }
  if(data.photo){
    var photoEl=document.getElementById('ephoto-'+cardId);
    if(photoEl){ photoEl.style.backgroundImage='url('+data.photo+')'; photoEl.classList.add('has-photo'); var sv=photoEl.querySelector('svg'),sp=photoEl.querySelector('span'); if(sv)sv.style.display='none'; if(sp)sp.style.display='none'; }
  }
}

function restoreCardEdits() {
  try{cardEditsCache=JSON.parse(localStorage.getItem('card_edits_cache')||'{}');}catch(e){cardEditsCache={};}
  applyAllCardEdits();
}

function openCardEdit(cardId) {
  editingCardId=cardId; cardEditPhoto=null;
  var card=document.getElementById(cardId); if(!card) return;
  var titleEl=card.querySelector('.event-title');
  var noteEl=card.querySelector('.event-desc')||card.querySelector('.event-note');
  var saved=cardEditsCache[cardId]||{};
  document.getElementById('cedit-title').value=saved.title||(titleEl?titleEl.textContent.trim():'');
  document.getElementById('cedit-note').value=saved.note||(noteEl?noteEl.textContent.trim():'');
  var prevEl=document.getElementById('cedit-photo-preview');
  if(saved.photo && prevEl){ prevEl.style.backgroundImage='url('+saved.photo+')'; cardEditPhoto=saved.photo; }
  else if(prevEl) prevEl.style.backgroundImage='';
  var st=document.getElementById('cedit-status'); if(st) st.style.display='none';
  document.getElementById('card-edit-modal').classList.add('open');
  document.body.style.overflow='hidden';
}

function closeCardEdit() {
  editingCardId=null; cardEditPhoto=null;
  document.getElementById('card-edit-modal').classList.remove('open');
  document.body.style.overflow='';
}

function handleCardPhotoSelect(input) {
  var file=input.files[0]; if(!file) return;
  var reader=new FileReader();
  reader.onload=function(e){
    var img=new Image();
    img.onload=function(){
      var canvas=document.createElement('canvas'),MAX=900,w=img.width,h=img.height;
      if(w>MAX){h=Math.round(h*MAX/w);w=MAX;} if(h>MAX){w=Math.round(w*MAX/h);h=MAX;}
      canvas.width=w;canvas.height=h;canvas.getContext('2d').drawImage(img,0,0,w,h);
      cardEditPhoto=canvas.toDataURL('image/jpeg',0.78);
      var prev=document.getElementById('cedit-photo-preview'); if(prev) prev.style.backgroundImage='url('+cardEditPhoto+')';
    };img.src=e.target.result;
  };reader.readAsDataURL(file);
}

async function saveCardEdit() {
  if(!editingCardId) return;
  var btn=document.getElementById('cedit-save-btn'),status=document.getElementById('cedit-status');
  btn.disabled=true; btn.textContent='Enregistrement…';
  var title=document.getElementById('cedit-title').value.trim();
  var note=document.getElementById('cedit-note').value.trim();
  var existing=cardEditsCache[editingCardId]||{};
  var photo=cardEditPhoto||existing.photo||null;
  var row={card_id:editingCardId,title:title,note:note,photo:photo,updated_at:new Date().toISOString()};
  await sbFetch(SB_CARDS+'?card_id=eq.'+editingCardId,'DELETE');
  var result=await sbFetch(SB_CARDS,'POST',row);
  cardEditsCache[editingCardId]=row;
  try{localStorage.setItem('card_edits_cache',JSON.stringify(cardEditsCache));}catch(e){}
  applyCardEdit(editingCardId,row);
  status.textContent=result?'\u2713 Synchronisé avec Lucie !':'\u2713 Sauvegardé en local';
  status.style.display='block'; btn.disabled=false; btn.textContent='Enregistrer';
  setTimeout(function(){closeCardEdit();},700);
}

// ══════════════════════════════════════
// INSTALL BANNER
// ══════════════════════════════════════
function checkInstallPrompt() {
  if(/iphone|ipad|ipod/i.test(navigator.userAgent) && !window.navigator.standalone && !localStorage.getItem('install-dismissed')){
    setTimeout(function(){ var b=document.getElementById('install-banner'); if(b) b.classList.add('visible'); },3000);
  }
}
function dismissInstall() {
  var b=document.getElementById('install-banner'); if(b) b.classList.remove('visible');
  localStorage.setItem('install-dismissed','1');
}

// ══════════════════════════════════════
// INIT
// ══════════════════════════════════════
document.addEventListener('DOMContentLoaded', function() {
  showPage('home');
  loadWeather();
  checkInstallPrompt();
  restoreFavStates();
  loadCustomSteps();
  loadCardEdits();
  initDayPhotoEdit();
  restoreAllPhotos();
  restoreCardEdits();
  var fc=document.getElementById('fav-count');
  if(fc) fc.textContent=favorites.length+' lieu'+(favorites.length!==1?'x':'');
});

// SW disabled
