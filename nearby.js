'use strict';
(() => {
 const button = $('#find-nearby'), cancel = $('#cancel-nearby'), status = $('#nearby-status'), results = $('#nearby-results');
 let epoch = 0, controller, nextRequest = 0, expiry, profile = storageKey;
 const normalize = value => String(value || '').toLowerCase().replace(/ł/g,'l').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]/g,'');
 const groups = ['lidl','biedronka','carrefour','topaz','rossmann','leroymerlin','ikea','jula','kaufland','auchan','stokrotka','hebe','douglas','sephora','superpharm','empik','decathlon','hm','orlen','shell','circlek','polomarket','intermarche'];
 function brand(value) {
  const key = normalize(value);
  if (key.includes('zabka') || key.includes('zappka')) return 'zabka';
  return groups.find(name => key === name || (name.length > 3 && key.includes(name))) || key;
 }
 function distance(a,b) {
  const rad = Math.PI / 180, dLat = (b.lat-a.lat)*rad, dLon = (b.lon-a.lon)*rad;
  const h = Math.sin(dLat/2)**2 + Math.cos(a.lat*rad)*Math.cos(b.lat*rad)*Math.sin(dLon/2)**2;
  return 6371000 * 2 * Math.asin(Math.sqrt(Math.min(1,h)));
 }
 function stop(text) {
  epoch++; controller?.abort(); clearTimeout(expiry); results.replaceChildren();
  button.disabled = false; cancel.hidden = true;
  if (text !== undefined) status.textContent = text;
 }
 cancel.onclick = () => stop('Wyszukiwanie anulowane.');
 window.addEventListener('onecard-rendered',() => {
  if (profile !== storageKey) { profile = storageKey; stop(''); }
  else if (results.childElementCount) stop('Portfel został odświeżony. Wyszukaj sklep ponownie.');
 });
 document.addEventListener('visibilitychange',() => { if (document.hidden) stop('Wyszukaj ponownie po powrocie do aplikacji.'); });
 window.addEventListener('pagehide',() => stop());
 button.onclick = async () => {
  stop('');
  if (!storageKey || !items.length) { status.textContent = 'Najpierw otwórz portfel i dodaj kartę z nazwą sklepu, np. Lidl.'; return; }
  if (!navigator.onLine) { status.textContent = 'Wyszukiwanie wymaga internetu. Zapisane karty nadal działają offline.'; return; }
  if (!navigator.geolocation || !window.isSecureContext) { status.textContent = 'Lokalizacja jest niedostępna w tej przeglądarce.'; return; }
  if (Date.now() < nextRequest) { status.textContent = 'Poczekaj chwilę przed kolejnym wyszukiwaniem (do 30 sekund).'; return; }
  const run = epoch, key = storageKey;
  button.disabled = true; cancel.hidden = false; status.textContent = 'Czekam na lokalizację i Twoją zgodę…';
  try {
   const position = await new Promise((resolve,reject) => navigator.geolocation.getCurrentPosition(resolve,reject,{enableHighAccuracy:true,timeout:15000,maximumAge:0}));
   if (run !== epoch || key !== storageKey) return;
   const {latitude,longitude,accuracy} = position.coords;
   if (![latitude,longitude,accuracy].every(Number.isFinite) || accuracy < 0 || accuracy > 250 || Math.abs(latitude)>90 || Math.abs(longitude)>180) throw Error('Lokalizacja jest zbyt niedokładna. Spróbuj bliżej wejścia lub wybierz kartę ręcznie.');
   const lat = Number(latitude.toFixed(3)), lon = Number(longitude.toFixed(3));
   const currentController = new AbortController(); controller = currentController; nextRequest = Date.now()+30000;
   status.textContent = 'Szukam pobliskich sklepów…';
   const timeout = setTimeout(() => currentController.abort(),22000);
   let data;
   try {
    const query = `[out:json][timeout:15];(nwr(around:500,${lat},${lon})[shop];nwr(around:500,${lat},${lon})[amenity=fuel];);out center tags;`;
    const response = await fetch('https://overpass-api.de/api/interpreter',{method:'POST',body:new URLSearchParams({data:query}),signal:currentController.signal,credentials:'omit',referrerPolicy:'no-referrer'});
    if (!response.ok) throw Error('Usługa sklepów jest chwilowo zajęta. Spróbuj później lub wybierz kartę ręcznie.');
    data = await response.json();
   } finally { clearTimeout(timeout); }
   if (run !== epoch || key !== storageKey) return;
   if (!Array.isArray(data.elements) || data.remark) throw Error('Nie udało się pobrać pełnych wyników. Spróbuj ponownie później.');
   const matches = new Map();
   for (const element of data.elements) {
    const point = element.center || element, tags = element.tags || {};
    if (!Number.isFinite(point.lat) || !Number.isFinite(point.lon)) continue;
    const metres = distance({lat:latitude,lon:longitude},point);
    if (metres > 300) continue;
    const identities = [tags.brand,tags.name].filter(Boolean).map(brand);
    for (const card of items) {
     if (!identities.includes(brand(card.store))) continue;
     if (!matches.has(card.id) || matches.get(card.id).metres > metres) matches.set(card.id,{card,metres,name:tags.name || tags.brand || card.store});
    }
   }
   const nearby = [...matches.values()].sort((a,b) => a.metres-b.metres).slice(0,8);
   status.textContent = nearby.length ? `Pasujące karty w pobliżu: ${nearby.length}. Sprawdź nazwę sklepu i pokaż właściwy kod. Dokładność lokalizacji: około ${Math.round(accuracy)} m.` : 'Nie znaleziono pobliskiego sklepu pasującego do Twoich kart. Sprawdź nazwę zapisanej karty lub wybierz ją ręcznie.';
   for (const match of nearby) {
    const item = document.createElement('button'); item.className = 'nearby-card';
    const title = document.createElement('strong'), detail = document.createElement('span');
    title.textContent = `Pokaż kartę: ${match.card.store}`;
    detail.textContent = `${match.name} · około ${Math.round(match.metres / 10)*10} m`;
    item.append(title,detail);
    item.onclick = () => { if (run === epoch && key === storageKey && items.some(c => c.id === match.card.id)) openBarcode(match.card.id); };
    results.append(item);
   }
   expiry = setTimeout(() => stop('Sugestia wygasła. Wyszukaj ponownie, aby sprawdzić aktualne położenie.'),120000);
  } catch (error) {
   if (run !== epoch) return;
   status.textContent = error.code === 1 ? 'Brak zgody na lokalizację. Możesz nadal wybierać karty ręcznie.' : error.code === 2 || error.code === 3 ? 'Nie udało się ustalić lokalizacji. Spróbuj ponownie lub wybierz kartę ręcznie.' : error.name === 'AbortError' ? 'Wyszukiwanie trwało zbyt długo. Spróbuj później.' : error instanceof TypeError ? 'Nie udało się połączyć z usługą sklepów. Wybierz kartę ręcznie lub spróbuj później.' : error.message || 'Nie udało się wyszukać sklepu.';
  } finally { if (run === epoch) { button.disabled = false; cancel.hidden = true; } }
 };
})();
