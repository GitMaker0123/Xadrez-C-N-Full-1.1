/* Xadrez Custom — WebRTC ponto a ponto, sem serviço de sinalização. Full 1.6.1 */
(function(root){'use strict';
class ChessPeer {
  constructor({onMessage,onOpen,onClose,onStatus}){
    this.onMessage=onMessage; this.onOpen=onOpen; this.onClose=onClose; this.onStatus=onStatus;
    this.pc=null; this.channel=null; this.role=null;
  }
  status(text){this.onStatus?.(text);}
  setup(role,network){
    this.close(false); this.role=role;
    if(typeof RTCPeerConnection==='undefined') throw Error('Este navegador não suporta WebRTC.');
    const config=network==='internet'?{iceServers:[{urls:'stun:stun.l.google.com:19302'},{urls:'stun:stun1.l.google.com:19302'}]}:{iceServers:[]};
    const pc=this.pc=new RTCPeerConnection(config);
    pc.onconnectionstatechange=()=>{
      if(this.pc!==pc)return;
      if(pc.connectionState==='connected')this.status('Conexão direta estabelecida. Pode jogar!');
      if(['failed','disconnected','closed'].includes(pc.connectionState)){
        this.status('Estado WebRTC: '+pc.connectionState+'. Se falhar, reconecte e troque novos códigos.');
        if(pc.connectionState==='failed'||pc.connectionState==='closed')this.onClose?.();
      }
    };
    pc.ondatachannel=e=>this.bindChannel(e.channel);
    if(role==='host')this.bindChannel(pc.createDataChannel('xadrez-mce1809',{ordered:true}));
  }
  bindChannel(ch){
    this.channel=ch;
    ch.onopen=()=>{this.status('Conectado! A partida foi iniciada.');this.onOpen?.(this.role);};
    ch.onclose=()=>{this.status('Canal encerrado.');this.onClose?.();};
    ch.onerror=()=>this.status('Ocorreu um erro de canal WebRTC.');
    ch.onmessage=e=>{
      try{const data=JSON.parse(e.data);if(data&&typeof data==='object')this.onMessage?.(data);}catch(_){this.status('Mensagem recebida inválida.');}
    };
  }
  async completeIce(){
    const pc=this.pc;
    if(!pc)throw Error('Conexão não preparada.');
    if(pc.iceGatheringState==='complete')return;
    await Promise.race([
      new Promise(resolve=>{const fn=()=>{if(pc.iceGatheringState==='complete'){pc.removeEventListener('icegatheringstatechange',fn);resolve();}};pc.addEventListener('icegatheringstatechange',fn);fn();}),
      new Promise(resolve=>setTimeout(resolve,18000))
    ]);
  }
  async host(network){
    this.setup('host',network);this.status('Preparando convite...');
    await this.pc.setLocalDescription(await this.pc.createOffer());
    await this.completeIce();this.status('Envie seu código de convite ao outro jogador.');
    return JSON.stringify({v:1,type:'offer',sdp:this.pc.localDescription.sdp});
  }
  async accept(code,network){
    let data;
    try{data=JSON.parse(code.trim());}catch(_){throw Error('Código inválido. Copie o texto completo.');}
    if(data?.v!==1||typeof data.sdp!=='string'||data.sdp.length>30000||!['offer','answer'].includes(data.type))throw Error('Código de conexão inválido.');
    if(data.type==='offer'){
      this.setup('guest',network);this.status('Criando resposta para o anfitrião...');
      await this.pc.setRemoteDescription({type:'offer',sdp:data.sdp});
      await this.pc.setLocalDescription(await this.pc.createAnswer());
      await this.completeIce();this.status('Envie sua resposta ao anfitrião.');
      return JSON.stringify({v:1,type:'answer',sdp:this.pc.localDescription.sdp});
    }
    if(!this.pc||this.role!=='host')throw Error('Primeiro crie uma sala neste aparelho.');
    await this.pc.setRemoteDescription({type:'answer',sdp:data.sdp});
    this.status('Resposta aceita. Tentando estabelecer a conexão...');
    return null;
  }
  send(data){if(this.channel?.readyState!=='open')return false;this.channel.send(JSON.stringify(data));return true;}
  get connected(){return this.channel?.readyState==='open';}
  close(emit=true){
    const ch=this.channel,pc=this.pc;
    this.channel=null;this.pc=null;this.role=null;
    if(ch){ch.onclose=null;try{ch.close();}catch(_){}}
    if(pc){pc.onconnectionstatechange=null;try{pc.close();}catch(_){}}
    if(emit)this.onClose?.();
  }
}
root.ChessPeer=ChessPeer;
})(window);
