'use strict';
(() => {
 const dialog = $('#account-dialog'), status = $('#account-status');
 const config = window.ONECARD_CONFIG || {};
 const smsEnabled = config.smsEnabled !== false;
 if (!smsEnabled) {
  $('#login-method').querySelector('[value="sms"]').disabled = true;
  $('#login-method').querySelector('[value="sms"]').textContent = 'SMS — w przygotowaniu';
 }
 let client, user = null, generation = 0, running = false, request = null, cooldown = 0;
 const guestKey = 'onecard-cards-v1';
 const accountKey = id => `onecard-account-${id}`;
 const say = text => { status.textContent = text; };
 $('#account-button').onclick = () => dialog.showModal();
 $('#close-account').onclick = () => dialog.close();
 const configured = /^https:\/\/[^/]+\.supabase\.co$/.test(config.supabaseUrl || '') && Boolean(config.supabasePublishableKey);
 if (!configured) {
  $('#account-unavailable').hidden = false;
  $('#account-login').hidden = true;
  return;
 }
 try { client = supabase.createClient(config.supabaseUrl, config.supabasePublishableKey, {auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:false}}); }
 catch (_) { say('Nie można uruchomić logowania. Karty lokalne nadal działają.'); return; }
 function envelope(id) {
  const raw = JSON.parse(localStorage.getItem(accountKey(id)) || '{"cards":[],"pending":{}}');
  if (!Array.isArray(raw.cards) || !raw.pending || typeof raw.pending !== 'object' || Array.isArray(raw.pending)) throw Error('Nie można odczytać pamięci konta.');
  return raw;
 }
 const toRow = (card,id,deleted=false) => ({user_id:id,id:card.id,store:card.store,number:card.number,format:card.format || 'CODE_128',color:card.color || '#276749',deleted});
 const fromRow = row => ({id:row.id,store:row.store,number:row.number,format:row.format,color:row.color});
 function persist(next) {
  if (!user) throw Error('Zaloguj się ponownie.');
  const state = envelope(user.id), pending = {...state.pending};
  const before = new Map(state.cards.map(c => [c.id,c])), after = new Map(next.map(c => [c.id,c]));
  for (const card of next) if (JSON.stringify(before.get(card.id)) !== JSON.stringify(card)) pending[card.id] = {revision:crypto.randomUUID(),row:toRow(card,user.id)};
  for (const card of state.cards) if (!after.has(card.id)) pending[card.id] = {revision:crypto.randomUUID(),row:toRow(card,user.id,true)};
  // Cards and pending writes are committed atomically, so an offline save cannot lose its upload.
  localStorage.setItem(accountKey(user.id),JSON.stringify({cards:next,pending}));
 }
 function showUser() {
  $('#account-login').hidden = Boolean(user); $('#account-signed-in').hidden = !user;
  $('#account-button').textContent = user ? 'Moje konto' : 'Konto';
  $('#account-identity').textContent = user ? [user.email,user.phone ? '+'+user.phone.replace(/^\+/,'') : ''].filter(Boolean).join(' · ') : '';
  $('#link-identity').hidden = !user || Boolean(user.email && user.phone) || (!smsEnabled && Boolean(user.email));
  if (user) $('#link-identity').textContent = user.email ? 'Dodaj telefon do tego konta' : 'Dodaj e-mail do tego konta';
 }
 function applySession(session) {
  const next = session?.user || null;
  if (next?.id === user?.id) { user = next; showUser(); return; }
  generation++; user = next; request = null; $('#account-code-form').hidden = true;
  window.onecardPersist = user ? persist : null;
  switchCardProfile(user ? accountKey(user.id) : guestKey); showUser();
  say(user ? 'Zalogowano. Pobieram karty…' : 'Tryb lokalny — bez synchronizacji.');
  if (user) void sync();
 }
 async function sync() {
  if (!user || running) return;
  if (!navigator.onLine) { say('Offline — zmiany na koncie czekają na połączenie.'); return; }
  const id = user.id, epoch = generation; running = true; let again = false;
  try {
   const snapshot = envelope(id), writes = Object.values(snapshot.pending).map(p => p.row);
   say('Synchronizuję karty…');
   if (writes.length) {
    const {error} = await client.from('cards').upsert(writes,{onConflict:'user_id,id'});
    if (error) throw error;
   }
   if (epoch !== generation) return;
   // Read all pages: never treat the API's default row limit as a complete wallet.
   let rows = [], start = 0;
   for (;;) {
    const {data,error} = await client.from('cards').select('id,store,number,format,color,deleted').eq('user_id',id).order('id').range(start,start+499);
    if (error) throw error;
    rows.push(...data); if (data.length < 500) break; start += 500;
   }
   if (epoch !== generation) return;
   const current = envelope(id), pending = {...current.pending};
   for (const [key,entry] of Object.entries(snapshot.pending)) if (pending[key]?.revision === entry.revision) delete pending[key];
   const merged = new Map(rows.filter(r => !r.deleted).map(r => [r.id,fromRow(r)]));
   for (const entry of Object.values(pending)) { if (entry.row.deleted) merged.delete(entry.row.id); else merged.set(entry.row.id,fromRow(entry.row)); }
   const cards = [...merged.values()]; again = Object.keys(pending).length > 0;
   localStorage.setItem(accountKey(id),JSON.stringify({cards,pending}));
   items = cards; render();
   say(Object.keys(pending).length ? 'Zapisano nowe zmiany — czekają na synchronizację.' : 'Karty zsynchronizowane. Są dostępne również offline.');
  } catch (_) {
   if (epoch === generation) say('Nie udało się zsynchronizować. Karty i oczekujące zmiany pozostają na urządzeniu. Spróbuj ponownie.');
  } finally {
   running = false;
   if ((epoch !== generation || again) && user) setTimeout(() => void sync(),0);
  }
 }
 window.addEventListener('onecard-saved',() => { if (user) { say('Karta zapisana na urządzeniu.'); void sync(); } });
 window.addEventListener('online',() => void sync());
 document.addEventListener('visibilitychange',() => { if (!document.hidden) void sync(); });
 $('#sync-cards').onclick = () => void sync();
 $('#import-local-cards').onclick = () => {
  try {
   const guest = JSON.parse(localStorage.getItem(guestKey) || '[]');
   if (!Array.isArray(guest)) throw Error();
   const existing = new Set(items.map(c => `${c.format || 'CODE_128'}\0${c.number}`));
   const additions = [];
   for (const card of guest) {
    const format = card.format || 'CODE_128', key = `${format}\0${card.number}`;
    if (existing.has(key)) continue;
    barcodeSVG(card.number,format);
    if (typeof card.store !== 'string' || !card.store.trim()) throw Error();
    additions.push({...card,id:crypto.randomUUID(),format}); existing.add(key);
   }
   saveCards([...items,...additions]); render(); say(`Skopiowano ${additions.length} kart na konto. Lokalna kopia pozostaje zachowana.`);
  } catch (_) { say('Nie udało się skopiować kart. Dane lokalne pozostają nietknięte.'); }
 };
 $('#sign-out').onclick = async () => {
  if (user) {
   try { if (Object.keys(envelope(user.id).pending).length && !confirm('Nie wszystkie zmiany są zsynchronizowane. Pozostaną na tym urządzeniu do następnego logowania na to samo konto. Wylogować?')) return; }
   catch (_) { say('Nie można sprawdzić zapisu kart. Spróbuj ponownie.'); return; }
  }
  const {error} = await client.auth.signOut({scope:'local'});
  if (error) { say('Nie udało się wylogować. Spróbuj ponownie.'); return; }
  applySession(null);
 };
 function identity() {
  const method = $('#login-method').value, value = $('#login-contact').value.trim();
  if (method === 'sms') {
   if (!smsEnabled) throw Error('Logowanie SMS jest jeszcze w przygotowaniu. Wybierz e-mail.');
   const phone = value.replace(/[\s()-]/g,'');
   if (!/^\+[1-9]\d{7,14}$/.test(phone)) throw Error('Podaj telefon z kodem kraju, np. +48 123 456 789.');
   return {phone};
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) throw Error('Podaj prawidłowy adres e-mail.');
  return {email:value};
 }
 $('#login-method').onchange = () => {
  const sms = $('#login-method').value === 'sms';
  $('#login-contact').type = sms ? 'tel' : 'email'; $('#login-contact').autocomplete = sms ? 'tel' : 'email';
  $('#login-contact').placeholder = sms ? '+48 123 456 789' : 'twoj@email.pl';
 };
 $('#link-identity').onclick = () => {
  $('#account-login').hidden = false; $('#login-method').value = user.email ? 'sms' : 'email';
  $('#login-method').onchange(); $('#login-contact').value = '';
  say('Potwierdź drugi sposób logowania, aby e-mail i telefon prowadziły do tego samego konta.');
 };
 $('#account-login').addEventListener('submit',async event => {
  event.preventDefault(); const button = $('#send-login-code');
  if (Date.now() < cooldown) { say('Poczekaj minutę przed ponownym wysłaniem kodu.'); return; }
  if (!navigator.onLine) { say('Logowanie wymaga internetu.'); return; }
  button.disabled = true;
  try {
   const contact = identity();
   if (user && ((contact.email && user.email) || (contact.phone && user.phone))) throw Error('Ten sposób logowania jest już dodany do konta.');
   const linking = Boolean(user);
   const {error} = linking ? await client.auth.updateUser(contact) : await client.auth.signInWithOtp({...contact,options:{shouldCreateUser:true}});
   if (error) throw Error('Nie udało się wysłać kodu. Sprawdź dane lub spróbuj później.');
   request = {contact,linking}; cooldown = Date.now()+60000;
   $('#account-code-form').hidden = false; $('#login-code').value = ''; $('#login-code').focus();
   say('Kod został wysłany. Wpisz go poniżej.');
  } catch (error) { say(error.message); }
  finally { button.disabled = false; }
 });
 $('#account-code-form').addEventListener('submit',async event => {
  event.preventDefault(); if (!request) return;
  const token = $('#login-code').value.trim(), button = $('#verify-login-code');
  if (!/^\d{6,10}$/.test(token)) { say('Wpisz kod z wiadomości.'); return; }
  button.disabled = true;
  try {
   const {contact,linking} = request;
   const type = contact.phone ? (linking ? 'phone_change' : 'sms') : (linking ? 'email_change' : 'email');
   const {data,error} = await client.auth.verifyOtp({...contact,token,type});
   if (error) throw Error('Kod jest nieprawidłowy lub wygasł. Spróbuj ponownie.');
   if (data.session) applySession(data.session);
   request = null; $('#account-code-form').hidden = true; $('#account-login').hidden = Boolean(user);
   say('Potwierdzono logowanie.'); void sync();
  } catch (error) { say(error.message); }
  finally { button.disabled = false; }
 });
 client.auth.onAuthStateChange((_event,session) => { setTimeout(() => applySession(session),0); });
 client.auth.getSession().then(({data,error}) => { if (error) throw error; applySession(data.session); }).catch(() => say('Nie można odczytać sesji. Spróbuj ponownie z internetem.'));
})();
