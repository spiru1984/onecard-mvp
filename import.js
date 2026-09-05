'use strict';
const photoInput = document.querySelector('#card-photo');
const importStatus = document.querySelector('#import-status');
const importButton = document.querySelector('#import-card');
let importingPhoto = false;
importButton.addEventListener('click', () => photoInput.click());
photoInput.addEventListener('change', async () => {
 const file = photoInput.files[0]; photoInput.value = '';
 if (!file || importingPhoto) return;
 importingPhoto = true; importButton.disabled = true;
 importStatus.textContent = 'Odczytuję kod ze zdjęcia…';
 const url = URL.createObjectURL(file);
 try {
  if (file.size > 20 * 1024 * 1024) throw Error('Zdjęcie jest za duże. Wybierz plik do 20 MB lub zrzut ekranu.');
  const image = new Image(); image.src = url;
  try { await image.decode(); } catch (_) { throw Error('Nie można otworzyć tego zdjęcia. Wybierz zrzut ekranu PNG lub zdjęcie JPG.'); }
  if (!image.naturalWidth || !image.naturalHeight || image.naturalWidth * image.naturalHeight > 60000000) throw Error('Wybierz mniejsze zdjęcie lub zrzut ekranu samej karty.');
  const reader = new ZXingBrowser.BrowserMultiFormatReader();
  reader.possibleFormats = Object.values(formats).map(f => f.id);
  const result = await decodeCardPhoto(image, reader);
  if (!result) throw Error('Nie znaleziono kodu. Przytnij zdjęcie do jednej karty, zostaw biały margines wokół całego kodu i spróbuj ponownie.');
  importStatus.textContent = 'Odczytano kod. Sprawdź numer i format, podaj sklep i zapisz kartę.';
  if (cardDialog.open) cardDialog.close();
  openAdd(result.number, result.format);
 } catch (error) { importStatus.textContent = error.message || 'Nie udało się odczytać zdjęcia.'; }
 finally { URL.revokeObjectURL(url); importingPhoto = false; importButton.disabled = false; }
});
async function decodeCardPhoto(image, reader) {
 const w = image.naturalWidth, h = image.naturalHeight;
 // Full image first, then overlapping vertical bands for small codes in tall screenshots.
 const regions = [[0,0,w,h]];
 if (h > w) for (const y of [0,0.25,0.5]) regions.push([0,h*y,w,h*0.5]);
 else for (const x of [0,0.25,0.5]) regions.push([w*x,0,w*0.5,h]);
 const canvas = document.createElement('canvas');
 const ctx = canvas.getContext('2d',{willReadFrequently:true});
 for (const region of regions) for (const maxSize of [1600,2600]) for (const rotate of [false,true]) {
  await new Promise(resolve => setTimeout(resolve,0));
  const [x,y,rw,rh] = region, scale = Math.min(2,maxSize/Math.max(rw,rh));
  const dw = Math.max(1,Math.round(rw*scale)), dh = Math.max(1,Math.round(rh*scale));
  canvas.width = rotate ? dh : dw; canvas.height = rotate ? dw : dh;
  ctx.fillStyle = '#fff'; ctx.fillRect(0,0,canvas.width,canvas.height);
  ctx.save(); if (rotate) { ctx.translate(canvas.width,0); ctx.rotate(Math.PI/2); }
  ctx.drawImage(image,x,y,rw,rh,0,0,dw,dh); ctx.restore();
  try {
   const found = reader.decodeFromCanvas(canvas);
   const format = Object.keys(formats).find(key => formats[key].id === found.getBarcodeFormat());
   const number = found.getText();
   if (format && number) { barcodeSVG(number,format); return {number,format}; }
  } catch (_) { /* Try another orientation, size or screenshot region. */ }
 }
 return null;
}
