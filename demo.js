'use strict';
(() => {
 const cards = {
  market:{store:'Market Demo',value:'ONECARD-DEMO-001',format:'code128'},
  dom:{store:'Dom Demo',value:'ONECARD-DEMO-002',format:'qrcode'},
  drogeria:{store:'Drogeria Demo',value:'ONECARD-DEMO-003',format:'code128'}
 };
 function show(key) {
  const card = cards[key]; if (!card) return;
  document.querySelector('#demo-store').textContent = card.store;
  document.querySelector('#demo-number').textContent = card.value;
  document.querySelectorAll('[data-demo]').forEach(button => button.setAttribute('aria-pressed',String(button.dataset.demo === key)));
  try {
   document.querySelector('#demo-barcode').innerHTML = bwipjs.toSVG({bcid:card.format,text:card.value,scale:3,padding:12,backgroundcolor:'FFFFFF',barcolor:'000000',...(card.format==='qrcode'?{}:{height:20})});
   document.querySelector('#demo-status').textContent = `Wybrano ${card.store}. Każda karta ma własny kod.`;
  } catch (_) { document.querySelector('#demo-status').textContent = 'Nie udało się wyświetlić demonstracji. Odśwież stronę.'; }
 }
 document.querySelectorAll('[data-demo]').forEach(button => button.addEventListener('click',()=>show(button.dataset.demo)));
 show('market');
})();
