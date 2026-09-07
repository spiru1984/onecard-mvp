'use strict';
const localHiddenKey = 'onecard-local-hidden';
let storageKey = 'onecard-cards-v1';
try { if (localStorage.getItem(localHiddenKey) === '1') storageKey = null; } catch (_) {}
const $ = s => document.querySelector(s);
const form = $('#card-form'), cardDialog = $('#card-dialog'), barcodeDialog = $('#barcode-dialog'), scanDialog = $('#scan-dialog');
// ZXing BarcodeFormat values. Store both the exact payload and its symbology.
const formats = {
 CODE_128: {id:4,bcid:'code128',label:'Code 128'}, EAN_13:{id:7,bcid:'ean13',label:'EAN-13'},
 EAN_8:{id:6,bcid:'ean8',label:'EAN-8'}, UPC_A:{id:14,bcid:'upca',label:'UPC-A'},
 CODE_39:{id:2,bcid:'code39',label:'Code 39'},
 QR_CODE:{id:11,bcid:'qrcode',label:'QR',square:true}, DATA_MATRIX:{id:5,bcid:'datamatrix',label:'Data Matrix',square:true},
 AZTEC:{id:0,bcid:'azteccode',label:'Aztec',square:true}, PDF_417:{id:10,bcid:'pdf417',label:'PDF417'}
};
let selectedId = null, cameraStream = null, scanTimer = null, scanSession = 0, storageHealthy = true, items = [];
function message(text) { $('#app-status').textContent = text; }
function loadCards() {
 if (!storageKey) { items = []; return; }
 try {
  const raw = JSON.parse(localStorage.getItem(storageKey) || '[]');
  const stored = Array.isArray(raw) ? raw : raw.cards;
  if (!Array.isArray(stored) || stored.some(c => !c || typeof c.id !== 'string' || typeof c.store !== 'string' || typeof c.number !== 'string')) throw Error('Invalid storage');
  items = stored;
 } catch (_) { storageHealthy = false; message('Nie można odczytać zapisanych kart. Dane pozostają nietknięte. Sprawdź ustawienia pamięci przeglądarki.'); }
}
function saveCards(next) {
 if (!storageKey) throw Error('Zaloguj się lub wybierz Portfel lokalny.');
 if (!storageHealthy) throw Error('Pamięć kart jest niedostępna. Nie nadpisano danych.');
 try { if (window.onecardPersist) window.onecardPersist(next); else localStorage.setItem(storageKey, JSON.stringify(next)); }
 catch (_) { throw Error('Nie udało się zapisać karty. Zwolnij miejsce lub zezwól na zapis danych w przeglądarce.'); }
 items = next;
 window.dispatchEvent(new Event('onecard-saved'));
}
function render() {
 const locked = !storageKey;
 $('#local-wallet').hidden = !locked;
 for (const id of ['add-card','scan-card','import-card','add-first-card']) $('#'+id).disabled = locked;
 $('#empty-description').textContent = locked ? 'Zaloguj się, aby zobaczyć karty konta, lub wybierz Portfel lokalny, aby otworzyć karty tego urządzenia.' : (storageKey === 'onecard-cards-v1' ? 'Dodaj pierwszą kartę. Zapiszemy ją lokalnie na tym urządzeniu.' : 'To portfel Twojego konta. Dodaj kartę lub świadomie skopiuj karty lokalne w ustawieniach konta.');
 if (locked) message('Wylogowano — karty urządzenia są ukryte.');
 $('#empty-state').hidden = items.length !== 0; $('#card-list').replaceChildren();
 for (const card of items) {
  const button = document.createElement('button'); button.className = 'loyalty-card'; button.dataset.id = card.id;
  button.style.backgroundColor = /^#[0-9a-f]{6}$/i.test(card.color) ? card.color : '#276749';
  const top = document.createElement('div'), label = document.createElement('p'), name = document.createElement('strong'), number = document.createElement('span');
  label.textContent = 'KARTA LOJALNOŚCIOWA'; name.textContent = card.store; number.textContent = card.number;
  top.append(label,name); button.append(top,number); $('#card-list').append(button);
 }
 $('#card-count').textContent = items.length ? `${items.length} kart/y w portfelu` : 'Jeszcze nie masz żadnych kart';
}
function barcodeSVG(number,format) {
 if (!formats[format] || !number || number.length > 2048) throw Error('Nieprawidłowy kod.');
 return bwipjs.toSVG({bcid:formats[format].bcid,text:number,scale:3,...(formats[format].square ? {} : {height:22}),padding:12,backgroundcolor:'FFFFFF',barcolor:'000000',includetext:false});
}
function openAdd(number = '',format = 'CODE_128') {
 if (!storageKey) return;
 form.reset(); $('#form-error').textContent = ''; $('#card-number').value = number; $('#card-format').value = format;
 cardDialog.showModal(); $('#store-name').focus();
}
function stopScanner() {
 scanSession++; clearTimeout(scanTimer); scanTimer = null;
 if (cameraStream) cameraStream.getTracks().forEach(t => t.stop());
 cameraStream = null; $('#camera').srcObject = null;
}
async function openScanner() {
 stopScanner(); const session = scanSession;
 scanDialog.showModal(); $('.camera-frame').hidden = false;
 const status = $('#scanner-status'), video = $('#camera');
 if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) { status.textContent = 'Aparat wymaga bezpiecznej strony HTTPS. Możesz też wpisać kod ręcznie.'; return; }
 try {
  status.textContent = 'Uruchamiam aparat…';
  const reader = new ZXingBrowser.BrowserMultiFormatReader(); reader.possibleFormats = Object.values(formats).map(f => f.id);
  const stream = await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'},width:{ideal:1280},height:{ideal:720}},audio:false});
  if (session !== scanSession || !scanDialog.open) { stream.getTracks().forEach(t => t.stop()); return; }
  cameraStream = stream; video.srcObject = stream; await video.play();
  if (session !== scanSession) return;
  status.textContent = 'Ustaw cały kod w ramce. Odsuń aparat, jeśli obraz jest nieostry.';
  const canvas = document.createElement('canvas'), context = canvas.getContext('2d',{willReadFrequently:true});
  function scan() {
   if (session !== scanSession || !scanDialog.open) return;
   if (video.readyState >= 2 && video.videoWidth) {
    canvas.width = video.videoWidth; canvas.height = video.videoHeight; context.drawImage(video,0,0);
    try {
     const result = reader.decodeFromCanvas(canvas), format = Object.keys(formats).find(key => formats[key].id === result.getBarcodeFormat()), number = result.getText();
     if (format && number) { barcodeSVG(number,format); stopScanner(); scanDialog.close(); openAdd(number,format); return; }
    } catch (_) { /* Frames without a readable, reproducible barcode are normal. */ }
   }
   scanTimer = setTimeout(scan,200);
  }
  scan();
 } catch (error) {
  if (session !== scanSession) return;
  stopScanner(); $('.camera-frame').hidden = true;
  status.textContent = error.name === 'NotAllowedError' ? 'Brak zgody na aparat. Zezwól na aparat w ustawieniach tej strony i spróbuj ponownie.' : 'Nie udało się uruchomić aparatu. Zamknij inne aplikacje używające aparatu i spróbuj ponownie.';
 }
}
function openBarcode(id) {
 const card = items.find(c => c.id === id); if (!card) return;
 selectedId = id; $('#barcode-store').textContent = card.store; $('#barcode-number').textContent = card.number;
 const format = card.format || 'CODE_128'; // Existing MVP cards retain their original rendering.
 $('#barcode-format').textContent = formats[format]?.label || format;
 $('#barcode').replaceChildren(); $('#barcode-error').textContent = '';
 try { $('#barcode').innerHTML = barcodeSVG(card.number,format); $('#barcode').classList.toggle('square-code',Boolean(formats[format].square)); }
 catch (_) { $('#barcode-error').textContent = 'Nie można wyświetlić tego kodu. Użyj oryginalnej karty.'; }
 barcodeDialog.showModal();
}
for (const [value,format] of Object.entries(formats)) { const option = document.createElement('option'); option.value = value; option.textContent = format.label; $('#card-format').append(option); }
$('#add-card').onclick = () => openAdd(); $('#add-first-card').onclick = () => openAdd(); $('#scan-card').onclick = openScanner;
$('#close-dialog').onclick = $('#cancel').onclick = () => cardDialog.close(); $('#close-barcode').onclick = () => barcodeDialog.close();
$('#close-scanner').onclick = () => { stopScanner(); scanDialog.close(); };
$('#manual-from-scanner').onclick = () => { stopScanner(); scanDialog.close(); openAdd(); };
scanDialog.addEventListener('close',() => { if (!scanDialog.open) stopScanner(); }); scanDialog.addEventListener('cancel',stopScanner);
document.addEventListener('visibilitychange',() => { if (document.hidden && scanDialog.open) { stopScanner(); scanDialog.close(); } });
window.addEventListener('pagehide',stopScanner);
form.addEventListener('submit',event => {
 event.preventDefault(); $('#form-error').textContent = '';
 const store = $('#store-name').value.trim(), number = $('#card-number').value, format = $('#card-format').value;
 if (!store) { $('#form-error').textContent = 'Podaj nazwę sklepu.'; return; }
 try { barcodeSVG(number,format); } catch (_) { $('#form-error').textContent = 'Kod nie pasuje do wybranego formatu. Sprawdź znaki, długość i cyfrę kontrolną.'; return; }
 try { saveCards([...items,{id:crypto.randomUUID(),store,number,format,color:$('#card-color').value}]); cardDialog.close(); render(); message('Karta zapisana na tym urządzeniu.'); }
 catch (error) { $('#form-error').textContent = error.message; }
});
$('#card-list').addEventListener('click',event => { const button = event.target.closest('[data-id]'); if (button) openBarcode(button.dataset.id); });
$('#delete-card').onclick = () => {
 if (!confirm('Usunąć tę kartę z urządzenia?')) return;
 try { saveCards(items.filter(c => c.id !== selectedId)); barcodeDialog.close(); render(); } catch (error) { $('#barcode-error').textContent = error.message; }
};
window.addEventListener('storage',event => { if (event.key === storageKey) { storageHealthy = true; loadCards(); render(); barcodeDialog.close(); } });
loadCards(); render();
if ('serviceWorker' in navigator) navigator.serviceWorker.register('./service-worker.js').then(() => navigator.serviceWorker.ready).then(() => {
 if (storageHealthy && storageKey === 'onecard-cards-v1') message('Gotowe offline — karty pozostają na tym urządzeniu.');
}).catch(() => message('Karty zapisują się lokalnie, ale przygotowanie aplikacji offline nie powiodło się. Otwórz ją ponownie z internetem.'));

function switchCardProfile(key) {
 stopScanner(); scanDialog.close(); cardDialog.close(); barcodeDialog.close();
 storageKey = key; items = []; storageHealthy = true; loadCards(); render();
}

$('#local-wallet').onclick = () => {
 try { localStorage.removeItem(localHiddenKey); } catch (_) { message('Nie można otworzyć portfela lokalnego.'); return; }
 switchCardProfile('onecard-cards-v1'); message('Portfel lokalny — karty tego urządzenia, bez synchronizacji.');
};
