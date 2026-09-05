const storageKey = 'onecard-cards-v1';
const list = document.querySelector('#card-list');
const empty = document.querySelector('#empty-state');
const form = document.querySelector('#card-form');
const cardDialog = document.querySelector('#card-dialog');
const barcodeDialog = document.querySelector('#barcode-dialog');
let selectedId = null;
let cameraStream = null;
let scanTimer = null;

const cards = () => JSON.parse(localStorage.getItem(storageKey) || '[]');
const saveCards = (items) => localStorage.setItem(storageKey, JSON.stringify(items));
const escapeHtml = (value) => value.replace(/[&<>'"]/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]));

function render() {
  const items = cards();
  empty.hidden = items.length !== 0;
  list.innerHTML = items.map(card => `<button class="loyalty-card" style="background:${card.color}" data-id="${card.id}"><div><p>KARTA LOJALNOŚCIOWA</p><strong>${escapeHtml(card.store)}</strong></div><span>${escapeHtml(card.number)}</span></button>`).join('');
  document.querySelector('#card-count').textContent = items.length ? `${items.length} ${items.length === 1 ? 'karta' : 'kart/y'} w portfelu` : 'Jeszcze nie masz żadnych kart';
}
function openAdd() { form.reset(); document.querySelector('#card-color').value = '#276749'; cardDialog.showModal(); document.querySelector('#store-name').focus(); }
function openAddWithNumber(number = '') { openAdd(); document.querySelector('#card-number').value = number; if (number) document.querySelector('#store-name').focus(); }
function stopScanner() { clearInterval(scanTimer); scanTimer = null; if (cameraStream) cameraStream.getTracks().forEach(track => track.stop()); cameraStream = null; }
async function openScanner() {
  const dialog = document.querySelector('#scan-dialog'); const status = document.querySelector('#scanner-status'); const video = document.querySelector('#camera');
  const frame = document.querySelector('.camera-frame'); frame.hidden = false;
  dialog.showModal();
  if (!('BarcodeDetector' in window) || !navigator.mediaDevices?.getUserMedia) { frame.hidden = true; status.textContent = 'Skaner uruchomimy na telefonie. Na tym komputerze możesz dodać kartę ręcznie.'; return; }
  try {
    status.textContent = 'Uruchamiam aparat…';
    cameraStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
    video.srcObject = cameraStream; await video.play();
    const detector = new BarcodeDetector({ formats: ['code_128', 'ean_13', 'ean_8', 'upc_a', 'qr_code'] });
    status.textContent = 'Ustaw kod w zielonej linii.';
    scanTimer = setInterval(async () => {
      if (video.readyState < 2) return;
      try { const found = await detector.detect(video); if (found[0]?.rawValue) { const number = found[0].rawValue; stopScanner(); dialog.close(); openAddWithNumber(number); } } catch (_) { /* Kolejna klatka spróbuje ponownie. */ }
    }, 250);
  } catch (_) { stopScanner(); status.textContent = 'Nie udało się uruchomić aparatu. Sprawdź zgodę na aparat lub wpisz numer ręcznie.'; }
}
function openBarcode(id) {
  const card = cards().find(item => item.id === id); if (!card) return;
  selectedId = id; document.querySelector('#barcode-store').textContent = card.store; document.querySelector('#barcode-number').textContent = card.number;
  barcodeDialog.showModal();
  if (window.JsBarcode) JsBarcode('#barcode', card.number, { format: 'CODE128', displayValue: false, margin: 0, height: 100 });
  else document.querySelector('#barcode').innerHTML = '<text x="10" y="50">Brak połączenia z generatorem kodu.</text>';
}
document.querySelector('#add-card').onclick = openAdd; document.querySelector('#add-first-card').onclick = openAdd; document.querySelector('#scan-card').onclick = openScanner;
document.querySelector('#close-dialog').onclick = () => cardDialog.close(); document.querySelector('#cancel').onclick = () => cardDialog.close(); document.querySelector('#close-barcode').onclick = () => barcodeDialog.close();
document.querySelector('#close-scanner').onclick = () => { stopScanner(); document.querySelector('#scan-dialog').close(); };
document.querySelector('#manual-from-scanner').onclick = () => { stopScanner(); document.querySelector('#scan-dialog').close(); openAdd(); };
document.querySelector('#scan-dialog').addEventListener('close', stopScanner);
form.addEventListener('submit', event => { event.preventDefault(); const data = new FormData(form); const item = { id: crypto.randomUUID(), store: data.get('store-name').trim(), number: data.get('card-number').trim(), color: data.get('card-color') }; saveCards([...cards(), item]); cardDialog.close(); render(); });
list.addEventListener('click', event => { const button = event.target.closest('[data-id]'); if (button) openBarcode(button.dataset.id); });
document.querySelector('#delete-card').onclick = () => { saveCards(cards().filter(card => card.id !== selectedId)); barcodeDialog.close(); render(); };
render();
if ('serviceWorker' in navigator) navigator.serviceWorker.register('./service-worker.js').catch(() => {});
