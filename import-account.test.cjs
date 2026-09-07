const {chromium}=require('playwright');
const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({headless:true,channel:process.env.BROWSER_CHANNEL||undefined});
 const context=await browser.newContext({viewport:{width:390,height:844}}), page=await context.newPage();
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:4173');await page.evaluate(()=>navigator.serviceWorker.ready);await page.reload();
 await page.click('#account-button');assert.equal(await page.locator('#account-login').isVisible(),true);assert.equal(await page.locator('#login-method option[value=sms]').evaluate(el=>el.disabled),true);await page.click('#close-account');console.log('PASS email login enabled, unconfigured SMS disabled');
 const files=await page.evaluate(async()=>{
  const out={};
  for(const [name,format,number,rotated] of [['qr','QR_CODE','00123456789',false],['barcode','EAN_13','5901234123457',true]]){
   const source=barcodeSVG(number,format),dims=source.match(/viewBox="0 0 (\d+) (\d+)"/);
   const img=new Image();img.src='data:image/svg+xml;base64,'+btoa(source.replace('<svg ','<svg width="'+dims[1]+'" height="'+dims[2]+'" '));await img.decode();
   const canvas=document.createElement('canvas');canvas.width=900;canvas.height=1600;const c=canvas.getContext('2d');c.fillStyle='white';c.fillRect(0,0,900,1600);c.fillStyle='#276749';c.fillRect(0,0,900,200);c.fillStyle='white';c.font='48px sans-serif';c.fillText('MOJA KARTA',60,120);
   if(rotated){c.translate(600,550);c.rotate(Math.PI/2);}else c.translate(220,900);
   c.drawImage(img,0,0,450,450*Number(dims[2])/Number(dims[1]));out[name]=canvas.toDataURL('image/png').split(',')[1];
  }
  const blank=document.createElement('canvas');blank.width=100;blank.height=100;out.blank=blank.toDataURL().split(',')[1];return out;
 });
 for(const [file,format,number] of [['qr','QR_CODE','00123456789'],['barcode','EAN_13','5901234123457']]){
  await page.locator('#card-photo').setInputFiles({name:file+'.png',mimeType:'image/png',buffer:Buffer.from(files[file],'base64')});
  await page.waitForFunction(()=>document.querySelector('#card-dialog').open);assert.equal(await page.inputValue('#card-number'),number);assert.equal(await page.inputValue('#card-format'),format);await page.fill('#store-name','Import '+file);await page.click('#card-form .primary-button');console.log('PASS photo import '+file);
 }
 await context.setOffline(true);await page.reload();await page.locator('#card-photo').setInputFiles({name:'offline.png',mimeType:'image/png',buffer:Buffer.from(files.qr,'base64')});await page.waitForFunction(()=>document.querySelector('#card-dialog').open);await page.click('#cancel');console.log('PASS photo import offline');await context.setOffline(false);
 await page.locator('#card-photo').setInputFiles({name:'blank.png',mimeType:'image/png',buffer:Buffer.from(files.blank,'base64')});await page.waitForFunction(()=>document.querySelector('#import-status').textContent.includes('Nie znaleziono'));assert.equal(await page.locator('.loyalty-card').count(),2);
 await page.locator('#card-photo').setInputFiles({name:'broken.jpg',mimeType:'image/jpeg',buffer:Buffer.from('not an image')});await page.waitForFunction(()=>document.querySelector('#import-status').textContent.includes('Nie można otworzyć'));console.log('PASS blank/corrupt image feedback');
 assert.deepEqual(errors,[]);await context.close();
 // Real Supabase SDK against isolated HTTP fixtures. No emails/SMS are sent.
 const authContext=await browser.newContext({serviceWorkers:'block'});const auth=await authContext.newPage();
 let currentUser={id:'11111111-1111-4111-8111-111111111111',email:'test@example.invalid',phone:'',aud:'authenticated',role:'authenticated'}, otpRequests=[],verifyRequests=[],rows=[],failWrites=false;
 const token=()=>{const b=o=>Buffer.from(JSON.stringify(o)).toString('base64url');return b({alg:'HS256',typ:'JWT'})+'.'+b({sub:currentUser.id,role:'authenticated',aud:'authenticated',exp:Math.floor(Date.now()/1000)+3600})+'.test';};
 const session=()=>({access_token:token(),refresh_token:'test-refresh',expires_in:3600,token_type:'bearer',user:currentUser});
 await authContext.route('**/config.js',r=>r.fulfill({contentType:'application/javascript',body:"window.ONECARD_CONFIG={supabaseUrl:'https://onecard-test.supabase.co',supabasePublishableKey:'sb_publishable_test'}"}));
 await authContext.route('https://onecard-test.supabase.co/**',async route=>{
  const req=route.request(),url=new URL(req.url()),body=req.postDataJSON();let data={};
  if(url.pathname.endsWith('/signup')){otpRequests.push(body);data={user:currentUser};}
  else if(url.pathname.endsWith('/otp')){otpRequests.push(body);}
  else if(url.pathname.endsWith('/verify')){verifyRequests.push(body);if(body.token!=='123456'){await route.fulfill({status:400,json:{msg:'Invalid token'}});return;}if(body.type==='phone_change')currentUser={...currentUser,phone:body.phone.replace('+','')};data=session();}
  else if(url.pathname.endsWith('/user')){data=currentUser;}
  else if(url.pathname.endsWith('/token')){data=session();}
  else if(url.pathname.endsWith('/cards')){
   if(req.method()==='POST'){
    if(failWrites){await route.fulfill({status:503,json:{message:'offline test'}});return;}
    for(const row of body){const i=rows.findIndex(r=>r.user_id===row.user_id&&r.id===row.id);if(i<0)rows.push(row);else rows[i]=row;}data=[];
   }else data=rows.filter(r=>r.user_id===url.searchParams.get('user_id')?.replace('eq.',''));
  }
  await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data)});
 });
 await auth.goto('http://127.0.0.1:4173');await auth.click('#add-card');await auth.fill('#store-name','Guest');await auth.fill('#card-number','000123');await auth.click('#card-form .primary-button');
 await auth.click('#account-button');await auth.fill('#login-contact','test@example.invalid');await auth.selectOption('#auth-action','signup');await auth.fill('#login-password','TestPassword123!');await auth.click('#send-login-code');await auth.waitForFunction(()=>!document.querySelector('#account-code-form').hidden);assert.equal(otpRequests[0].email,'test@example.invalid');await auth.fill('#login-code','000000');await auth.click('#verify-login-code');await auth.waitForFunction(()=>document.querySelector('#account-status').textContent.includes('nieprawidłowy'));await auth.fill('#login-code','123456');await auth.click('#verify-login-code');await auth.waitForFunction(()=>!document.querySelector('#account-signed-in').hidden);assert.equal(await auth.locator('.loyalty-card').count(),0);assert.equal(rows.length,0);console.log('PASS password signup, confirmation code, wrong code and guest isolation');
 await auth.click('#import-local-cards');await auth.waitForFunction(()=>document.querySelector('#account-status').textContent.includes('zsynchronizowane'));assert.equal(rows.length,1);assert.equal(rows[0].number,'000123');assert.equal(await auth.evaluate(()=>JSON.parse(localStorage.getItem('onecard-cards-v1')).length),1);console.log('PASS explicit copy to account retains guest copy');
 // Reopening resets only the UI resend cooldown; no timer manipulation of production code.
 await auth.reload();await auth.click('#account-button');await auth.click('#link-identity');await auth.fill('#login-contact','+48 123 456 789');await auth.click('#send-login-code');await auth.fill('#login-code','123456');await auth.click('#verify-login-code');await auth.waitForFunction(()=>document.querySelector('#account-identity').textContent.includes('48123456789'));assert.equal(verifyRequests.at(-1).type,'phone_change');console.log('PASS link phone to same email account');
 await auth.click('#close-account');failWrites=true;await auth.click('#add-card');await auth.fill('#store-name','Pending');await auth.fill('#card-number','000999');await auth.click('#card-form .primary-button');await auth.waitForFunction(()=>document.querySelector('#account-status').textContent.includes('Nie udało się zsynchronizować'));await auth.reload();assert.equal(await auth.locator('.loyalty-card').count(),2);assert.equal(await auth.evaluate(()=>Object.keys(JSON.parse(localStorage.getItem('onecard-account-11111111-1111-4111-8111-111111111111')).pending).length),1);failWrites=false;await auth.click('#account-button');await auth.click('#sync-cards');await auth.waitForFunction(()=>document.querySelector('#account-status').textContent.includes('zsynchronizowane'));assert.equal(rows.length,2);console.log('PASS failed upload persists and retries');
 await auth.click('#close-account');await auth.locator('.loyalty-card').filter({hasText:'Pending'}).click();auth.once('dialog',d=>d.accept());await auth.click('#delete-card');await auth.waitForFunction(()=>document.querySelector('#account-status').textContent.includes('zsynchronizowane'));assert.equal(rows.find(r=>r.store==='Pending').deleted,true);console.log('PASS synced tombstone');
 await auth.click('#account-button');await auth.click('#sign-out');await auth.waitForFunction(()=>document.querySelector('#account-signed-in').hidden);assert.equal(await auth.locator('.loyalty-card').count(),0);
 await auth.click('#close-account');assert.equal(await auth.locator('#local-wallet').isVisible(),true);assert.equal(await auth.locator('#add-card').isDisabled(),true);
 await auth.reload();assert.equal(await auth.locator('.loyalty-card').count(),0);assert.equal(await auth.locator('#local-wallet').isVisible(),true);
 assert.equal(await auth.evaluate(()=>JSON.parse(localStorage.getItem('onecard-cards-v1')).length),1);
 await auth.click('#local-wallet');assert.equal(await auth.locator('.loyalty-card').count(),1);assert.match(await auth.locator('.loyalty-card').innerText(),/Guest/);console.log('PASS logout and reload hide cards; explicit local wallet restores without data loss');
 currentUser={id:'22222222-2222-4222-8222-222222222222',email:'',phone:'48987654321',aud:'authenticated',role:'authenticated'};
 await auth.reload();await auth.click('#account-button');await auth.selectOption('#login-method','sms');await auth.fill('#login-contact','+48 987 654 321');await auth.selectOption('#auth-action','signup');await auth.fill('#login-password','TestPassword123!');await auth.click('#send-login-code');await auth.fill('#login-code','123456');await auth.click('#verify-login-code');await auth.waitForFunction(()=>!document.querySelector('#account-signed-in').hidden);assert.equal(otpRequests.at(-1).phone,'+48987654321');assert.equal(verifyRequests.at(-1).type,'sms');assert.equal(await auth.locator('.loyalty-card').count(),0);console.log('PASS phone/password signup confirmation and separate-account isolation');
 await auth.click('#sign-out');await auth.selectOption('#auth-action','login');
 await auth.fill('#login-contact','+48 987 654 321');await auth.fill('#login-password','TestPassword123!');
 const before=otpRequests.length;await auth.click('#send-login-code');await auth.waitForFunction(()=>!document.querySelector('#account-signed-in').hidden);
 assert.equal(otpRequests.length,before);console.log('PASS password login does not send OTP');
 await auth.click('#sign-out');await auth.reload();await auth.click('#account-button');await auth.selectOption('#auth-action','recover');await auth.fill('#login-contact','test@example.invalid');await auth.click('#send-login-code');await auth.waitForFunction(()=>!document.querySelector('#account-code-form').hidden);
 assert.equal(otpRequests.at(-1).create_user,false);await auth.fill('#login-code','123456');await auth.click('#verify-login-code');await auth.waitForFunction(()=>!document.querySelector('#password-form').hidden);
 await auth.fill('#new-password','NewPassword123!');await auth.fill('#repeat-password','DifferentPassword');await auth.click('#save-password');await auth.waitForFunction(()=>document.querySelector('#account-status').textContent.includes('identyczne'));
 await auth.fill('#repeat-password','NewPassword123!');await auth.click('#save-password');await auth.waitForFunction(()=>document.querySelector('#account-status').textContent.includes('Hasło zapisane'));
 assert.equal(await auth.inputValue('#new-password'),'');console.log('PASS existing-account recovery, matching passwords, sensitive field cleared');
 await authContext.close();await browser.close();console.log('IMPORT AND ACCOUNT TESTS PASSED (provider HTTP mocked; live delivery/RLS require configured project)');
})().catch(e=>{console.error(e);process.exit(1)});


