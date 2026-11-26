/* Interface e persistência offline do Xadrez Custom Full — MCE1809 1.3 */
(()=>{
'use strict';
const E=window.XadrezEngine;
const $=id=>document.getElementById(id);
const ICON={
  classic:{w:{rei:'♔',dama:'♕',torre:'♖',bispo:'♗',cavalo:'♘',peao:'♙'},b:{rei:'♚',dama:'♛',torre:'♜',bispo:'♝',cavalo:'♞',peao:'♟'}},
  cyber:{w:{rei:'👑',dama:'💎',torre:'🚀',bispo:'⚡',cavalo:'🦄',peao:'🛡️'},b:{rei:'💀',dama:'🔮',torre:'🛸',bispo:'🔥',cavalo:'🐉',peao:'⚔️'}}
};
const STORAGE='mce1809-xadrez-full-v11';
const SOUND_STORE='mce1809-xadrez-sound-v12';
const RATING_STORE='mce1809-xadrez-rating-v13';
let rating={elo:1000,w:0,d:0,l:0};let ratedOnce=false;
let peer=null,peerRole=null,peerReady=false;
let audioCtx=null;
let soundConfig={enabled:true,volume:0.35};
const APPEARANCE_DEFAULT={theme:'madeira',pieces:'classic',quickPack:'classic',boardImages:{light:'',dark:''},pieceImages:{}};
let appearance=cloneSimple(APPEARANCE_DEFAULT);
let mode='balanced',rules=E.preset(mode),draft=E.clone(rules),selectedPiece='torre';
let pos=E.newPosition(),selections=[],selected=null,undoStack=[],timer=null,flipped=false,promotionPending=null,finalStatus=null;

function cloneSimple(v){return JSON.parse(JSON.stringify(v));}
function playSound(kind){
  if(!soundConfig.enabled||soundConfig.volume<=0)return;
  try{
    const AudioCtx=window.AudioContext||window.webkitAudioContext;
    if(!AudioCtx)return;
    if(!audioCtx)audioCtx=new AudioCtx();
    if(audioCtx.state==='suspended') audioCtx.resume().catch(()=>{});
    const tones={move:[[350,0,0.075]],capture:[[520,0,0.075],[320,0.085,0.11]],check:[[700,0,0.11],[850,0.12,0.14]],end:[[540,0,0.11],[690,0.12,0.11],[850,0.24,0.20]],undo:[[460,0,0.065],[330,0.08,0.095]]};
    const start=audioCtx.currentTime+0.015;
    for(const [freq,delay,duration] of (tones[kind]||tones.move)){
      const osc=audioCtx.createOscillator(),gain=audioCtx.createGain();
      osc.type=kind==='capture'?'triangle':'sine';osc.frequency.setValueAtTime(freq,start+delay);
      gain.gain.setValueAtTime(0.0001,start+delay);
      gain.gain.exponentialRampToValueAtTime(Math.max(0.001,soundConfig.volume*0.15),start+delay+0.018);
      gain.gain.exponentialRampToValueAtTime(0.0001,start+delay+duration);
      osc.connect(gain);gain.connect(audioCtx.destination);
      osc.start(start+delay);osc.stop(start+delay+duration+0.015);
    }
  }catch(_){ /* Áudio opcional: o jogo continua mesmo sem suporte. */ }
}
function saveSound(){try{localStorage.setItem(SOUND_STORE,JSON.stringify(soundConfig));}catch(_){}}
function setupSound(){
  try{const prev=JSON.parse(localStorage.getItem(SOUND_STORE)||'null');if(prev&&typeof prev==='object'){soundConfig.enabled=prev.enabled!==false; soundConfig.volume=Math.max(0,Math.min(1,Number(prev.volume)||0));}}catch(_){}
  $('soundEnabled').checked=soundConfig.enabled;
  $('soundVolume').value=String(Math.round(soundConfig.volume*100));
  $('soundEnabled').addEventListener('change',()=>{soundConfig.enabled=$('soundEnabled').checked;saveSound();if(soundConfig.enabled)playSound('move');});
  $('soundVolume').addEventListener('input',()=>{soundConfig.volume=Number($('soundVolume').value)/100;saveSound();});
  $('testSound').addEventListener('click',()=>playSound('capture'));
}
function say(t){$('status').textContent=t;}
function notify(t){$('feedback').textContent=t;}
function pieceKey(color,type){return color+'_'+type;}
function normalizeAppearance(a){
  const base=cloneSimple(APPEARANCE_DEFAULT);
  if(!a||typeof a!=='object') return base;
  base.theme=['madeira','neon','gelo','custom'].includes(a.theme)?a.theme:'madeira';
  base.pieces=['classic','cyber','custom'].includes(a.pieces)?a.pieces:'classic';
  base.quickPack=['classic','cyber'].includes(a.quickPack)?a.quickPack:'classic';
  if(a.boardImages&&typeof a.boardImages==='object'){
    base.boardImages.light=typeof a.boardImages.light==='string'?a.boardImages.light:'';
    base.boardImages.dark=typeof a.boardImages.dark==='string'?a.boardImages.dark:'';
  }
  if(a.pieceImages&&typeof a.pieceImages==='object') base.pieceImages=a.pieceImages;
  return base;
}
function safeSave(){
  try{
    const data={version:2,mode,rules,position:pos,undo:undoStack.slice(-50),opponent:$('opponent').value,difficulty:$('difficulty').value,theme:$('theme').value,pieces:$('pieces').value,flipped,appearance};
    localStorage.setItem(STORAGE,JSON.stringify(data));
  }catch(_){ }
}
function isValidRestore(d){
  const okVersion=d&&(d.version===1||d.version===2);
  return okVersion&&['balanced','classic','chaos'].includes(d.mode)&&!E.validate(d.rules,d.mode)&&d.position&&Array.isArray(d.position.board)&&d.position.board.length===8&&d.position.board.every(row=>Array.isArray(row)&&row.length===8)&&['w','b'].includes(d.position.turn);
}
function stopTimer(){if(timer!==null){clearTimeout(timer);timer=null;}}
function toggleBotControl(){$('difficultyWrap').style.display=$('opponent').value==='bot'?'':'none';}
function applyAppearanceToUI(){
  document.body.dataset.theme=appearance.theme==='custom'?'madeira':appearance.theme;
  $('theme').value=appearance.theme;
  $('pieces').value=appearance.pieces;
  $('quickPack').value=appearance.quickPack;
  const board=$('board');
  board.classList.toggle('custom-skin',appearance.theme==='custom'&&!!(appearance.boardImages.light||appearance.boardImages.dark));
  board.style.setProperty('--board-light-image',appearance.boardImages.light?`url(${appearance.boardImages.light})`:'none');
  board.style.setProperty('--board-dark-image',appearance.boardImages.dark?`url(${appearance.boardImages.dark})`:'none');
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
  const root=$('piecePackInputs'); root.textContent='';
  const order=[['w','rei'],['w','dama'],['w','torre'],['w','bispo'],['w','cavalo'],['w','peao'],['b','rei'],['b','dama'],['b','torre'],['b','bispo'],['b','cavalo'],['b','peao']];
  for(const [color,type] of order){
    const key=pieceKey(color,type);
    const label=document.createElement('label');
    label.textContent=(color==='w'?'Branca':'Preta')+' · '+E.LABELS[type];
    const input=document.createElement('input');
    input.type='file'; input.accept='image/png,image/*'; input.dataset.key=key;
    input.addEventListener('change',onPieceFile);
    const preview=document.createElement('div');
    preview.className='preview-chip'; preview.id='preview_'+key;
    label.appendChild(input); label.appendChild(preview); root.appendChild(label);
  }
  updateAppearancePreviews();
}
function fileToDataUrl(file){return new Promise((resolve,reject)=>{const rd=new FileReader(); rd.onload=()=>resolve(String(rd.result)); rd.onerror=()=>reject(Error('Falha ao ler imagem.')); rd.readAsDataURL(file);});}
async function onBoardFile(ev){
  const file=ev.target.files&&ev.target.files[0]; if(!file) return;
  appearance.boardImages[ev.target.dataset.kind]=await fileToDataUrl(file);
  appearance.theme='custom'; $('theme').value='custom';
  applyAppearanceToUI(); notify('PNG do tabuleiro carregado. Clique em Salvar aparência.');
}
async function onPieceFile(ev){
  const file=ev.target.files&&ev.target.files[0]; if(!file) return;
  appearance.pieceImages[ev.target.dataset.key]=await fileToDataUrl(file);
  appearance.pieces='custom'; $('pieces').value='custom';
  applyAppearanceToUI(); render(); notify('PNG da peça carregado. Clique em Salvar aparência.');
}
function saveAppearance(){
  appearance.theme=$('theme').value;
  appearance.pieces=$('pieces').value;
  appearance.quickPack=$('quickPack').value;
  safeSave(); render(); notify('Aparência salva neste navegador.');
}
function resetAppearance(){appearance=cloneSimple(APPEARANCE_DEFAULT); applyAppearanceToUI(); safeSave(); render(); notify('Aparência restaurada para o padrão.');}
function applyQuickPack(){appearance.quickPack=$('quickPack').value; appearance.pieces=appearance.quickPack; $('pieces').value=appearance.pieces; render(); notify('Pack da biblioteca aplicado.');}
function restore(d){
  if(!isValidRestore(d)) throw Error('Arquivo de partida não reconhecido.');
  stopTimer();
  mode=d.mode; rules=E.clone(d.rules); draft=E.clone(rules); pos=d.position;
  undoStack=Array.isArray(d.undo)?d.undo.slice(-50):[]; flipped=!!d.flipped; selected=null; selections=[];
  appearance=normalizeAppearance(d.appearance);
  $('mode').value=mode;
  $('opponent').value=d.opponent==='local'?'local':'bot';
  $('difficulty').value=['1','2','3','4'].includes(String(d.difficulty))?String(d.difficulty):'2';
  applyAppearanceToUI();
  ratedOnce=E.result(pos,rules).over;redrawEditor(); toggleBotControl(); render();
  if(!E.result(pos,rules).over&&$('opponent').value==='bot'&&pos.turn==='b') scheduleBot();
}
function startGame(){stopTimer(); pos=E.newPosition(); undoStack=[]; selected=null; selections=[]; promotionPending=null; ratedOnce=false; closePromotion(); render(); safeSave();}
function statusText(result){
  if(result.over){ if(result.winner) return 'XEQUE-MATE! '+(result.winner==='w'?'Brancas':'Pretas')+' venceram!'; return 'EMPATE — '+result.reason+'.'; }
  const side=pos.turn==='w'?'brancas':'pretas'; const prefix=result.check?'XEQUE! ':'Sua vez: ';
  if($('opponent').value==='bot'&&pos.turn==='b') return 'Bot pensando…';
  if($('opponent').value==='remote')return peerReady?(pos.turn===(peerRole==='host'?'w':'b')?'Sua vez: ':'Vez do adversário: ')+side:'Multiplayer: aguardando conexão.';
  return prefix+side+(result.check?' devem proteger o rei.':'');
}
function currentIconSet(){return ICON[appearance.pieces==='custom'?(appearance.quickPack||'classic'):$('pieces').value]||ICON.classic;}
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
    const piece=pos.board[r][c];
    if(piece){
      const customSrc=appearance.pieces==='custom'?appearance.pieceImages[pieceKey(piece.color,piece.type)]:'';
      if(customSrc){const img=document.createElement('img'); img.src=customSrc; img.alt=E.LABELS[piece.type]; img.className='custom-piece'; square.appendChild(img);} else square.textContent=names[piece.color][piece.type];
      square.classList.add(piece.color==='w'?'white':'black');
    }
    if(selected&&selected.r===r&&selected.c===c) square.classList.add('selected');
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
  if(finalStatus?.over||promotionPending) return;
  if($('opponent').value==='bot'&&pos.turn!=='w') return;
  if($('opponent').value==='remote'&&(!peerReady||pos.turn!==(peerRole==='host'?'w':'b')))return;
  const possible=selections.filter(m=>m.tr===r&&m.tc===c);
  if(possible.length){ if(possible.some(m=>m.promote)){choosePromotion(possible); return;} doMove(possible[0]); return; }
  const piece=pos.board[r][c];
  if(piece&&piece.color===pos.turn){ selected={r,c}; selections=E.legalAt(pos,r,c,rules);} else { selected=null; selections=[]; }
  render();
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
  const captured=!!pos.board[m.tr][m.tc]||!!m.enPassant;
  undoStack.push(E.clone(pos)); if(undoStack.length>50)undoStack.shift();
  pos=E.apply(pos,m,true); selected=null;selections=[];render();
  playSound(finalStatus.over?'end':finalStatus.check?'check':captured?'capture':'move');
  if($('opponent').value==='remote'&&!remote){if(!peer?.send({t:'move',m:{fr:m.fr,fc:m.fc,tr:m.tr,tc:m.tc,promote:m.promote||''},n:pos.history.length}))notify('Falha ao enviar movimento.');}
  recordRating();safeSave();
  if(!finalStatus.over&&$('opponent').value==='bot'&&pos.turn==='b')scheduleBot();
}
function scheduleBot(){stopTimer(); say('Bot pensando…'); timer=setTimeout(()=>{timer=null; if(pos.turn!=='b'||E.result(pos,rules).over||$('opponent').value!=='bot') return; const m=E.chooseBot(pos,rules,Number($('difficulty').value)); if(m) doMove(m); else render();},180);}
function undo(){
  if($('opponent').value==='remote')return;
  stopTimer(); promotionPending=null; closePromotion(); if(!undoStack.length) return;
  let last; do{ last=undoStack.pop(); if($('opponent').value==='local'||last.turn==='w') break; }while(undoStack.length);
  pos=last; selected=null; selections=[]; render(); playSound('undo'); safeSave(); if($('opponent').value==='bot'&&pos.turn==='b'&&!finalStatus.over) scheduleBot();
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
  const data={version:2,mode,rules,position:pos,undo:undoStack,opponent:$('opponent').value,difficulty:$('difficulty').value,theme:$('theme').value,pieces:$('pieces').value,flipped,appearance};
  const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'}); const link=document.createElement('a'); const url=URL.createObjectURL(blob); link.href=url; link.download='xadrez-mce1809-partida.json'; document.body.appendChild(link); link.click(); link.remove(); setTimeout(()=>URL.revokeObjectURL(url),1200);
}

function levelFromElo(elo){
  return elo<850?'Iniciante':elo<1050?'Aprendiz':elo<1250?'Competidor':elo<1450?'Estrategista':elo<1700?'Especialista':'Mestre de treino';
}
function updateRatingUI(){
  $('eloValue').textContent=String(Math.round(rating.elo));
  $('levelName').textContent=levelFromElo(rating.elo);
  $('recordText').textContent=`${rating.w}V · ${rating.d}E · ${rating.l}D`;
}
function loadRating(){
  try{const x=JSON.parse(localStorage.getItem(RATING_STORE)||'null');if(x&&Number.isFinite(x.elo)&&Number.isInteger(x.w)&&Number.isInteger(x.d)&&Number.isInteger(x.l))rating=x;}catch(_){}
  updateRatingUI();
}
function recordRating(){
  if(ratedOnce||!finalStatus?.over||$('opponent').value!=='bot')return;
  ratedOnce=true;
  const score=finalStatus.winner==='w'?1:finalStatus.winner==='b'?0:0.5;
  const botElo={1:600,2:900,3:1200,4:1550}[Number($('difficulty').value)]||900;
  const expected=1/(1+Math.pow(10,(botElo-rating.elo)/400));
  rating.elo=Math.round(Math.max(100,Math.min(2800,rating.elo+24*(score-expected))));
  if(score===1)rating.w++; else if(score===0)rating.l++; else rating.d++;
  try{localStorage.setItem(RATING_STORE,JSON.stringify(rating));}catch(_){}
  updateRatingUI();
}
function remoteStatus(t){$('remoteStatus').textContent=t;}
function setRemoteUI(){
  const remote=$('opponent').value==='remote';
  $('remotePanel').hidden=!remote;
  $('difficultyWrap').style.display=$('opponent').value==='bot'?'':'none';
  $('restart').disabled=remote;$('undo').disabled=remote;$('loadGame').disabled=remote;
  $('mode').disabled=remote;
  $('applyRules').disabled=remote||mode==='classic';
  $('resetRules').disabled=remote;
  $('moveRule').disabled=remote||mode==='classic';$('captureRule').disabled=remote||mode==='classic';
}
function peerClosed(){peerReady=false;remoteStatus('Desconectado. Gere novos códigos se quiser voltar.');setRemoteUI();render();}
function startPeer(){
  if(peer){peer.close(false);peer=null;}
  peerReady=false;peerRole=null;
  peer=new window.ChessPeer({
    onMessage:receivePeerMessage,
    onOpen:role=>{
      peerReady=true;peerRole=role;
      if(role==='host'){
        startGame();peer.send({t:'sync',mode,rules,position:pos});
      }
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
  $('shareSignal').addEventListener('click',async()=>{
    try{await navigator.share({title:'Xadrez Custom — código de conexão',text:$('ownSignal').value});}
    catch(_){remoteStatus('Use Copiar código e envie pelo método disponível no celular.');}
  });
  $('disconnectPeer').addEventListener('click',()=>{peer?.close();peer=null;peerRole=null;peerReady=false;remoteStatus('Conexão encerrada.');render();});
}

function init(){
  setupSound();loadRating();bindPeerUI();
  rebuildAppearanceInputs();
  $('boardLightFile').addEventListener('change',onBoardFile); $('boardDarkFile').addEventListener('change',onBoardFile);
  $('saveAppearance').addEventListener('click',saveAppearance); $('resetAppearance').addEventListener('click',resetAppearance); $('applyQuickPack').addEventListener('click',applyQuickPack);
  for(const id of ['moveRule','captureRule']) $(id).addEventListener('change',ev=>changeDraft(id==='moveRule'?'move':'cap',ev.target.value));
  $('applyRules').addEventListener('click',()=>{if($('opponent').value==='remote')return;const error=E.validate(draft,mode); if(error){notify(error); return;} rules=E.clone(draft); startGame(); notify('Regras aplicadas para os dois jogadores. Boa partida!');});
  $('resetRules').addEventListener('click',()=>{draft=E.preset(mode); redrawEditor(); notify('Padrão restaurado no editor. Clique em Aplicar regras para usar.');});
  $('mode').addEventListener('change',setMode); $('opponent').addEventListener('change',()=>{if(peer){peer.close(false);peer=null;}peerReady=false;peerRole=null;toggleBotControl();setRemoteUI();startGame();}); $('difficulty').addEventListener('change',safeSave);
  $('restart').addEventListener('click',()=>{if($('opponent').value!=='remote')startGame();}); $('undo').addEventListener('click',undo); $('flip').addEventListener('click',()=>{flipped=!flipped; render(); safeSave();});
  $('theme').addEventListener('change',()=>{appearance.theme=$('theme').value; applyAppearanceToUI(); safeSave(); render();});
  $('pieces').addEventListener('change',()=>{appearance.pieces=$('pieces').value; render(); safeSave();});
  $('downloadGame').addEventListener('click',exportGame); $('loadGame').addEventListener('click',()=>$('fileInput').click());
  $('fileInput').addEventListener('change',async ev=>{const file=ev.target.files[0]; if(!file) return; if(file.size>1_000_000){alert('Arquivo grande demais para uma partida de xadrez.'); ev.target.value=''; return;} try{restore(JSON.parse(await file.text())); safeSave(); notify('Partida importada!');}catch(err){alert('Não foi possível abrir esta partida: '+err.message);} ev.target.value='';});
  toggleBotControl();setRemoteUI();
  try{const saved=localStorage.getItem(STORAGE); if(saved){restore(JSON.parse(saved)); notify('Sua última partida foi restaurada automaticamente.');} else {appearance=cloneSimple(APPEARANCE_DEFAULT); applyAppearanceToUI(); setMode();}}catch(_){appearance=cloneSimple(APPEARANCE_DEFAULT); applyAppearanceToUI(); setMode();}
}
init();
if('serviceWorker' in navigator&&location.protocol.startsWith('http')) navigator.serviceWorker.register('./sw.js').catch(()=>{});
})();
