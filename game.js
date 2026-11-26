/* Interface e persistência offline do Xadrez Custom Full — MCE1809 1.5 */
(()=>{
'use strict';
const E=window.XadrezEngine;
const $=id=>document.getElementById(id);
const ICON={
  classic:{w:{rei:'♔',dama:'♕',torre:'♖',bispo:'♗',cavalo:'♘',peao:'♙'},b:{rei:'♚',dama:'♛',torre:'♜',bispo:'♝',cavalo:'♞',peao:'♟'}},
  cyber:{w:{rei:'👑',dama:'💎',torre:'🚀',bispo:'⚡',cavalo:'🦄',peao:'🛡️'},b:{rei:'💀',dama:'🔮',torre:'🛸',bispo:'🔥',cavalo:'🐉',peao:'⚔️'}}
};
const STORAGE='mce1809-xadrez-full-v14'; // mantido para preservar partidas da 1.4
const LEGACY_STORAGE='mce1809-xadrez-full-v11';
const THEME_STORE='mce1809-xadrez-custom-themes-v14';
const SOUND_STORE='mce1809-xadrez-sound-v12';
const RATING_STORE='mce1809-xadrez-rating-v14';
/* Full 1.5.1: armazenamento local por categorias, sem limite artificial de temas.
   Cada categoria é uma object store do IndexedDB. */
const DB_NAME='Xadrez_MCE1809', DB_VERSION=1;
const DB_STORES=['partidas','temas','imagens','tempo','progresso','configuracoes'];
let dbPromise=null;
function openGameDB(){
 if(!('indexedDB' in window))return Promise.reject(Error('IndexedDB indisponível neste navegador.'));
 if(dbPromise)return dbPromise;
 dbPromise=new Promise((resolve,reject)=>{
  const r=indexedDB.open(DB_NAME,DB_VERSION);
  r.onupgradeneeded=()=>{for(const name of DB_STORES)if(!r.result.objectStoreNames.contains(name))r.result.createObjectStore(name);};
  r.onsuccess=()=>resolve(r.result);
  r.onerror=()=>reject(r.error||Error('Falha ao abrir IndexedDB'));
  r.onblocked=()=>reject(Error('Feche outras abas do jogo e tente novamente.'));
 }).catch(e=>{dbPromise=null;throw e;});
 return dbPromise;
}
async function dbOperation(store,operation,key,value){
 const db=await openGameDB();
 return new Promise((resolve,reject)=>{
  let result;const tx=db.transaction(store,operation==='get'?'readonly':'readwrite');
  const os=tx.objectStore(store),request=operation==='get'?os.get(key):operation==='delete'?os.delete(key):os.put(value,key);
  request.onsuccess=()=>{result=request.result;};
  tx.oncomplete=()=>resolve(result);tx.onerror=()=>reject(tx.error||request.error||Error('Erro ao salvar dados'));
  tx.onabort=()=>reject(tx.error||Error('Operação cancelada'));
 });
}
const dbGet=(store,key)=>dbOperation(store,'get',key);
const dbPut=(store,key,value)=>dbOperation(store,'put',key,value);
const dbDelete=(store,key)=>dbOperation(store,'delete',key);
let saveGameRevision=0;
async function dbSaveCurrentGame(data){
 const revision=++saveGameRevision;
 try{await dbPut('partidas','atual',data);if(revision===saveGameRevision){/* atualizado */}}
 catch(err){$('appearanceSaveStatus').textContent='Não foi possível salvar no banco local: '+err.message;console.error(err);}
}

let rating={elo:600,xp:0,w:0,d:0,l:0};let ratedOnce=false;
let playerChoice='w',humanColor='w',trainingHint=null,skinSide='w';
let savedThemes=[];
let peer=null,peerRole=null,peerReady=false;
let audioCtx=null;
let soundConfig={enabled:true,volume:0.35};
const APPEARANCE_DEFAULT={theme:'madeira',pieces:'classic',quickPack:'classic',boardImages:{light:'',dark:''},boardColors:{light:'#ebd7b2',dark:'#7f9785'},pieceImages:{}};
let appearance=cloneSimple(APPEARANCE_DEFAULT);
let mode='balanced',rules=E.preset(mode),draft=E.clone(rules),selectedPiece='torre';
let pos=E.newPosition(),selections=[],selected=null,undoStack=[],timer=null,flipped=false,promotionPending=null,finalStatus=null;

function cloneSimple(v){return JSON.parse(JSON.stringify(v));}
// O áudio do Android precisa ser desbloqueado por um gesto do jogador.
// Sons de movimento são disparados somente na conclusão da animação.
let audioReady=false,moveSoundSequence=0;
function unlockAudio(){
  if(!soundConfig.enabled)return;
  try{
    const Ctx=window.AudioContext||window.webkitAudioContext;
    if(!Ctx)return;
    if(!audioCtx) audioCtx=new Ctx();
    if(audioCtx.state==='running'){audioReady=true;return;}
    audioCtx.resume().then(()=>{audioReady=audioCtx.state==='running';}).catch(()=>{});
  }catch(_){}
}
function playSound(kind){
  if(!soundConfig.enabled||soundConfig.volume<=0)return;
  try{
    unlockAudio();
    if(!audioCtx||audioCtx.state!=='running')return;
    // Percussão curta: dois contatos secos de madeira separados por 54ms.
    const clicks={move:[0,.054],capture:[0,.052,.12],check:[0,.054,.18],end:[0,.075,.17],undo:[0,.065]};
    const now=audioCtx.currentTime+.006;
    for(const [i,delay] of (clicks[kind]||clicks.move).entries()){
      const t=now+delay,dur=kind==='end'?.045:.022;
      const osc=audioCtx.createOscillator(),gain=audioCtx.createGain(),filter=audioCtx.createBiquadFilter();
      osc.type='triangle';
      osc.frequency.setValueAtTime((kind==='capture'?820:960)*(i?0.84:1),t);
      osc.frequency.exponentialRampToValueAtTime(300,t+dur);
      filter.type='lowpass';filter.frequency.value=2500;
      gain.gain.setValueAtTime(Math.max(.0001,soundConfig.volume*.34),t);
      gain.gain.exponentialRampToValueAtTime(.0001,t+dur);
      osc.connect(filter);filter.connect(gain);gain.connect(audioCtx.destination);
      osc.start(t);osc.stop(t+dur+.005);
      osc.onended=()=>{try{osc.disconnect();gain.disconnect();filter.disconnect();}catch(_){}};
    }
  }catch(_){} // O áudio nunca pode interromper uma partida.
}
function saveSound(){try{localStorage.setItem(SOUND_STORE,JSON.stringify(soundConfig)); dbPut('configuracoes','som',cloneSimple(soundConfig)).catch(()=>{});}catch(_){}}
function setupSound(){
  try{const prev=JSON.parse(localStorage.getItem(SOUND_STORE)||'null');if(prev&&typeof prev==='object'){soundConfig.enabled=prev.enabled!==false; soundConfig.volume=Math.max(0,Math.min(1,Number(prev.volume)||0));}}catch(_){}
  $('soundEnabled').checked=soundConfig.enabled;
  $('soundVolume').value=String(Math.round(soundConfig.volume*100));
  $('soundEnabled').addEventListener('change',()=>{soundConfig.enabled=$('soundEnabled').checked;saveSound();if(soundConfig.enabled)playSound('move');});
  $('soundVolume').addEventListener('input',()=>{soundConfig.volume=Number($('soundVolume').value)/100;saveSound();});
  $('testSound').addEventListener('click',()=>{unlockAudio();playSound('capture');});
  document.addEventListener('pointerdown',unlockAudio,{capture:true,passive:true});
  document.addEventListener('touchstart',unlockAudio,{capture:true,passive:true});
  document.addEventListener('keydown',unlockAudio,{capture:true});
}
function say(t){$('status').textContent=t;}
function notify(t){$('feedback').textContent=t;}
function pieceKey(color,type){return color+'_'+type;}
function normalizeAppearance(a){
 const base=cloneSimple(APPEARANCE_DEFAULT);if(!a||typeof a!=='object')return base;
 base.theme=['madeira','neon','gelo','custom'].includes(a.theme)?a.theme:'madeira';
 base.pieces=['classic','cyber','custom'].includes(a.pieces)?a.pieces:'classic';
 base.quickPack=['classic','cyber'].includes(a.quickPack)?a.quickPack:'classic';
 if(a.boardImages&&typeof a.boardImages==='object')for(const key of ['light','dark']){
   if(typeof a.boardImages[key]==='string'&&/^data:image\/(?:png|webp|jpeg);base64,/i.test(a.boardImages[key]))base.boardImages[key]=a.boardImages[key];
 }
 if(a.boardColors&&typeof a.boardColors==='object')for(const key of ['light','dark']){
   if(typeof a.boardColors[key]==='string'&&/^#[0-9a-f]{6}$/i.test(a.boardColors[key]))base.boardColors[key]=a.boardColors[key].toLowerCase();
 }
 if(a.pieceImages&&typeof a.pieceImages==='object')for(const color of ['w','b'])for(const type of E.TYPES){
   const k=color+'_'+type;const value=a.pieceImages[k];
   if(typeof value==='string'&&/^data:image\/(?:png|webp|jpeg);base64,/i.test(value))base.pieceImages[k]=value;
 }
 return base;
}
function safeSave(){
 try{
  const data={version:3,mode,rules,position:pos,undo:undoStack.slice(-30),opponent:$('opponent').value,difficulty:$('difficulty').value,flipped,appearance:cloneSimple(appearance),playerChoice,humanColor};
  dbSaveCurrentGame(data);return true;
 }catch(err){$('appearanceSaveStatus').textContent='Falha ao preparar salvamento: '+err.message;return false;}
}
function isValidRestore(d){
 const okVersion=d&&[1,2,3].includes(d.version);
 return okVersion&&['balanced','classic','chaos'].includes(d.mode)&&!E.validate(d.rules,d.mode)&&d.position&&Array.isArray(d.position.board)&&d.position.board.length===8&&d.position.board.every(row=>Array.isArray(row)&&row.length===8&&row.every(p=>!p||E.TYPES.includes(p.type)&&['w','b'].includes(p.color)))&&['w','b'].includes(d.position.turn)&&d.position.rights&&typeof d.position.rights==='object'&&d.position.repetitions&&typeof d.position.repetitions==='object'&&Array.isArray(d.position.history)&&d.position.history.length<2000;
}
function stopTimer(){if(timer!==null){clearTimeout(timer);timer=null;}}
function isBotMode(){return $('opponent').value==='bot'||$('opponent').value==='training';}
function isTraining(){return $('opponent').value==='training';}
function updateColorUI(){
 $('colorResolved').textContent=$('opponent').value==='remote'?'Conexão remota: anfitrião joga de brancas e convidado de pretas.':('Você joga com as '+(humanColor==='w'?'brancas':'pretas')+'. As brancas sempre começam'+(humanColor==='b'?' (o bot joga primeiro).':'.'));
 $('playerColorWrap').style.display=$('opponent').value==='remote'?'none':'';
 $('trainingPanel').hidden=!isTraining();
}
function toggleBotControl(){
 $('difficultyWrap').style.display=isBotMode()?'':'none';
 $('trainingPanel').hidden=!isTraining();updateColorUI();
}
function applyAppearanceToUI(){
 document.body.dataset.theme=appearance.theme==='custom'?'madeira':appearance.theme;
 $('theme').value=appearance.theme;$('pieces').value=appearance.pieces;$('quickPack').value=appearance.quickPack;
 $('boardLightColor').value=appearance.boardColors.light;$('boardDarkColor').value=appearance.boardColors.dark;
 const board=$('board');
 const custom=appearance.theme==='custom';
 board.classList.toggle('custom-skin',custom&&!!(appearance.boardImages.light||appearance.boardImages.dark));
 for(const k of ['light','dark']){
  board.style.setProperty('--'+k,custom?appearance.boardColors[k]:'');
  board.style.setProperty('--board-'+k+'-image',custom&&appearance.boardImages[k]?`url(${appearance.boardImages[k]})`:'none');
 }
 updateAppearancePreviews();
}
function updatePreview(id,src,text){
  const holder=$(id); if(!holder) return;
  holder.innerHTML='';
  if(src){const img=document.createElement('img'); img.src=src; img.alt=text; holder.appendChild(img);}
  const span=document.createElement('span'); span.textContent=text; holder.appendChild(span);
}
function updateAppearancePreviews(){
  updatePreview('preview_board_light',appearance.boardImages.light,appearance.boardImages.light?'Casa clara pronta':'Nenhum PNG');
  updatePreview('preview_board_dark',appearance.boardImages.dark,appearance.boardImages.dark?'Casa escura pronta':'Nenhum PNG');
  for(const color of ['w','b']) for(const type of E.TYPES){
    const key=pieceKey(color,type);
    updatePreview('preview_'+key,appearance.pieceImages[key],appearance.pieceImages[key]?'PNG pronto':'Padrão do pack');
  }
}
function rebuildAppearanceInputs(){
 const root=$('piecePackInputs');root.textContent='';
 for(const type of E.TYPES){
   const key=pieceKey(skinSide,type);
   const label=document.createElement('label');label.textContent=E.LABELS[type]+' '+(skinSide==='w'?'branca':'preta');
   const input=document.createElement('input');input.type='file';input.accept='image/png,image/webp,image/jpeg';input.dataset.key=key;
   input.addEventListener('change',onPieceFile);
   const preview=document.createElement('div');preview.className='preview-chip';preview.id='preview_'+key;
   label.appendChild(input);label.appendChild(preview);root.appendChild(label);
 }
 $('whiteSkinTab').classList.toggle('primary',skinSide==='w');$('blackSkinTab').classList.toggle('primary',skinSide==='b');
 updateAppearancePreviews();
}
function fileToDataUrl(file){
 if(!file||!['image/png','image/webp','image/jpeg'].includes(file.type))return Promise.reject(Error('Escolha um PNG, WEBP ou JPG válido.'));
 if(file.size>5_000_000)return Promise.reject(Error('Imagem muito grande: o máximo é 5 MB.'));
 return new Promise((resolve,reject)=>{
  const rd=new FileReader();rd.onerror=()=>reject(Error('Falha ao ler imagem.'));
  rd.onload=()=>{const img=new Image();img.onerror=()=>reject(Error('Arquivo não é uma imagem válida.'));
   img.onload=()=>{
    const side=256,cv=document.createElement('canvas');cv.width=side;cv.height=side;
    const ctx=cv.getContext('2d');if(!ctx)return reject(Error('Canvas indisponível.'));
    const ratio=Math.min((side-12)/img.naturalWidth,(side-12)/img.naturalHeight);
    ctx.clearRect(0,0,side,side);ctx.drawImage(img,(side-img.naturalWidth*ratio)/2,(side-img.naturalHeight*ratio)/2,img.naturalWidth*ratio,img.naturalHeight*ratio);
    const out=cv.toDataURL('image/webp',0.84);
    resolve(out.startsWith('data:image/webp')?out:cv.toDataURL('image/png'));
   };img.src=String(rd.result);
  };rd.readAsDataURL(file);
 });
}
async function onBoardFile(ev){
 const file=ev.target.files&&ev.target.files[0];if(!file)return;
 try{appearance.boardImages[ev.target.dataset.kind]=await fileToDataUrl(file);appearance.theme='custom';applyAppearanceToUI();render();safeSave();notify('Imagem da casa carregada. Salve em Meus temas para criar um visual próprio.');}
 catch(e){alert(e.message);}ev.target.value='';
}
async function onPieceFile(ev){
 const file=ev.target.files&&ev.target.files[0];if(!file)return;
 try{appearance.pieceImages[ev.target.dataset.key]=await fileToDataUrl(file);appearance.pieces='custom';render();safeSave();notify('Peça carregada. Salve em Meus temas para guardar esta combinação.');}
 catch(e){alert(e.message);}ev.target.value='';
}
function saveAppearance(){
 appearance.theme=$('theme').value;appearance.pieces=$('pieces').value;appearance.quickPack=$('quickPack').value;
 if(safeSave()){$('appearanceSaveStatus').textContent='Visual atual guardado neste navegador. Para registrar como Tema Custom #1, use Salvar tema novo.';notify('Visual atualizado com sucesso.');}
 render();
}
function resetAppearance(){appearance=cloneSimple(APPEARANCE_DEFAULT);applyAppearanceToUI();safeSave();render();notify('Aparência restaurada. Seus temas salvos continuam na biblioteca.');}
function applyQuickPack(){appearance.quickPack=$('quickPack').value;appearance.pieces=appearance.quickPack;render();safeSave();notify('Pack da biblioteca aplicado.');}
function themeSnapshot(){
 const a=normalizeAppearance(appearance);
 // Guardar somente valores normalizados, evitando diferenças por campos não usados.
 return a;
}
function effectiveAppearanceKey(a){
 const x=normalizeAppearance(a);
 const boardColors=x.theme==='custom'?x.boardColors:{light:'',dark:''};
 const boardImages=x.theme==='custom'?x.boardImages:{light:'',dark:''};
 const pieces=x.pieces==='custom'?x.pieceImages:{};
 return JSON.stringify({theme:x.theme,boardColors,boardImages,pieces:x.pieces,quickPack:x.pieces==='custom'?x.quickPack:'',pieceImages:pieces});
}
async function saveThemeLibrary(){
 try{
  await dbPut('temas','biblioteca',cloneSimple(savedThemes));
  return true;
 }catch(err){$('themeLibraryStatus').textContent='Não foi possível salvar a biblioteca local: '+err.message;return false;}
}
async function loadThemeLibrary(){
 try{
  const stored=await dbGet('temas','biblioteca');
  if(Array.isArray(stored))savedThemes=stored.filter(t=>t&&typeof t.id==='string'&&typeof t.name==='string'&&t.appearance);
  else{
    // Migração sem apagar nada antigo: cópia para o novo banco, se existir.
    const previous=JSON.parse(localStorage.getItem(THEME_STORE)||'[]');
    savedThemes=Array.isArray(previous)?previous.filter(t=>t&&typeof t.id==='string'&&typeof t.name==='string'&&t.appearance):[];
    if(savedThemes.length)await saveThemeLibrary();
  }
 }catch(err){console.warn('Biblioteca de temas:',err);savedThemes=[];}
 refreshThemeList();
}
function refreshThemeList(selectedId=''){
 const sel=$('savedThemeSelect');sel.textContent='';
 const empty=document.createElement('option');empty.value='';empty.textContent=savedThemes.length?'Selecione um tema salvo':'Nenhum tema salvo';sel.appendChild(empty);
 for(const item of savedThemes){const opt=document.createElement('option');opt.value=item.id;opt.textContent=item.name;sel.appendChild(opt);}
 sel.value=selectedId&&savedThemes.some(x=>x.id===selectedId)?selectedId:'';
 if(sel.value){$('customThemeName').value=savedThemes.find(x=>x.id===sel.value).name;}
 $('themeLibraryStatus').textContent=savedThemes.length?`${savedThemes.length} tema(s) salvo(s) neste navegador.`:'Nenhum tema salvo ainda.';
}
function nextThemeName(){let n=1;while(savedThemes.some(x=>x.name===`Tema Custom #${n}`))n++;return `Tema Custom #${n}`;}
async function saveNewTheme(){
 const a=themeSnapshot(),k=effectiveAppearanceKey(a);
 if(k===effectiveAppearanceKey(APPEARANCE_DEFAULT)){$('themeLibraryStatus').textContent='Altere ao menos uma peça, cor ou visual do tabuleiro antes de salvar.';return;}
 if(savedThemes.some(item=>effectiveAppearanceKey(item.appearance)===k)){$('themeLibraryStatus').textContent='Esse visual já está salvo. Mude pelo menos uma peça, cor ou outro detalhe.';return;}
 const id='t'+Date.now()+'_'+Math.random().toString(36).slice(2,6);
 const input=$('customThemeName').value.trim().slice(0,50);
 const selected=savedThemes.find(x=>x.id===$('savedThemeSelect').value);
 const name=(!input||input===selected?.name)?nextThemeName():input;
 if(savedThemes.some(item=>item.name.toLowerCase()===name.toLowerCase())){$('themeLibraryStatus').textContent='Já existe um tema com esse nome. Escolha outro.';return;}
 savedThemes.push({id,name,appearance:a});
 if(!await saveThemeLibrary()){savedThemes.pop();return;}
 refreshThemeList(id);$('themeLibraryStatus').textContent=`${name} foi salvo! Você pode trocar de tema a qualquer momento.`;
}
function loadSelectedTheme(){
 const item=savedThemes.find(x=>x.id===$('savedThemeSelect').value);if(!item){$('themeLibraryStatus').textContent='Escolha um tema da lista.';return;}
 appearance=normalizeAppearance(item.appearance);applyAppearanceToUI();render();safeSave();$('themeLibraryStatus').textContent=`Tema “${item.name}” aplicado!`;
}
async function renameSelectedTheme(){
 const item=savedThemes.find(x=>x.id===$('savedThemeSelect').value);if(!item){$('themeLibraryStatus').textContent='Selecione o tema que deseja renomear.';return;}
 const name=$('customThemeName').value.trim().slice(0,50);
 if(!name){$('themeLibraryStatus').textContent='Digite um nome para o tema.';return;}
 if(savedThemes.some(x=>x.id!==item.id&&x.name.toLowerCase()===name.toLowerCase())){$('themeLibraryStatus').textContent='Esse nome já está sendo usado.';return;}
 const prev=item.name;item.name=name;
 if(!await saveThemeLibrary()){item.name=prev;return;}
 refreshThemeList(item.id);$('themeLibraryStatus').textContent=`Tema renomeado para “${name}”.`;
}
async function deleteSelectedTheme(){
 const id=$('savedThemeSelect').value;const item=savedThemes.find(x=>x.id===id);
 if(!item){$('themeLibraryStatus').textContent='Selecione um tema para excluir.';return;}
 if(!window.confirm(`Excluir o tema “${item.name}”?`))return;
 savedThemes=savedThemes.filter(x=>x.id!==id);
 if(!await saveThemeLibrary()){$('themeLibraryStatus').textContent='Não foi possível salvar a exclusão.';return;}
 refreshThemeList();$('customThemeName').value='';$('themeLibraryStatus').textContent='Tema excluído da biblioteca.';
}
function exportAppearance(){
 const data={format:'MCE1809-XADREZ-APPEARANCE',version:1,appearance:themeSnapshot()};
 const blob=new Blob([JSON.stringify(data)],{type:'application/json'});const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='xadrez-mce1809-tema.json';document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1500);
}
async function importAppearanceFile(file){
 if(file.size>6_000_000)throw Error('Arquivo de tema muito grande.');
 const data=JSON.parse(await file.text());if(data.format!=='MCE1809-XADREZ-APPEARANCE'||data.version!==1||!data.appearance)throw Error('Arquivo de tema não reconhecido.');
 appearance=normalizeAppearance(data.appearance);applyAppearanceToUI();render();safeSave();$('appearanceSaveStatus').textContent='Pack importado. Clique em Salvar tema novo se quiser guardar na biblioteca.';
}
function restore(d){
 if(!isValidRestore(d))throw Error('Arquivo de partida não reconhecido.');
 stopTimer();mode=d.mode;rules=E.clone(d.rules);draft=E.clone(rules);pos=d.position;
 undoStack=Array.isArray(d.undo)?d.undo.slice(-30):[];flipped=!!d.flipped;selected=null;selections=[];
 appearance=normalizeAppearance(d.appearance);
 $('mode').value=mode;$('opponent').value=['bot','training','local'].includes(d.opponent)?d.opponent:'bot';
 $('difficulty').value=['1','2','3','4'].includes(String(d.difficulty))?String(d.difficulty):'2';
 playerChoice=['w','b','random'].includes(d.playerChoice)?d.playerChoice:'w';
 humanColor=['w','b'].includes(d.humanColor)?d.humanColor:'w';
 $('playerColor').value=playerChoice;
 applyAppearanceToUI();ratedOnce=E.result(pos,rules).over;redrawEditor();toggleBotControl();setRemoteUI();render();
 if(!E.result(pos,rules).over&&isBotMode()&&pos.turn!==humanColor)scheduleBot();
}
function startGame(){
 for(const ghost of document.querySelectorAll('.moving-piece-ghost'))ghost.remove();
 stopTimer();pos=E.newPosition();undoStack=[];selected=null;selections=[];promotionPending=null;ratedOnce=false;trainingHint=null;closePromotion();
 if($('opponent').value!=='remote'){
  playerChoice=$('playerColor').value;
  humanColor=playerChoice==='random'?(Math.random()<0.5?'w':'b'):playerChoice;
  flipped=humanColor==='b';
 }else flipped=peerRole==='guest';
 updateColorUI();render();safeSave();
 if(isBotMode()&&pos.turn!==humanColor)scheduleBot();
}
function statusText(result){
 if(result.over){if(result.winner)return 'XEQUE-MATE! '+(result.winner==='w'?'Brancas':'Pretas')+' venceram!';return 'EMPATE — '+result.reason+'.';}
 const side=pos.turn==='w'?'brancas':'pretas';const prefix=result.check?'XEQUE! ':'Sua vez: ';
 if(isBotMode()&&pos.turn!==humanColor)return 'Bot pensando…';
 if($('opponent').value==='remote')return peerReady?(pos.turn===(peerRole==='host'?'w':'b')?'Sua vez: ':'Vez do adversário: ')+side:'Multiplayer: aguardando conexão.';
 return prefix+side+(result.check?' devem proteger o rei.':'');
}
function currentIconSet(){return ICON[appearance.pieces==='custom'?(appearance.quickPack||'classic'):$('pieces').value]||ICON.classic;}
function animateMove(m,oldPiece,fromRect,onArrive){
 let finished=false;
 const arrive=()=>{if(finished)return;finished=true;onArrive?.();};
 if(!oldPiece||!fromRect||window.matchMedia?.('(prefers-reduced-motion: reduce)').matches){arrive();return;}
 const end=document.querySelector(`.square[data-r="${m.tr}"][data-c="${m.tc}"]`);
 if(!end){arrive();return;}
 const toRect=end.getBoundingClientRect();
 if(!fromRect.width||!toRect.width){arrive();return;}
 const ghost=document.createElement('div');ghost.className='moving-piece-ghost';
 ghost.style.left=fromRect.left+'px';ghost.style.top=fromRect.top+'px';ghost.style.width=fromRect.width+'px';ghost.style.height=fromRect.height+'px';
 const src=appearance.pieces==='custom'?appearance.pieceImages[pieceKey(oldPiece.color,oldPiece.type)]:'';
 if(src){const img=document.createElement('img');img.className='custom-piece';img.src=src;ghost.appendChild(img);}
 else{ghost.textContent=currentIconSet()[oldPiece.color][oldPiece.type];ghost.style.fontSize=getComputedStyle(end).fontSize;ghost.style.color=oldPiece.color==='w'?'#faf9f0':'#17232d';ghost.style.textShadow=oldPiece.color==='w'?'0 1px 3px #030d12':'0 1px 2px #ffffffb0';}
 document.body.appendChild(ghost);end.classList.add('arrival-target');
 const dx=toRect.left-fromRect.left,dy=toRect.top-fromRect.top;
 let fallback;
 const cleanup=()=>{clearTimeout(fallback);ghost.remove();end.classList.remove('arrival-target');arrive();};
 fallback=setTimeout(cleanup,420); // Segurança caso animation.finish não dispare no Android.
 if(ghost.animate){
   try{const a=ghost.animate([{transform:'translate(0px,0px)'},{transform:`translate(${dx}px,${dy}px)`}],{duration:260,easing:'cubic-bezier(.25,.8,.25,1)'});a.onfinish=cleanup;a.oncancel=cleanup;}
   catch(_){cleanup();}
 }else{
   ghost.style.transition='transform 260ms ease-out';requestAnimationFrame(()=>ghost.style.transform=`translate(${dx}px,${dy}px)`);
   setTimeout(cleanup,290);
 }
}
function render(){
  finalStatus=E.result(pos,rules); say(statusText(finalStatus));
  $('turnPill').textContent=finalStatus.over?'Partida encerrada':pos.turn==='w'?'Vez das brancas':'Vez das pretas';
  $('lastMove').textContent=pos.history.length?'Última: '+pos.history.at(-1):'Escolha uma peça para começar.';
  applyAppearanceToUI();
  const root=$('board'); root.textContent='';
  const names=currentIconSet();
  const rows=flipped?[7,6,5,4,3,2,1,0]:[0,1,2,3,4,5,6,7];
  const cols=flipped?[7,6,5,4,3,2,1,0]:[0,1,2,3,4,5,6,7];
  const kingCheck=finalStatus.check?E.kingAt(pos,pos.turn):null;
  const frag=document.createDocumentFragment();
  for(const r of rows) for(const c of cols){
    const square=document.createElement('button'); square.type='button'; square.className='square '+((r+c)%2?'dark':'light');
    const piece=pos.board[r][c];square.dataset.r=r;square.dataset.c=c;
    if(piece){
      const customSrc=appearance.pieces==='custom'?appearance.pieceImages[pieceKey(piece.color,piece.type)]:'';
      if(customSrc){const img=document.createElement('img'); img.src=customSrc; img.alt=E.LABELS[piece.type]; img.className='custom-piece'; square.appendChild(img);} else square.textContent=names[piece.color][piece.type];
      square.classList.add(piece.color==='w'?'white':'black');
    }
    if(selected&&selected.r===r&&selected.c===c) square.classList.add('selected');
    if(trainingHint&&trainingHint.fr===r&&trainingHint.fc===c)square.classList.add('hint-source');
    if(trainingHint&&trainingHint.tr===r&&trainingHint.tc===c)square.classList.add('hint-dest');
    const target=selections.find(m=>m.tr===r&&m.tc===c); if(target) square.classList.add((piece||target.enPassant)?'capture':'target');
    if(kingCheck&&kingCheck.r===r&&kingCheck.c===c) square.classList.add('in-check');
    if(pos.last&&((pos.last.fr===r&&pos.last.fc===c)||(pos.last.tr===r&&pos.last.tc===c))) square.classList.add('last');
    if(c===cols.at(-1)) square.dataset.coord=E.square(r,c).slice(1);
    square.setAttribute('role','gridcell'); square.setAttribute('aria-label',E.square(r,c)+' '+(piece?E.LABELS[piece.type]+' '+(piece.color==='w'?'branca':'preta'):'vazia'));
    square.addEventListener('click',()=>squareClick(r,c)); frag.appendChild(square);
  }
  root.appendChild(frag);
  $('undo').disabled=undoStack.length===0||$('opponent').value==='remote';
  const hist=$('history'); hist.textContent='';
  for(const str of pos.history.slice(-28)){const li=document.createElement('li'); li.textContent=str; hist.appendChild(li);} hist.scrollTop=hist.scrollHeight;
}
function squareClick(r,c){
 if(finalStatus?.over||promotionPending)return;
 if(isBotMode()&&pos.turn!==humanColor)return;
 if($('opponent').value==='remote'&&(!peerReady||pos.turn!==(peerRole==='host'?'w':'b')))return;
 const possible=selections.filter(m=>m.tr===r&&m.tc===c);
 if(possible.length){if(possible.some(m=>m.promote)){choosePromotion(possible);return;}doMove(possible[0]);return;}
 const piece=pos.board[r][c];if(piece&&piece.color===pos.turn){selected={r,c};selections=E.legalAt(pos,r,c,rules);}else{selected=null;selections=[];}render();
}
function choosePromotion(moves){
  promotionPending=moves; const panel=$('promotionOptions'); panel.textContent=''; const color=pos.turn;
  for(const type of ['dama','torre','bispo','cavalo']){
    const move=moves.find(x=>x.promote===type); if(!move) continue;
    const btn=document.createElement('button'); btn.type='button'; btn.className='promote-button';
    const customSrc=appearance.pieces==='custom'?appearance.pieceImages[pieceKey(color,type)]:'';
    const icon=document.createElement(customSrc?'img':'span');
    if(customSrc){icon.src=customSrc; icon.alt=E.LABELS[type]; icon.style.width='40px'; icon.style.height='40px'; icon.style.objectFit='contain';}
    else {icon.style.fontSize='38px'; icon.textContent=currentIconSet()[color][type];}
    const label=document.createElement('span'); label.textContent=E.LABELS[type];
    btn.append(icon,label); btn.addEventListener('click',()=>{promotionPending=null; closePromotion(); doMove(move);}); panel.appendChild(btn);
  }
  $('promotionModal').hidden=false; $('promotionModal').setAttribute('aria-hidden','false'); panel.querySelector('button')?.focus();
}
function closePromotion(){$('promotionModal').hidden=true; $('promotionModal').setAttribute('aria-hidden','true');}
function doMove(m,remote=false){
 if($('opponent').value==='remote'){
  if(!peerReady)return;
  if(!remote&&pos.turn!==(peerRole==='host'?'w':'b'))return;
  if(remote&&pos.turn===(peerRole==='host'?'w':'b'))return;
 }
 const source=document.querySelector(`.square[data-r="${m.fr}"][data-c="${m.fc}"]`);
 const oldRect=source?.getBoundingClientRect();const oldPiece=pos.board[m.fr][m.fc]?{...pos.board[m.fr][m.fc]}:null;
 const captured=!!pos.board[m.tr][m.tc]||!!m.enPassant;
 undoStack.push(E.clone(pos));if(undoStack.length>50)undoStack.shift();
 pos=E.apply(pos,m,true);selected=null;selections=[];trainingHint=null;render();
 const soundKind=finalStatus.over?'end':finalStatus.check?'check':captured?'capture':'move';
 animateMove(m,oldPiece,oldRect,()=>playSound(soundKind));
 if($('opponent').value==='remote'&&!remote){if(!peer?.send({t:'move',m:{fr:m.fr,fc:m.fc,tr:m.tr,tc:m.tc,promote:m.promote||''},n:pos.history.length}))notify('Falha ao enviar movimento.');}
 recordRating();safeSave();
 if(!finalStatus.over&&isBotMode()&&pos.turn!==humanColor)scheduleBot();
}
function scheduleBot(){
 stopTimer();say('Bot pensando…');timer=setTimeout(()=>{
  timer=null;if(!isBotMode()||pos.turn===humanColor||E.result(pos,rules).over)return;
  const m=E.chooseBot(pos,rules,Number($('difficulty').value));if(m)doMove(m);else render();
 },430);
}
function undo(){
 if($('opponent').value==='remote')return;
 stopTimer();promotionPending=null;closePromotion();if(!undoStack.length)return;
 let last;do{last=undoStack.pop();if(!isBotMode()||last.turn===humanColor)break;}while(undoStack.length);
 pos=last;selected=null;selections=[];trainingHint=null;render();playSound('undo');safeSave();
 if(isBotMode()&&pos.turn!==humanColor&&!finalStatus.over)scheduleBot();
}
function setupTabs(){const root=$('tabs'); root.textContent=''; for(const type of E.TYPES){const btn=document.createElement('button'); btn.type='button'; btn.className='piece-tab'+(type===selectedPiece?' active':''); btn.textContent=E.LABELS[type]; btn.addEventListener('click',()=>{selectedPiece=type; redrawEditor();}); root.appendChild(btn);}}
function allowedPatterns(type){return type==='rei'?['all1','orth1','diag1']:Object.keys(E.PATTERNS);}
function selectPattern(id,value){const target=$(id); target.textContent=''; for(const key of allowedPatterns(selectedPiece)){const opt=document.createElement('option'); opt.value=key; opt.textContent=E.PATTERNS[key].name; target.appendChild(opt);} target.value=value; target.disabled=mode==='classic';}
function redrawEditor(){
  setupTabs(); selectPattern('moveRule',draft[selectedPiece].move); selectPattern('captureRule',draft[selectedPiece].cap);
  const costs=E.totalCost(draft),lim=E.limits(mode),pieceCost=E.PATTERNS[draft[selectedPiece].move].cost+E.PATTERNS[draft[selectedPiece].cap].cost;
  $('powerText').textContent=costs+' / '+lim.total; $('powerFill').style.width=Math.min(100,costs/lim.total*100)+'%'; $('powerFill').parentElement.classList.toggle('warn',costs>lim.total*.9);
  $('piecePower').textContent='Poder da peça selecionada: '+pieceCost+' / '+lim.per[selectedPiece]; $('applyRules').disabled=mode==='classic';
}
function changeDraft(which,newValue){const updated=E.clone(draft); updated[selectedPiece][which]=newValue; const error=E.validate(updated,mode); if(error) notify(error+' Tente outro padrão ou selecione Caos controlado.'); else {draft=updated; notify('Regra aceita! Clique em Aplicar regras para iniciar com ela.');} redrawEditor();}
function setMode(){if($('opponent').value==='remote'&&peerReady)return;mode=$('mode').value; rules=E.preset(mode); draft=E.clone(rules); notify(mode==='classic'?'Modo clássico ativado. Regras personalizadas bloqueadas.':'Agora personalize qualquer peça e clique em Aplicar regras.'); redrawEditor(); startGame();}
function exportGame(){
 const data={version:3,mode,rules,position:pos,undo:undoStack,opponent:$('opponent').value,difficulty:$('difficulty').value,flipped,appearance,playerChoice,humanColor};
 const blob=new Blob([JSON.stringify(data)],{type:'application/json'});const link=document.createElement('a'),url=URL.createObjectURL(blob);
 link.href=url;link.download='xadrez-mce1809-partida.json';document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1500);
}
function levelFromElo(elo){return elo<800?'Iniciante':elo<1000?'Aprendiz':elo<1200?'Competidor':elo<1450?'Estrategista':elo<1750?'Especialista':'Mestre de treino';}
function xpProgress(xp){
 let level=1,remaining=Math.max(0,xp);
 while(remaining>=100*level&&level<100){remaining-=100*level;level++;}
 return {level,progress:remaining,needed:100*level};
}
function updateRatingUI(){
 $('eloValue').textContent=String(Math.round(rating.elo));$('levelName').textContent=levelFromElo(rating.elo);
 $('recordText').textContent=`${rating.w}V · ${rating.d}E · ${rating.l}D`;
 const x=xpProgress(rating.xp||0);$('xpLevel').textContent='Nível '+x.level;$('xpText').textContent=x.progress+' / '+x.needed+' XP';
 $('xpFill').style.width=Math.max(0,Math.min(100,(x.progress/x.needed)*100))+'%';
}
function loadRating(){
 try{
  let x=JSON.parse(localStorage.getItem(RATING_STORE)||'null');
  // Se já havia partidas pontuadas na 1.3, preserva o Elo anterior.
  if(!x){const old=JSON.parse(localStorage.getItem('mce1809-xadrez-rating-v13')||'null');
   if(old&&Number.isInteger(old.w)&&Number.isInteger(old.d)&&Number.isInteger(old.l)&&old.w+old.d+old.l>0)x=old;
  }
  if(x&&Number.isFinite(x.elo)&&Number.isInteger(x.w)&&Number.isInteger(x.d)&&Number.isInteger(x.l)){
   rating={elo:Math.max(100,Math.min(3000,Math.round(x.elo))),xp:Number.isFinite(x.xp)?Math.max(0,Math.round(x.xp)):0,w:x.w,d:x.d,l:x.l};
   localStorage.setItem(RATING_STORE,JSON.stringify(rating)); dbPut('progresso','elo',cloneSimple(rating)).catch(()=>{});
  }
 }catch(_){}updateRatingUI();
}
function recordRating(){
 if(ratedOnce||!finalStatus?.over||$('opponent').value!=='bot')return;
 ratedOnce=true;
 const score=finalStatus.winner===humanColor?1:finalStatus.winner===null?0.5:0;
 const botElo={1:400,2:650,3:920,4:1250}[Number($('difficulty').value)]||650;
 const expected=1/(1+Math.pow(10,(botElo-rating.elo)/400));
 rating.elo=Math.round(Math.max(100,Math.min(3000,rating.elo+30*(score-expected))));
 if(score===1){rating.w++;rating.xp+=35+Number($('difficulty').value)*15;}
 else if(score===0)rating.l++;else rating.d++;
 try{localStorage.setItem(RATING_STORE,JSON.stringify(rating)); dbPut('progresso','elo',cloneSimple(rating)).catch(()=>{});}catch(_){}updateRatingUI();
 if(score===1)notify(`Vitória! +${35+Number($('difficulty').value)*15} XP. Elo atualizado.`);
}
function remoteStatus(t){$('remoteStatus').textContent=t;}
function setRemoteUI(){
 const remote=$('opponent').value==='remote';$('remotePanel').hidden=!remote;
 $('difficultyWrap').style.display=isBotMode()?'':'none';$('trainingPanel').hidden=!isTraining();
 $('restart').disabled=remote;$('undo').disabled=remote;$('loadGame').disabled=remote;$('mode').disabled=remote;
 $('applyRules').disabled=remote||mode==='classic';$('resetRules').disabled=remote;
 $('moveRule').disabled=remote||mode==='classic';$('captureRule').disabled=remote||mode==='classic';updateColorUI();
}
function peerClosed(){peerReady=false;remoteStatus('Desconectado. Gere novos códigos se quiser voltar.');setRemoteUI();render();}
function startPeer(){
  if(peer){peer.close(false);peer=null;}
  peerReady=false;peerRole=null;
  peer=new window.ChessPeer({
    onMessage:receivePeerMessage,
    onOpen:role=>{
      peerReady=true;peerRole=role;
      if(role==='host'){startGame();peer.send({t:'sync',mode,rules,position:pos});}
      else{flipped=true;render();}
      setRemoteUI();render();
    },
    onClose:peerClosed,
    onStatus:remoteStatus
  });
  return peer;
}
function receivePeerMessage(msg){
  if($('opponent').value!=='remote'||!peerReady)return;
  if(msg.t==='sync'&&peerRole==='guest'){
    if(!['balanced','classic','chaos'].includes(msg.mode)||E.validate(msg.rules,msg.mode)){
      remoteStatus('Regras recebidas inválidas.');return;
    }
    mode=msg.mode;rules=E.clone(msg.rules);draft=E.clone(rules);
    pos=E.newPosition();undoStack=[];selected=null;selections=[];
    $('mode').value=mode;redrawEditor();setRemoteUI();render();
    remoteStatus('Partida sincronizada. Você joga com as pretas.');
    return;
  }
  if(msg.t==='move'&&msg.m&&Number.isInteger(msg.n)&&msg.n===pos.history.length+1){
    if(pos.turn===(peerRole==='host'?'w':'b'))return;
    const mv=E.legalAll(pos,pos.turn,rules).find(x=>x.fr===msg.m.fr&&x.fc===msg.m.fc&&x.tr===msg.m.tr&&x.tc===msg.m.tc&&(x.promote||'')===(msg.m.promote||''));
    if(mv)doMove(mv,true);else remoteStatus('Jogada inválida recebida.');
  }
}
function bindPeerUI(){
  $('hostPeer').addEventListener('click',async()=>{
    try{$('ownSignal').value=''; $('peerSignal').value='';peerRole='host'; const p=startPeer();peerRole='host';$('ownSignal').value=await p.host($('networkType').value);}
    catch(e){remoteStatus('Erro: '+e.message);}
  });
  $('joinPeer').addEventListener('click',()=>{
    if(!$('peerSignal').value.trim()){remoteStatus('Cole primeiro o código do anfitrião no campo recebido.');return;}
    $('acceptSignal').click();
  });
  $('acceptSignal').addEventListener('click',async()=>{
    try{
      const code=$('peerSignal').value.trim();if(!code)throw Error('Cole um código primeiro.');
      const data=JSON.parse(code);
      let p=peer;
      if(data.type==='offer'){p=startPeer();peerRole='guest';}
      if(!p)throw Error('Primeiro crie uma sala.');
      const answer=await p.accept(code,$('networkType').value);
      if(answer){$('ownSignal').value=answer;peerRole='guest';}
    }catch(e){remoteStatus('Erro: '+e.message);}
  });
  $('copySignal').addEventListener('click',async()=>{
    try{await navigator.clipboard.writeText($('ownSignal').value);remoteStatus('Código copiado. Envie ao outro jogador.');}
    catch(_){$('ownSignal').select();remoteStatus('Selecione e copie o código manualmente.');}
  });
  $('downloadSignal').addEventListener('click',()=>{
    const code=$('ownSignal').value.trim();if(!code){remoteStatus('Gere um código primeiro.');return;}
    const blob=new Blob([code],{type:'text/plain;charset=utf-8'}),url=URL.createObjectURL(blob);
    const a=document.createElement('a');a.href=url;a.download='xadrez-mce1809-codigo.txt';a.click();setTimeout(()=>URL.revokeObjectURL(url),2000);
    remoteStatus('Código salvo em arquivo TXT. Compartilhe-o com o outro aparelho.');
  });
  $('importSignal').addEventListener('click',()=>$('signalFile').click());
  $('signalFile').addEventListener('change',async ev=>{
    const f=ev.target.files?.[0];ev.target.value='';if(!f)return;
    if(f.size>40000){remoteStatus('Arquivo de código grande demais.');return;}
    try{const t=(await f.text()).trim();const d=JSON.parse(t);if(!['offer','answer'].includes(d.type)||typeof d.sdp!=='string')throw Error('Arquivo inválido');$('peerSignal').value=t;remoteStatus('Código carregado. Toque em Confirmar código recebido.');}
    catch(_){remoteStatus('Esse arquivo não contém um código de conexão válido.');}
  });
  $('shareSignal').addEventListener('click',async()=>{
    try{await navigator.share({title:'Xadrez Custom — código de conexão',text:$('ownSignal').value});}
    catch(_){remoteStatus('Use Copiar código e envie pelo método disponível no celular.');}
  });
  $('disconnectPeer').addEventListener('click',()=>{peer?.close();peer=null;peerRole=null;peerReady=false;remoteStatus('Conexão encerrada.');render();});
}

function setupOfflineUI(){
 const label=$('offlineIndicator'),btn=$('checkOffline');
 const update=async()=>{
   if(!('serviceWorker' in navigator)||!('caches' in window)){label.textContent='Offline: navegador sem suporte necessário';return;}
   try{
     const names=await caches.keys();
     const cacheName=names.find(x=>x==='xadrez-mce1809-full-v15');
     if(!cacheName){label.textContent='Offline: preparando arquivos — mantenha esta página online';return;}
     const c=await caches.open(cacheName);
     const entries=await Promise.all(['index.html','engine.js','game.js','peer.js','style.css','manifest.webmanifest','icon-192.png','icon-512.png'].map(f=>c.match(new URL('./'+f,location.href))));
     label.textContent=entries.every(Boolean)?'Offline pronto: jogo, bot e treino disponíveis':'Offline: arquivos ainda incompletos';
   }catch(_){label.textContent='Offline: não foi possível verificar o cache';}
 };
 btn.addEventListener('click',update);
 window.addEventListener('online',update);window.addEventListener('offline',update);
 if('serviceWorker' in navigator){navigator.serviceWorker.ready.then(update).catch(()=>{});navigator.serviceWorker.addEventListener('controllerchange',update);}
 setTimeout(update,1200);
}

function showTrainingHint(){
 if(!isTraining())return;
 if(finalStatus?.over){$('trainingTip').textContent='A partida terminou. Inicie outra para continuar treinando.';return;}
 if(pos.turn!==humanColor){$('trainingTip').textContent='O bot está jogando. Aguarde a sua vez.';return;}
 const options=E.legalAll(pos,pos.turn,rules);
 if(!options.length){$('trainingTip').textContent='Não há lances válidos.';return;}
 const sign=pos.turn==='b'?1:-1;
 const ranked=options.map(m=>({m,score:sign*E.evalPos(E.apply(pos,m),rules)})).sort((a,b)=>b.score-a.score);
 trainingHint=ranked[0].m;
 $('trainingTip').textContent='Experimente mover de '+E.square(trainingHint.fr,trainingHint.fc)+' para '+E.square(trainingHint.tr,trainingHint.tc)+'. É uma sugestão simples baseada nas peças e no posicionamento.';
 render();
}
function clearTrainingHint(){trainingHint=null;$('trainingTip').textContent='Dica removida. Continue praticando!';render();}
async function init(){
 setupSound();loadRating();bindPeerUI();setupOfflineUI();
 rebuildAppearanceInputs();
 $('whiteSkinTab').addEventListener('click',()=>{skinSide='w';rebuildAppearanceInputs();});
 $('blackSkinTab').addEventListener('click',()=>{skinSide='b';rebuildAppearanceInputs();});
 $('boardLightFile').addEventListener('change',onBoardFile);$('boardDarkFile').addEventListener('change',onBoardFile);
 for(const key of ['light','dark'])$('board'+(key==='light'?'Light':'Dark')+'Color').addEventListener('input',ev=>{
  appearance.boardColors[key]=ev.target.value;appearance.boardImages[key]='';appearance.theme='custom';render();safeSave();
 });
 $('savedThemeSelect').addEventListener('change',()=>{const item=savedThemes.find(x=>x.id===$('savedThemeSelect').value);$('customThemeName').value=item?.name||'';});
 $('saveCustomTheme').addEventListener('click',saveNewTheme);
 $('loadCustomTheme').addEventListener('click',loadSelectedTheme);
 $('renameCustomTheme').addEventListener('click',renameSelectedTheme);
 $('deleteCustomTheme').addEventListener('click',deleteSelectedTheme);
 $('saveAppearance').addEventListener('click',saveAppearance);$('resetAppearance').addEventListener('click',resetAppearance);$('applyQuickPack').addEventListener('click',applyQuickPack);
 $('exportAppearance').addEventListener('click',exportAppearance);$('importAppearance').addEventListener('click',()=>$('appearanceInput').click());
 $('appearanceInput').addEventListener('change',async ev=>{const f=ev.target.files?.[0];if(f){try{await importAppearanceFile(f);}catch(e){alert(e.message);}}ev.target.value='';});
 for(const id of ['moveRule','captureRule'])$(id).addEventListener('change',ev=>changeDraft(id==='moveRule'?'move':'cap',ev.target.value));
 $('applyRules').addEventListener('click',()=>{if($('opponent').value==='remote')return;const error=E.validate(draft,mode);if(error){notify(error);return;}rules=E.clone(draft);startGame();notify('Regras aplicadas para os dois jogadores. Boa partida!');});
 $('resetRules').addEventListener('click',()=>{draft=E.preset(mode);redrawEditor();notify('Padrão restaurado no editor. Clique em Aplicar regras para usar.');});
 $('mode').addEventListener('change',setMode);
 $('opponent').addEventListener('change',()=>{if(peer){peer.close(false);peer=null;}peerReady=false;peerRole=null;toggleBotControl();setRemoteUI();startGame();});
 $('playerColor').addEventListener('change',startGame);$('difficulty').addEventListener('change',safeSave);
 $('restart').addEventListener('click',()=>{if($('opponent').value!=='remote')startGame();});
 $('undo').addEventListener('click',undo);$('flip').addEventListener('click',()=>{flipped=!flipped;render();safeSave();});
 $('trainingHint').addEventListener('click',showTrainingHint);$('trainingClear').addEventListener('click',clearTrainingHint);
 $('theme').addEventListener('change',()=>{appearance.theme=$('theme').value;render();safeSave();});
 $('pieces').addEventListener('change',()=>{appearance.pieces=$('pieces').value;render();safeSave();});
 $('downloadGame').addEventListener('click',exportGame);$('loadGame').addEventListener('click',()=>$('fileInput').click());
 $('fileInput').addEventListener('change',async ev=>{const file=ev.target.files?.[0];if(!file)return;if(file.size>8_000_000){alert('Arquivo grande demais para uma partida.');ev.target.value='';return;}try{restore(JSON.parse(await file.text()));safeSave();notify('Partida importada!');}catch(err){alert('Não foi possível abrir: '+err.message);}ev.target.value='';});
 toggleBotControl();setRemoteUI();
 await loadThemeLibrary();
 try{
  // Prioriza a versão IndexedDB, mas recupera dados antigos sem apagá-los.
  const dbSaved=await dbGet('partidas','atual');
  const legacy=localStorage.getItem(STORAGE)||localStorage.getItem(LEGACY_STORAGE);
  const saved=dbSaved||(legacy?JSON.parse(legacy):null);
  if(saved){restore(saved);safeSave();notify('Partida restaurada automaticamente.');}
  else {appearance=cloneSimple(APPEARANCE_DEFAULT);applyAppearanceToUI();setMode();}
 }catch(err){console.warn('Recuperação:',err);appearance=cloneSimple(APPEARANCE_DEFAULT);applyAppearanceToUI();setMode();}
}
init();
if('serviceWorker' in navigator&&location.protocol.startsWith('http'))navigator.serviceWorker.register('./sw.js').catch(()=>{});
})();
