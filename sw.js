/* Cache offline do Xadrez Custom Full 1.6.1 — MCE1809 */
const CACHE='xadrez-mce1809-full-v161';
const FILES=['./','./index.html','./engine.js','./game.js','./peer.js','./style.css','./manifest.webmanifest','./icon-192.png','./icon-512.png'];
self.addEventListener('install',e=>e.waitUntil((async()=>{const c=await caches.open(CACHE);await c.addAll(FILES);await self.skipWaiting();})()));
self.addEventListener('activate',e=>e.waitUntil((async()=>{const keys=await caches.keys();await Promise.all(keys.filter(k=>k.startsWith('xadrez-mce1809-')&&k!==CACHE).map(k=>caches.delete(k)));await self.clients.claim();})()));
self.addEventListener('fetch',e=>{
 if(e.request.method!=='GET')return;
 const url=new URL(e.request.url);if(url.origin!==self.location.origin)return;
 const local=url.pathname.startsWith(new URL(self.registration.scope).pathname);
 if(!local)return;
 e.respondWith((async()=>{
   const c=await caches.open(CACHE);
   // Pacote do jogo sempre do cache, sem depender da internet.
   // Ao publicar nova versão, o novo SW popula um cache de versão nova.
   const cached=await c.match(e.request,{ignoreSearch:true});
   if(cached)return cached;
   try{const response=await fetch(e.request);if(response.ok)await c.put(e.request,response.clone());return response;}
   catch(err){if(e.request.mode==='navigate')return (await c.match('./index.html'))||Response.error();throw err;}
 })());
});
