/* UI compacta e preferências locais — Xadrez MCE1809 1.7.2 */
(()=>{
'use strict';
const KEY='mce1809-ui-settings-v172';
const $=id=>document.getElementById(id);
const dict={
  pt:{game:'♟ Partida e regras',progress:'★ Perfil e evolução',audio:'♫ Áudio',offline:'⌁ Jogar offline',settings:'⚙ Configurações',creator:'✦ Modo Criador e poderes',history:'▤ Histórico e partidas',appearance:'Aparência do jogo — Full 1.7.2',restart:'↻ Nova partida',undo:'↶ Desfazer',flip:'⇅ Virar tabuleiro',save:'Salvar configurações',done:'Preferências salvas neste navegador.',offlineHint:'Sem conta. Seus dados ficam neste aparelho.'},
  en:{game:'♟ Game and rules',progress:'★ Player progress',audio:'♫ Sound',offline:'⌁ Offline play',settings:'⚙ Settings',creator:'✦ Creator mode and powers',history:'▤ Moves and saved games',appearance:'Game appearance — Full 1.7.2',restart:'↻ New game',undo:'↶ Undo',flip:'⇅ Flip board',save:'Save settings',done:'Preferences saved on this device.',offlineHint:'No account. Your data stays on this device.'}
};
function read(){try{return JSON.parse(localStorage.getItem(KEY)||'{}')}catch(_){return {}}}
function save(v){try{localStorage.setItem(KEY,JSON.stringify(v))}catch(_) {}}
function apply(v){
 document.body.dataset.ui=v.theme==='light'?'light':'dark';
 document.documentElement.lang=v.language==='en'?'en':'pt-BR';
 $('uiTheme').value=v.theme==='light'?'light':'dark';
 $('uiLanguage').value=v.language==='en'?'en':'pt';
 $('localNickname').value=v.nickname||'';
 const d=dict[v.language==='en'?'en':'pt'];
 const labels=[['.game-options > summary','game'],['.progress-options > summary','progress'],['.audio-options > summary','audio'],['.offline-options > summary','offline'],['.settings-options > summary','settings'],['.creator-options > summary','creator'],['.history-options > summary','history'],['.appearance-nav > summary','appearance'],['#restart','restart'],['#undo','undo'],['#flip','flip'],['#savePreferences','save']];
 labels.forEach(([selector,k])=>{const el=document.querySelector(selector);if(el)el.textContent=d[k]});
}
function init(){
 const cfg=read();apply(cfg);
 $('uiTheme').addEventListener('change',()=>{const data={...read(),theme:$('uiTheme').value};save(data);apply(data)});
 $('uiLanguage').addEventListener('change',()=>{const data={...read(),language:$('uiLanguage').value};save(data);apply(data)});
 $('savePreferences').addEventListener('click',()=>{const data={language:$('uiLanguage').value,theme:$('uiTheme').value,nickname:$('localNickname').value.trim()};save(data);apply(data);$('settingsStatus').textContent=dict[data.language==='en'?'en':'pt'].done;});
 // Mantenha o menu de partida aberto para novos usuários: configurações secundárias ficam recolhidas.
 const d=document.querySelector('.game-options');if(d)d.open=true;
 const remote=$('remotePanel'),training=$('trainingPanel'),opponent=$('opponent');
 if(opponent){opponent.addEventListener('change',()=>{if(opponent.value==='remote')remote.open=true;});}
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
