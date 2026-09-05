const {chromium}=require('playwright');
const assert=require('node:assert/strict');
(async()=>{
const browser=await chromium.launch({headless:true,channel: process.env.BROWSER_CHANNEL || undefined});const context=await browser.newContext({viewport:{width:390,height:844}});const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.goto('http://127.0.0.1:4173');await page.evaluate(()=>navigator.serviceWorker.ready);await page.reload();
const fixtures=[['CODE_128','001234567890'],['EAN_13','5901234123457'],['EAN_8','96385074'],['UPC_A','012345678905'],['CODE_39','ABC123'],['QR_CODE','https://example.com/card?id=00123'],['DATA_MATRIX','ABC123'],['AZTEC','ABC123'],['PDF_417','ABC123']];
for(const [format,number] of fixtures){
 await page.click('#add-card');await page.fill('#store-name',format);await page.fill('#card-number',number);await page.selectOption('#card-format',format);await page.click('#card-form .primary-button');
 assert.equal(await page.locator('#card-dialog').evaluate(e=>e.open),false,format+' saved');
 const result=await page.evaluate(async({format,number})=>{const svg=barcodeSVG(number,format);const img=new Image();const dims=svg.match(/viewBox="0 0 (\d+) (\d+)"/);img.width=Number(dims[1]);img.height=Number(dims[2]);img.src='data:image/svg+xml;base64,'+btoa(unescape(encodeURIComponent(svg.replace('<svg ','<svg width="'+dims[1]+'" height="'+dims[2]+'" '))));await img.decode();const canvas=document.createElement('canvas');canvas.width=img.width;canvas.height=img.height;canvas.getContext('2d').drawImage(img,0,0,canvas.width,canvas.height);const reader=new ZXingBrowser.BrowserMultiFormatReader();reader.possibleFormats=[formats[format].id];let r=reader.decodeFromCanvas(canvas);return {text:r.getText(),format:r.getBarcodeFormat()};},{format,number});
 assert.equal(result.text,number,format+' exact payload round trip');console.log('PASS barcode '+format);
}
await page.locator('.loyalty-card').first().click();assert.equal(await page.locator('#barcode svg').count(),1);await page.click('#close-barcode');
await context.setOffline(true);await page.reload();assert.equal(await page.locator('.loyalty-card').count(),fixtures.length);await page.locator('.loyalty-card').first().click();assert.equal(await page.locator('#barcode svg').count(),1);await page.click('#close-barcode');await page.click('#add-card');await page.fill('#store-name','Offline');await page.fill('#card-number','000123');await page.click('#card-form .primary-button');await page.reload();assert.equal(await page.locator('.loyalty-card').count(),fixtures.length+1);console.log('PASS offline reload, display and save');
await context.setOffline(false);
await page.click('#add-card');await page.fill('#store-name','Invalid');await page.fill('#card-number','5901234123450');await page.selectOption('#card-format','EAN_13');await page.click('#card-form .primary-button');assert.match(await page.locator('#form-error').innerText(),/nie pasuje/);await page.click('#cancel');console.log('PASS invalid checksum rejected');
await page.evaluate(()=>{window.testStopped=false;Object.defineProperty(navigator.mediaDevices,'getUserMedia',{configurable:true,value:()=>new Promise(resolve=>{window.resolveCamera=()=>resolve({getTracks:()=>[{stop:()=>{window.testStopped=true;}}]});})});});
await page.click('#scan-card');await page.click('#close-scanner');await page.evaluate(()=>window.resolveCamera());await page.waitForTimeout(50);assert.equal(await page.evaluate(()=>window.testStopped),true);console.log('PASS late camera permission cleans up stream');
await page.evaluate(()=>Object.defineProperty(navigator.mediaDevices,'getUserMedia',{configurable:true,value:async()=>{throw new DOMException('Denied','NotAllowedError');}}));await page.click('#scan-card');await page.waitForFunction(()=>document.querySelector('#scanner-status').textContent.includes('Brak zgody'));await page.click('#close-scanner');console.log('PASS camera denial');
// Feed a real generated QR image as a video stream into the production scanner.
await page.evaluate(async()=>{const svg=barcodeSVG('00123456789','QR_CODE');const image=new Image();image.src='data:image/svg+xml;base64,'+btoa(svg);await image.decode();const canvas=document.createElement('canvas');canvas.width=640;canvas.height=480;const ctx=canvas.getContext('2d');function draw(){ctx.fillStyle='white';ctx.fillRect(0,0,640,480);ctx.drawImage(image,170,90,300,300);}draw();window.fakeInterval=setInterval(draw,100);window.fakeStream=canvas.captureStream(10);Object.defineProperty(navigator.mediaDevices,'getUserMedia',{configurable:true,value:async()=>window.fakeStream});});
await page.click('#scan-card');await page.waitForFunction(()=>document.querySelector('#card-dialog').open);assert.equal(await page.inputValue('#card-number'),'00123456789');assert.equal(await page.inputValue('#card-format'),'QR_CODE');assert.equal(await page.evaluate(()=>window.fakeStream.getTracks()[0].readyState),'ended');await page.evaluate(()=>clearInterval(window.fakeInterval));await page.click('#cancel');console.log('PASS actual camera-frame decode, exact payload and track cleanup');
await page.evaluate(()=>localStorage.setItem('onecard-cards-v1',JSON.stringify([{id:'old',store:'Old card',number:'000123',color:'#276749'}])));await page.reload();await page.locator('.loyalty-card').click();assert.equal(await page.locator('#barcode-format').innerText(),'Code 128');await page.click('#close-barcode');console.log('PASS legacy cards');
await page.evaluate(()=>localStorage.setItem('onecard-cards-v1','broken'));await page.reload();assert.match(await page.locator('#app-status').innerText(),/nietknięte/);assert.equal(await page.evaluate(()=>localStorage.getItem('onecard-cards-v1')),'broken');console.log('PASS corrupted storage retained');
assert.deepEqual(errors,[]);await browser.close();console.log('ALL TESTS PASSED');
})().catch(e=>{console.error(e);process.exit(1)});







