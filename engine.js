/* Xadrez Custom — MCE1809 Full: motor offline sem dependências. */
(function(root){
'use strict';
const TYPES=['rei','dama','torre','bispo','cavalo','peao'];
const LABELS={rei:'Rei',dama:'Dama',torre:'Torre',bispo:'Bispo',cavalo:'Cavalo',peao:'Peão'};
const LETTERS={rei:'R',dama:'D',torre:'T',bispo:'B',cavalo:'C',peao:''};
const ORTH=[[1,0],[-1,0],[0,1],[0,-1]], DIAG=[[1,1],[1,-1],[-1,1],[-1,-1]], ALL=[...ORTH,...DIAG], KNIGHT=[[1,2],[1,-2],[-1,2],[-1,-2],[2,1],[2,-1],[-2,1],[-2,-1]];
const PATTERNS={
 forward:{name:'Frente (1; peão até 2 no início)',cost:1},pawnDiag:{name:'Diagonais para frente (1)',cost:1},
 orth1:{name:'Reto (1 casa)',cost:2},diag1:{name:'Diagonal (1 casa)',cost:2},all1:{name:'Todas direções (1 casa)',cost:4},
 knight:{name:'Salto em L (cavalo)',cost:3},camel:{name:'Salto longo (3 × 1)',cost:5},
 orth2:{name:'Salto reto (2 casas)',cost:4},diag2:{name:'Salto diagonal (2 casas)',cost:4},all2:{name:'Saltos em 2 casas',cost:7},
 orthSlide:{name:'Linhas retas livres',cost:5},diagSlide:{name:'Diagonais livres',cost:5},allSlide:{name:'Todas as linhas livres',cost:9},
 forwardSlide:{name:'Avançar em linha livre',cost:5},sideSlide:{name:'Lados livres',cost:4}
};
const CLASSIC={rei:{move:'all1',cap:'all1'},dama:{move:'allSlide',cap:'allSlide'},torre:{move:'orthSlide',cap:'orthSlide'},bispo:{move:'diagSlide',cap:'diagSlide'},cavalo:{move:'knight',cap:'knight'},peao:{move:'forward',cap:'pawnDiag'}};
const COUNT={rei:1,dama:1,torre:2,bispo:2,cavalo:2,peao:8};
const PIECE_CAP={rei:8,dama:18,torre:18,bispo:18,cavalo:16,peao:8};
const CHAOS_CAP={rei:8,dama:18,torre:18,bispo:18,cavalo:18,peao:18};
const MATERIAL={rei:20000,dama:900,torre:500,bispo:330,cavalo:320,peao:100};
const clone=x=>JSON.parse(JSON.stringify(x));
const inside=(r,c)=>r>=0&&r<8&&c>=0&&c<8;
const square=(r,c)=>'abcdefgh'[c]+(8-r);
const opposite=c=>c==='w'?'b':'w';
function isClassic(rules){return TYPES.every(t=>rules[t].move===CLASSIC[t].move&&rules[t].cap===CLASSIC[t].cap);}
function preset(mode){const r=clone(CLASSIC);if(mode!=='classic')r.torre={move:'diagSlide',cap:'orthSlide'};if(mode==='chaos'){r.bispo={move:'knight',cap:'diagSlide'};r.cavalo={move:'diag2',cap:'knight'};}return r;}
function totalCost(r){return TYPES.reduce((n,t)=>n+COUNT[t]*(PATTERNS[r[t].move].cost+PATTERNS[r[t].cap].cost),0);}
function limits(mode){return {total:mode==='chaos'?170:115,per:mode==='chaos'?CHAOS_CAP:PIECE_CAP};}
function validate(r,mode){if(mode==='classic'&&!isClassic(r))return 'No modo clássico, as peças usam as regras tradicionais.';
 const lim=limits(mode);for(const t of TYPES){if(!r[t]||!PATTERNS[r[t].move]||!PATTERNS[r[t].cap])return 'Padrão inválido.';
  const power=PATTERNS[r[t].move].cost+PATTERNS[r[t].cap].cost;
  if(power>lim.per[t])return LABELS[t]+': poder acima do limite ('+power+'/'+lim.per[t]+').';
  if(t==='rei'&&(!['all1','orth1','diag1'].includes(r[t].move)||!['all1','orth1','diag1'].includes(r[t].cap)))return 'O rei não pode saltar nem se mover ilimitadamente.';
 }
 if(totalCost(r)>lim.total)return 'Orçamento geral excedido: '+totalCost(r)+'/'+lim.total+'.';
 return null;
}
function vector(pattern,color){const d=color==='w'?-1:1;switch(pattern){
 case 'forward':case 'forwardSlide':return [[d,0]];
 case 'pawnDiag':return [[d,1],[d,-1]];
 case 'sideSlide':return [[0,1],[0,-1]];
 case 'orth1':case 'orthSlide':return ORTH;
 case 'diag1':case 'diagSlide':return DIAG;
 case 'all1':case 'allSlide':return ALL;
 case 'knight':return KNIGHT;
 case 'camel':return [[1,3],[1,-3],[-1,3],[-1,-3],[3,1],[3,-1],[-3,1],[-3,-1]];
 case 'orth2':return ORTH.map(([a,b])=>[a*2,b*2]);
 case 'diag2':return DIAG.map(([a,b])=>[a*2,b*2]);
 case 'all2':return ALL.map(([a,b])=>[a*2,b*2]);
 default:return [];
 }}
function isSlide(pattern){return pattern.endsWith('Slide');}
function newPosition(){const row=['torre','cavalo','bispo','dama','rei','bispo','cavalo','torre'];const board=Array.from({length:8},()=>Array(8).fill(null));
 for(let c=0;c<8;c++){board[0][c]={type:row[c],color:'b'};board[1][c]={type:'peao',color:'b'};board[6][c]={type:'peao',color:'w'};board[7][c]={type:row[c],color:'w'};}
 const p={board,turn:'w',rights:{w:{K:true,Q:true},b:{K:true,Q:true}},ep:null,halfmove:0,fullmove:1,history:[],repetitions:{},last:null};p.repetitions[positionKey(p)]=1;return p;}
function positionKey(p){let s='';for(const row of p.board)for(const v of row)s+=v?(v.color==='w'?'W':'B')+v.type.charAt(0):'_';
 // Bishop and bot-piece initial characters are unique? bispo and others b? 'bispo' and 'b...' none; 'torre','cavalo','dama','rei','peao' unique.
 s+=p.turn+(p.rights.w.K?'K':'')+(p.rights.w.Q?'Q':'')+(p.rights.b.K?'k':'')+(p.rights.b.Q?'q':'')+'|'+(p.ep?square(p.ep.r,p.ep.c):'-');return s;}
function kingAt(p,color){for(let r=0;r<8;r++)for(let c=0;c<8;c++){const q=p.board[r][c];if(q&&q.type==='rei'&&q.color===color)return {r,c};}return null;}
function raw(p,r,c,rules,attacksOnly){const b=p.board,piece=b[r][c];if(!piece)return [];
 const rule=rules[piece.type],ans=[];
 if(!attacksOnly){
  for(const[dr,dc]of vector(rule.move,piece.color)){
   let nr=r+dr,nc=c+dc;
   while(inside(nr,nc)){
    if(b[nr][nc])break;
    ans.push({fr:r,fc:c,tr:nr,tc:nc});
    if(!isSlide(rule.move))break;
    nr+=dr;nc+=dc;
   }
  }
  if(piece.type==='peao'&&rule.move==='forward'){
   const d=piece.color==='w'?-1:1,initial=piece.color==='w'?6:1;
   if(r===initial&&!b[r+d][c]&&!b[r+2*d][c])ans.push({fr:r,fc:c,tr:r+2*d,tc:c,double:true});
  }
 }
 for(const[dr,dc]of vector(rule.cap,piece.color)){
  let nr=r+dr,nc=c+dc;
  while(inside(nr,nc)){
   const q=b[nr][nc];
   if(attacksOnly){ans.push({fr:r,fc:c,tr:nr,tc:nc});if(q)break;}
   else if(q){if(q.color!==piece.color&&q.type!=='rei')ans.push({fr:r,fc:c,tr:nr,tc:nc});break;}
   if(!isSlide(rule.cap))break;
   nr+=dr;nc+=dc;
  }
 }
 if(!attacksOnly&&piece.type==='peao'&&rule.move==='forward'&&rule.cap==='pawnDiag'&&p.ep){
  const d=piece.color==='w'?-1:1;
  if(p.ep.r===r+d&&Math.abs(p.ep.c-c)===1){const victim=b[r][p.ep.c];
   if(victim&&victim.type==='peao'&&victim.color!==piece.color)ans.push({fr:r,fc:c,tr:p.ep.r,tc:p.ep.c,enPassant:true});}
 }
 return ans;
}
function attacked(p,r,c,by,rules){for(let i=0;i<8;i++)for(let j=0;j<8;j++){const q=p.board[i][j];if(q&&q.color===by&&raw(p,i,j,rules,true).some(m=>m.tr===r&&m.tc===c))return true;}return false;}
function isCheck(p,color,rules){const k=kingAt(p,color);return !k||attacked(p,k.r,k.c,opposite(color),rules);}
function canCastle(p,color,side,rules){if(rules.rei.move!=='all1'||rules.rei.cap!=='all1'||rules.torre.move!=='orthSlide'||rules.torre.cap!=='orthSlide')return false;
 if(!p.rights[color][side])return false;
 const r=color==='w'?7:0,rookC=side==='K'?7:0,king=p.board[r][4],rook=p.board[r][rookC];
 if(!king||king.color!==color||king.type!=='rei'||!rook||rook.color!==color||rook.type!=='torre')return false;
 if(isCheck(p,color,rules))return false;
 const gap=side==='K'?[5,6]:[1,2,3];if(gap.some(c=>p.board[r][c]))return false;
 const passage=side==='K'?[5,6]:[3,2];if(passage.some(c=>attacked(p,r,c,opposite(color),rules)))return false;
 return true;
}
function pseudoMoves(p,r,c,rules){const piece=p.board[r][c];if(!piece)return [];
 const list=raw(p,r,c,rules,false);
 if(piece.type==='rei'&&c===4&&r===(piece.color==='w'?7:0)){
  for(const side of ['K','Q'])if(canCastle(p,piece.color,side,rules))list.push({fr:r,fc:c,tr:r,tc:side==='K'?6:2,castle:side});
 }
 const result=[];
 for(const m of list){if(piece.type==='peao'&&(m.tr===0||m.tr===7)){
   for(const promote of ['dama','torre','bispo','cavalo'])result.push({...m,promote});
  }else result.push(m);}
 return result;
}
function apply(p,m,track=false){const q={board:p.board.map(row=>row.map(v=>v?{...v}:null)),turn:opposite(p.turn),rights:clone(p.rights),ep:null,halfmove:p.halfmove+1,fullmove:p.fullmove+(p.turn==='b'?1:0),history:track?p.history.slice():p.history,repetitions:track?{...p.repetitions}:p.repetitions,last:{...m}};
 const piece=q.board[m.fr][m.fc];if(!piece)throw new Error('Movimento de casa vazia');
 let captured=q.board[m.tr][m.tc];if(m.enPassant){captured=q.board[m.fr][m.tc];q.board[m.fr][m.tc]=null;}
 if(m.castle){const rookFrom=m.castle==='K'?7:0,rookTo=m.castle==='K'?5:3;q.board[m.fr][rookTo]=q.board[m.fr][rookFrom];q.board[m.fr][rookFrom]=null;}
 q.board[m.tr][m.tc]=piece;q.board[m.fr][m.fc]=null;
 if(m.promote)piece.type=m.promote;
 if(piece.type==='rei')q.rights[p.turn]={K:false,Q:false};
 // Promotion changes the piece type, but this case never involves an original rook.
 if(m.fr===(p.turn==='w'?7:0)&&m.fc===0&&p.board[m.fr][m.fc].type==='torre')q.rights[p.turn].Q=false;
 if(m.fr===(p.turn==='w'?7:0)&&m.fc===7&&p.board[m.fr][m.fc].type==='torre')q.rights[p.turn].K=false;
 if(captured&&captured.type==='torre'){
  const enemy=opposite(p.turn),enemyRow=enemy==='w'?7:0;
  if(m.tr===enemyRow&&m.tc===0)q.rights[enemy].Q=false;
  if(m.tr===enemyRow&&m.tc===7)q.rights[enemy].K=false;
 }
 if(p.board[m.fr][m.fc].type==='peao'&&Math.abs(m.tr-m.fr)===2&&m.fc===m.tc)q.ep={r:(m.fr+m.tr)/2,c:m.fc};
 if(p.board[m.fr][m.fc].type==='peao'||captured)q.halfmove=0;
 if(track){q.history.push(moveLabel(p,m,captured));const key=positionKey(q);q.repetitions[key]=(q.repetitions[key]||0)+1;}
 return q;
}
function legalAt(p,r,c,rules){const piece=p.board[r][c];if(!piece)return [];
 return pseudoMoves(p,r,c,rules).filter(m=>!isCheck(apply(p,m,false),piece.color,rules));}
function legalAll(p,color,rules){const all=[];for(let r=0;r<8;r++)for(let c=0;c<8;c++){const q=p.board[r][c];if(q&&q.color===color)all.push(...legalAt(p,r,c,rules));}return all;}
function insufficient(p,rules){if(!isClassic(rules))return false;
 let others=[];for(let r=0;r<8;r++)for(let c=0;c<8;c++){const piece=p.board[r][c];if(piece&&piece.type!=='rei')others.push({type:piece.type,color:piece.color,shade:(r+c)%2});}
 if(!others.length)return true;
 if(others.length===1&&['bispo','cavalo'].includes(others[0].type))return true;
 if(others.length===2&&others.every(x=>x.type==='bispo')&&others[0].color!==others[1].color&&others[0].shade===others[1].shade)return true;
 return false;
}
function result(p,rules){const moves=legalAll(p,p.turn,rules);
 if(!moves.length){const winner=isCheck(p,p.turn,rules)?opposite(p.turn):null;return {over:true,winner,reason:winner?'mate':'afogamento',check:!!winner};}
 if(insufficient(p,rules))return {over:true,winner:null,reason:'material insuficiente',check:false};
 if((p.repetitions[positionKey(p)]||0)>=3)return {over:true,winner:null,reason:'repetição tripla',check:false};
 if(p.halfmove>=100)return {over:true,winner:null,reason:'50 lances sem captura ou peão',check:false};
 return {over:false,winner:null,reason:'',check:isCheck(p,p.turn,rules)};
}
function moveLabel(p,m,captured){const piece=p.board[m.fr][m.fc];if(m.castle)return (piece.color==='w'?'Brancas':'Pretas')+': '+(m.castle==='K'?'O-O':'O-O-O');
 return (piece.color==='w'?'Brancas':'Pretas')+': '+LETTERS[piece.type]+square(m.fr,m.fc)+(captured?'×':'–')+square(m.tr,m.tc)+(m.promote?'='+LETTERS[m.promote]:'')+(m.enPassant?' e.p.':'');}
function evalPos(p,rules){let score=0;
 for(let r=0;r<8;r++)for(let c=0;c<8;c++){const x=p.board[r][c];if(!x)continue;
  const power=(PATTERNS[rules[x.type].move].cost+PATTERNS[rules[x.type].cap].cost);
  let value=MATERIAL[x.type]*(x.type==='rei'?1:(0.78+power/45));
  if(x.type!=='rei')value+=(3.5-Math.abs(3.5-r)+3.5-Math.abs(3.5-c))*3;
  if(x.type==='peao')value+= (x.color==='b'?r:7-r)*7;
  score+=(x.color==='b'?value:-value);
 }
 return score;
}
function orderMoves(p,list){return list.slice().sort((a,b)=>{function worth(m){const target=p.board[m.tr][m.tc];return (target?MATERIAL[target.type]:0)+(m.enPassant?100:0)+(m.promote?MATERIAL[m.promote]:0)+(m.castle?45:0);}return worth(b)-worth(a);});}
function minimax(p,rules,depth,alpha,beta){const moves=legalAll(p,p.turn,rules);
 if(!moves.length)return isCheck(p,p.turn,rules)?(p.turn==='b'?-100000-depth:100000+depth):0;
 if(depth===0)return evalPos(p,rules);
 let best=p.turn==='b'?-Infinity:Infinity;
 for(const m of orderMoves(p,moves)){const value=minimax(apply(p,m),rules,depth-1,alpha,beta);
  if(p.turn==='b'){best=Math.max(best,value);alpha=Math.max(alpha,best);}else{best=Math.min(best,value);beta=Math.min(beta,best);}
  if(beta<=alpha)break;
 }
 return best;
}
function chooseBot(p,rules,difficulty){const moves=legalAll(p,'b',rules);if(!moves.length)return null;
 if(difficulty===1)return moves[Math.floor(Math.random()*moves.length)];
 const candidates=orderMoves(p,moves);let best=null,bestScore=-Infinity;
 for(const m of candidates){const next=apply(p,m),reply=legalAll(next,'w',rules);
  let val;
  if(!reply.length)val=isCheck(next,'w',rules)?100000:0;
  else if(difficulty===2){val=evalPos(next,rules); // cálculo de ameaça adversária
   let worst=Infinity;for(const rm of orderMoves(next,reply).slice(0,14)){const v=evalPos(apply(next,rm),rules);worst=Math.min(worst,v);}val=0.55*val+0.45*worst;
  }else val=minimax(next,rules,1,-Infinity,Infinity);
  val+=Math.random()*(difficulty===2?12:1.5);
  if(val>bestScore){bestScore=val;best=m;}
 }
 return best;
}
root.XadrezEngine={TYPES,LABELS,PATTERNS,CLASSIC,COUNT,PIECE_CAP,CHAOS_CAP,MATERIAL,clone,preset,limits,totalCost,validate,vector,newPosition,positionKey,square,opposite,isClassic,raw,attacked,isCheck,kingAt,canCastle,pseudoMoves,legalAt,legalAll,apply,result,chooseBot,evalPos};
if(typeof module!=='undefined'&&module.exports)module.exports=root.XadrezEngine;
})(typeof window!=='undefined'?window:globalThis);
