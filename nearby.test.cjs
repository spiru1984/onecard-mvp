const {chromium}=require('playwright');
const assert=require('node:assert/strict');
(async()=>{
 const b=await chromium.launch({channel:'msedge',headless:true});
 async function scenario(mode){
  const c=await b.newContext({serviceWorkers:'block'}),p=await c.newPage();let calls=0,body='';
  await p.addInitScript(mode=>{
   localStorage.setItem('onecard-cards-v1',JSON.stringify([{id:'lidl-test',store:'Lidl Plus',number:'0012345',format:'CODE_128',color:'#276749'},{id:'other',store:'Carrefour',number:'99999',format:'CODE_128'}]));
   Object.defineProperty(navigator,'geolocation',{value:{getCurrentPosition:(ok,fail)=>{
    if(mode==='denied')return fail({code:1});
    const send=()=>ok({coords:{latitude:52.2297123,longitude:21.0122345,accuracy:mode==='inaccurate'?900:20}});
    if(mode==='cancel')setTimeout(send,300);else send();
   }}});
  },mode);
  await p.route('https://overpass-api.de/**',async r=>{calls++;body=r.request().postData();if(mode==='failure')return r.fulfill({status:503,body:'busy'});if(mode==='logout')await new Promise(r=>setTimeout(r,300));await r.fulfill({json:{elements:mode==='empty'?[]:[{lat:52.2298,lon:21.0123,tags:{name:'Lidl'}},{center:{lat:52.2299,lon:21.0124},tags:{name:'Lidl'}},{lat:52.2300,lon:21.0125,tags:{name:'Carrefour'}},{lat:53,lon:21,tags:{name:'Lidl'}}]}})});
  await p.goto('http://127.0.0.1:4176');assert.equal(calls,0);await p.click('#find-nearby');
  if(mode==='cancel'){await p.click('#cancel-nearby');await p.waitForTimeout(500);assert.equal(calls,0);}
  else if(mode==='logout'){await p.evaluate(()=>switchCardProfile(null));await p.waitForTimeout(500);assert.equal(await p.locator('.nearby-card').count(),0);}
  else if(mode==='success'){
   await p.waitForSelector('.nearby-card');assert.equal(await p.locator('.nearby-card').count(),2);assert(!body.includes('0012345'));assert(!body.includes('52.2297123'));assert(body.includes('52.23'));
   await p.locator('.nearby-card').first().click();assert.equal(await p.locator('#barcode-number').innerText(),'0012345');await p.click('#close-barcode');await p.evaluate(()=>switchCardProfile(null));assert.equal(await p.locator('.nearby-card').count(),0);
  }else{
   const words={denied:'Brak zgody',inaccurate:'niedokładna',failure:'zajęta',empty:'Nie znaleziono'};await p.waitForFunction(t=>document.querySelector('#nearby-status').textContent.includes(t),words[mode]);
   if(mode==='denied'||mode==='inaccurate')assert.equal(calls,0);
  }
  console.log('PASS',mode);await c.close();
 }
 for(const mode of ['success','denied','inaccurate','cancel','logout','failure','empty'])await scenario(mode);
 await b.close();
})().catch(e=>{console.error(e);process.exit(1)});

