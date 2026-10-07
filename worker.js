// ZYRA - link shortener with creator earnings. Cloudflare Worker + KV (binding name: DB)
// Env: ADMIN_PASS (secret), AD_HEAD, AD_VIDEO, AD_BANNER (optional ad network HTML snippets)
const enc=new TextEncoder(),hex=b=>[...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,'0')).join('');
const J=(o,s=200,h={})=>new Response(JSON.stringify(o),{status:s,headers:{'content-type':'application/json',...h}});
const H=(b,s=200)=>new Response(b,{status:s,headers:{'content-type':'text/html;charset=utf-8'}});
const sha=async s=>hex(await crypto.subtle.digest('SHA-256',enc.encode(s)));
const pbk=async(p,salt)=>{const k=await crypto.subtle.importKey('raw',enc.encode(p),'PBKDF2',false,['deriveBits']);return hex(await crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',salt:enc.encode(salt),iterations:100000},k,256))};
const rid=n=>{const c='abcdefghjkmnpqrstuvwxyz23456789';let s='';const r=crypto.getRandomValues(new Uint8Array(n));for(const x of r)s+=c[x%c.length];return s};
const get=async(e,k)=>JSON.parse(await e.DB.get(k)||'null'),put=(e,k,v,o)=>e.DB.put(k,JSON.stringify(v),o);
const cfg=async e=>({cpm:3,share:70,min:5,wait:6,...(await get(e,'cfg'))});
const BOT=/bot|crawl|spider|curl|wget|python|headless|scrapy|preview|facebookexternalhit|slurp/i;
const RES=['api','admin','dash','login','assets','favicon.ico'];
async function user(e,req){const m=(req.headers.get('cookie')||'').match(/s=([a-z0-9]+)/);if(!m)return null;const n=await e.DB.get('sess:'+m[1]);return n?{n,...await get(e,'user:'+n)}:null}

export default{async fetch(req,e){
 const u=new URL(req.url),p=u.pathname,POST=req.method==='POST';
 try{
 if(p==='/')return H(HOME);
 if(p==='/admin')return H(ADMIN);
 if(p.startsWith('/api/')){
  const b=POST?await req.json().catch(()=>({})):{};
  if(p==='/api/signup'){const n=String(b.n||'').toLowerCase();if(!/^[a-z0-9_]{3,20}$/.test(n)||String(b.p||'').length<6)return J({e:'Username 3-20 letters/numbers, password min 6.'},400);
   if(await e.DB.get('user:'+n))return J({e:'Username already taken.'},409);const salt=rid(12);
   await put(e,'user:'+n,{salt,h:await pbk(b.p,salt),bal:0,clicks:0,links:[],t:Date.now()});return login(e,n)}
  if(p==='/api/login'){const n=String(b.n||'').toLowerCase(),x=await get(e,'user:'+n);if(!x||x.h!==await pbk(String(b.p||''),x.salt))return J({e:'Wrong username or password.'},401);return login(e,n)}
  if(p==='/api/logout'){return J({ok:1},200,{'set-cookie':'s=;Max-Age=0;Path=/'})}
  if(p==='/api/me'){const x=await user(e,req);if(!x)return J({e:'auth'},401);const c=await cfg(e);
   const links=(await Promise.all(x.links.map(k=>get(e,'link:'+k)))).map((l,i)=>l&&{k:x.links[i],u:l.u,c:l.c}).filter(Boolean);
   const days=[];for(let i=6;i>=0;i--){const d=new Date(Date.now()-i*864e5).toISOString().slice(0,10);days.push({d:d.slice(5),c:(x.days||{})[d]||0})}
   const ids=await get(e,'pays')||[],pays=(await Promise.all(ids.map(async i=>({id:i,...await get(e,'pay:'+i)})))).filter(q=>q.o===x.n).reverse();
   return J({n:x.n,bal:x.bal,clicks:x.clicks,days,pays,links:links.reverse(),cfg:{cpm:c.cpm,share:c.share,min:c.min}})}
  if(p==='/api/cfg'){const c=await cfg(e);return J({cpm:c.cpm,share:c.share,min:c.min})}
  if(p==='/api/del'&&POST){const x=await user(e,req);if(!x)return J({e:'auth'},401);const l=await get(e,'link:'+b.k);if(!l||l.o!==x.n)return J({e:'Not found'},404);await e.DB.delete('link:'+b.k);x.links=x.links.filter(q=>q!==b.k);const{n,...r}=x;await put(e,'user:'+n,r);return J({ok:1})}
  if(p==='/api/links'&&POST){const x=await user(e,req);if(!x)return J({e:'Please login first.'},401);
   let url=String(b.u||'').trim();if(!/^https?:\/\//i.test(url))url='https://'+url;try{new URL(url)}catch{return J({e:'Invalid link.'},400)}
   if(url.includes(u.host))return J({e:'Cannot shorten this site.'},400);if(x.links.length>=500)return J({e:'Link limit reached.'},400);
   let k=String(b.a||'').toLowerCase();if(k){if(!/^[a-z0-9_-]{3,24}$/.test(k)||RES.includes(k))return J({e:'Invalid alias.'},400)}else k=rid(6);
   if(await e.DB.get('link:'+k))return J({e:'Alias already taken.'},409);
   await put(e,'link:'+k,{u:url,o:x.n,c:0,t:Date.now()});x.links.push(k);const{n,...r}=x;await put(e,'user:'+n,r);return J({k,url:u.origin+'/'+k})}
  if(p==='/api/payout'&&POST){const x=await user(e,req),c=await cfg(e);if(!x)return J({e:'auth'},401);const to=String(b.to||'').trim().slice(0,80);
   if(!to)return J({e:'Enter payment ID.'},400);if(x.bal<c.min)return J({e:'Balance below minimum payout ($'+c.min+').'},400);
   const id=Date.now()+rid(4),pays=await get(e,'pays')||[];pays.push(id);await put(e,'pay:'+id,{o:x.n,amt:+x.bal.toFixed(4),to,s:'pending',t:Date.now()});await put(e,'pays',pays);
   const{n,...r}=x;r.bal=0;await put(e,'user:'+n,r);return J({ok:1})}
  if(p.startsWith('/api/start/')&&POST){const k=p.slice(11),l=await get(e,'link:'+k);if(!l)return J({e:'Link not found.'},404);
   const t=Date.now();return J({t:t+'.'+(await sha(t+k+e.ADMIN_PASS)).slice(0,20)})}
  if(p.startsWith('/api/go/')&&POST){const k=p.slice(8),l=await get(e,'link:'+k),c=await cfg(e);if(!l)return J({e:'Link not found.'},404);
   const[t,s]=String(b.t||'').split('.');if(s!==(await sha(t+k+e.ADMIN_PASS)).slice(0,20)||Date.now()-t<c.wait*2000-500||Date.now()-t>36e5)return J({e:'Invalid or too fast.'},400);
   const ip=req.headers.get('cf-connecting-ip')||'x',ua=req.headers.get('user-agent')||'',sk='seen:'+k+':'+(await sha(ip+ua)).slice(0,16);
   if(!BOT.test(ua)&&!await e.DB.get(sk)){await e.DB.put(sk,'1',{expirationTtl:86400});l.c++;await put(e,'link:'+k,l);
    const o=await get(e,'user:'+l.o);if(o){o.clicks++;o.bal+=c.cpm/1000*c.share/100;const dy=new Date().toISOString().slice(0,10);o.days=o.days||{};o.days[dy]=(o.days[dy]||0)+1;Object.keys(o.days).sort().slice(0,-30).forEach(k=>delete o.days[k]);await put(e,'user:'+l.o,o)}}
   return J({u:l.u})}
  if(p.startsWith('/api/admin')){if(req.headers.get('x-admin')!==e.ADMIN_PASS||!e.ADMIN_PASS)return J({e:'Wrong password.'},401);
   if(p==='/api/admin/cfg'){const c={cpm:+b.cpm||0,share:Math.min(100,+b.share||0),min:+b.min||0,wait:Math.min(30,Math.max(3,+b.wait||6))};await put(e,'cfg',c);return J(c)}
   if(p==='/api/admin/paid'){const x=await get(e,'pay:'+b.id);if(x){x.s='paid';await put(e,'pay:'+b.id,x)}return J({ok:1})}
   const ids=await get(e,'pays')||[];return J({cfg:await cfg(e),pays:(await Promise.all(ids.map(async i=>({id:i,...await get(e,'pay:'+i)})))).reverse()})}
  return J({e:'Not found'},404)}
 const k=p.slice(1);if(/^[a-z0-9_-]{3,24}$/.test(k)&&await e.DB.get('link:'+k)){const c=await cfg(e);
  return H(GATE.replace('%HEAD%',e.AD_HEAD||'').replace('%VIDEO%',e.AD_VIDEO||'Video ad').replace('%BANNER%',e.AD_BANNER||'Poster ad').replace('%WAIT%',c.wait).replace('%K%',k))}
 return H(HOME.replace('Shorten links.','404 - link not found.'),404)
 }catch(x){return J({e:'Server error'},500)}}};
async function login(e,n){const t=rid(32);await e.DB.put('sess:'+t,n,{expirationTtl:2592000});return J({ok:1},200,{'set-cookie':'s='+t+';Max-Age=2592000;Path=/;HttpOnly;Secure;SameSite=Lax'})}

const CSS=String.raw`<meta name=viewport content="width=device-width,initial-scale=1"><meta name=theme-color content="#07060f"><style>
:root{--bg:#06050d;--c:rgba(255,255,255,.055);--c2:rgba(255,255,255,.09);--bd:rgba(255,255,255,.12);--t:#f4f2ff;--m:#a9a6c7;--a:#8b5cf6;--b:#22d3ee;--g:linear-gradient(135deg,#8b5cf6,#22d3ee)}
*{box-sizing:border-box;margin:0;scrollbar-width:thin}html{scroll-behavior:smooth}body{background:var(--bg);color:var(--t);font-family:Inter,system-ui,-apple-system,"Segoe UI",sans-serif;overflow-x:hidden;-webkit-font-smoothing:antialiased}
#bg3{position:fixed;inset:0;width:100%;height:100%;z-index:-2;pointer-events:none}.glow{position:fixed;inset:0;z-index:-1;background:radial-gradient(55% 45% at 15% 5%,rgba(139,92,246,.28),transparent),radial-gradient(45% 40% at 90% 25%,rgba(34,211,238,.18),transparent)}
nav{position:sticky;top:0;z-index:20;display:flex;justify-content:space-between;align-items:center;padding:14px max(18px,calc((100% - 1080px)/2));backdrop-filter:blur(18px);background:rgba(6,5,13,.55);border-bottom:1px solid var(--bd)}
.logo{font-weight:800;font-size:22px;letter-spacing:1px;background:var(--g);-webkit-background-clip:text;background-clip:text;color:transparent}.nl{display:flex;gap:8px;align-items:center}
button{cursor:pointer;border:0;font-family:inherit;color:var(--t)}.gh{padding:9px 16px;border-radius:12px;background:var(--c);border:1px solid var(--bd);font-size:14px;transition:.2s}.gh:hover{background:var(--c2)}
.go{position:relative;overflow:hidden;padding:14px 26px;border-radius:14px;background:var(--g);color:#fff;font-weight:700;font-size:15px;box-shadow:0 10px 34px rgba(139,92,246,.45);transition:.25s}.go:hover:not(:disabled){transform:translateY(-3px);box-shadow:0 18px 44px rgba(139,92,246,.6)}.go:active{transform:scale(.97)}.go:disabled{opacity:.45}
.go:before{content:"";position:absolute;top:0;left:-80%;width:50%;height:100%;background:linear-gradient(100deg,transparent,rgba(255,255,255,.4),transparent);transform:skewX(-20deg);animation:sh 3.4s infinite}@keyframes sh{to{left:140%}}
.w{max-width:1080px;margin:auto;padding:0 18px}section{padding:56px 0}.hero{display:grid;grid-template-columns:1.1fr .9fr;gap:30px;align-items:center;min-height:82vh}
h1{font-size:clamp(34px,6.4vw,64px);line-height:1.05;font-weight:800;letter-spacing:-1.5px}h1 span,h2.t span{background:var(--g);-webkit-background-clip:text;background-clip:text;color:transparent}
.sub{color:var(--m);line-height:1.7;margin:16px 0 26px;font-size:17px;max-width:520px}.badge{display:inline-block;padding:7px 14px;border-radius:99px;border:1px solid var(--bd);background:var(--c);font-size:12.5px;color:var(--m);margin-bottom:18px}.badge b{color:var(--b)}
.st{perspective:1100px}.pn{transform-style:preserve-3d;transition:transform .25s ease-out;background:var(--c);border:1px solid var(--bd);border-radius:26px;padding:22px;backdrop-filter:blur(22px);box-shadow:0 40px 90px rgba(0,0,0,.45),inset 0 1px 0 rgba(255,255,255,.1);position:relative}
.pn:before{content:"";position:absolute;inset:-1px;border-radius:27px;padding:1px;background:linear-gradient(135deg,rgba(139,92,246,.8),transparent 40%,rgba(34,211,238,.7));-webkit-mask:linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0);-webkit-mask-composite:xor;mask-composite:exclude;pointer-events:none}
.r{display:flex;gap:10px;flex-wrap:wrap}input{flex:1 1 170px;padding:15px;border-radius:14px;border:1px solid var(--bd);background:rgba(0,0,0,.3);color:var(--t);font-size:16px;outline:0;min-width:0;transition:.25s}input:focus{border-color:var(--b);box-shadow:0 0 0 4px rgba(34,211,238,.16)}
.msg{font-size:13px;color:#ff7a90;margin-top:10px;min-height:16px}.ok{color:#4ade80}.gr{display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:16px}
.cd{padding:22px;border-radius:20px;background:var(--c);border:1px solid var(--bd);transition:transform .35s,border-color .35s,background .35s;transform-style:preserve-3d}.cd:hover{border-color:rgba(139,92,246,.7);background:var(--c2)}.cd .ic{width:46px;height:46px;border-radius:14px;background:var(--g);display:flex;align-items:center;justify-content:center;font-size:22px;margin-bottom:14px;box-shadow:0 8px 24px rgba(139,92,246,.4)}.cd h3{font-size:17px;margin-bottom:6px}.cd p{color:var(--m);font-size:14px;line-height:1.6}
.sc{text-align:center;margin-bottom:34px}h2.t{font-size:clamp(26px,4.6vw,40px);font-weight:800;letter-spacing:-.8px}.sc p{color:var(--m);margin-top:10px}
.rv{opacity:0;transform:translateY(34px) scale(.98);transition:all .8s cubic-bezier(.2,.8,.2,1)}.rv.on{opacity:1;transform:none}
input[type=range]{padding:0;height:6px;accent-color:#8b5cf6;flex:1 1 100%}.big{font-size:clamp(34px,7vw,56px);font-weight:800;background:var(--g);-webkit-background-clip:text;background-clip:text;color:transparent}
.fq{border:1px solid var(--bd);border-radius:16px;background:var(--c);margin-bottom:10px;overflow:hidden}.fq button{width:100%;text-align:left;padding:18px;font-size:15px;font-weight:600;background:none;display:flex;justify-content:space-between}.fq div{max-height:0;overflow:hidden;color:var(--m);line-height:1.7;font-size:14px;padding:0 18px;transition:.35s}.fq.on div{max-height:200px;padding:0 18px 18px}
.mo{position:fixed;inset:0;z-index:50;background:rgba(3,2,8,.7);backdrop-filter:blur(8px);display:none;align-items:center;justify-content:center;padding:18px}.mo.on{display:flex}.mo .pn{width:100%;max-width:420px;animation:pop .45s cubic-bezier(.2,.9,.3,1.2)}@keyframes pop{from{opacity:0;transform:scale(.85) rotateX(20deg)}}
.tb{display:flex;gap:6px;margin-bottom:14px;padding:5px;background:rgba(0,0,0,.25);border-radius:14px}.tb button{flex:1;padding:10px;border-radius:10px;background:none;font-size:14px}.tb .on{background:var(--a);color:#fff}
.dh{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:14px;margin:20px 0}.dh .cd b{display:block;font-size:26px;margin-top:4px}.dh .cd small{color:var(--m)}
.it{display:flex;gap:12px;align-items:center;padding:14px 16px;margin-bottom:10px;border-radius:16px;background:var(--c);border:1px solid var(--bd);animation:in .5s both}@keyframes in{from{opacity:0;transform:translateY(20px) rotateX(-15deg)}}.it div{flex:1;min-width:0}.it b{color:var(--b);font-size:14px;display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.it p{color:var(--m);font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.it span{font-size:12px;color:var(--m);text-align:center}.sm{padding:8px 12px;border-radius:10px;background:rgba(139,92,246,.22);border:1px solid var(--bd);font-size:13px}.sm:hover{background:var(--a)}.dl:hover{background:#e11d48}
.dt{display:flex;gap:8px;margin:20px 0 4px;flex-wrap:wrap}h4{color:var(--m);font-size:14px;font-weight:600;margin:22px 0 12px}.ad{display:flex;align-items:center;justify-content:center;margin:14px auto;border:1px dashed var(--bd);border-radius:16px;background:var(--c);color:var(--m);font-size:12px;overflow:hidden;min-height:120px;max-width:100%}.ad.v{aspect-ratio:16/9;width:560px}.ad.p{width:300px;min-height:250px}
.bar{height:8px;border-radius:9px;background:var(--bd);overflow:hidden;max-width:560px;margin:14px auto}.bar i{display:block;height:100%;width:0;background:var(--g);transition:width 1s linear}footer{text-align:center;color:var(--m);font-size:13px;padding:34px 0;border-top:1px solid var(--bd)}
@media(max-width:820px){.hero{grid-template-columns:1fr;min-height:auto;padding-top:26px}}@media(prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}}
</style><canvas id=bg3></canvas><div class=glow></div>
<script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"></script>
<script>addEventListener('load',()=>{if(!window.THREE)return;const c=document.getElementById('bg3'),R=new THREE.WebGLRenderer({canvas:c,alpha:true,antialias:true}),S=new THREE.Scene(),C=new THREE.PerspectiveCamera(60,1,.1,100);C.position.z=7;
const M=(x,y)=>new THREE.MeshBasicMaterial({color:x,wireframe:true,transparent:true,opacity:y}),A=new THREE.Mesh(new THREE.IcosahedronGeometry(2,1),M(0x8b5cf6,.55)),B=new THREE.Mesh(new THREE.TorusKnotGeometry(.8,.24,120,14),M(0x22d3ee,.5)),D=new THREE.Mesh(new THREE.OctahedronGeometry(.7),M(0xffffff,.35));
A.position.set(3,.4,-1);B.position.set(-4.5,-2,-3);D.position.set(5,-3,-2);S.add(A,B,D);const n=1200,p=new Float32Array(n);for(let i=0;i<n;i++)p[i]=(Math.random()-.5)*28;const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(p,3));const P=new THREE.Points(g,new THREE.PointsMaterial({size:.035,color:0xb8a9ff}));S.add(P);
let mx=0,my=0,sy=0;addEventListener('pointermove',e=>{mx=e.clientX/innerWidth-.5;my=e.clientY/innerHeight-.5});addEventListener('scroll',()=>sy=scrollY/innerHeight);
function rs(){R.setSize(innerWidth,innerHeight);R.setPixelRatio(Math.min(devicePixelRatio,2));C.aspect=innerWidth/innerHeight;C.updateProjectionMatrix()}rs();addEventListener('resize',rs);
(function f(t){t*=.001;A.rotation.set(t*.25,t*.35,0);B.rotation.set(t*.4,t*.2,0);D.rotation.set(t*.5,t*.6,0);P.rotation.y=t*.02;C.position.x+=(mx*1.6-C.position.x)*.04;C.position.y+=(-my*1.2-sy*1.5-C.position.y)*.04;C.lookAt(0,-sy*1.2,0);R.render(S,C);requestAnimationFrame(f)})(0)})</script>`;
const HOME=`<!doctype html><title>Zyra - Premium Link Shortener</title>${CSS}<nav><div class=logo>ZYRA</div><div class=nl id=nl></div></nav><div id=app></div><div class=mo id=mo><div class=pn><div class=tb><button id=t1 class=on>Login</button><button id=t2>Sign up</button></div><div class=r><input id=au placeholder=Username autocomplete=username><input id=ap type=password placeholder=Password autocomplete=current-password></div><div class=msg id=ae></div><button class=go id=ag style=width:100%;margin-top:6px>Login</button></div></div><script>const $=s=>document.querySelector(s),api=(p,b)=>fetch(p,{method:b?'POST':'GET',headers:{'content-type':'application/json'},body:b?JSON.stringify(b):undefined}).then(r=>r.json());
const h=(t,c,x)=>{const e=document.createElement(t);if(c)e.className=c;if(x!=null)e.textContent=x;return e};
const cp=(t,b)=>{(navigator.clipboard?navigator.clipboard.writeText(t):Promise.reject()).catch(()=>{}).finally(()=>{const o=b.textContent;b.textContent='Copied!';setTimeout(()=>b.textContent=o,1200)})};
function tilt(el,k){el.onpointermove=e=>{const r=el.getBoundingClientRect(),x=(e.clientX-r.left)/r.width-.5,y=(e.clientY-r.top)/r.height-.5;el.style.transform='rotateY('+x*k+'deg) rotateX('+-y*k+'deg) translateZ(0)'};el.onpointerleave=()=>el.style.transform=''}
const io=new IntersectionObserver(a=>a.forEach(x=>{if(x.isIntersecting){x.target.classList.add('on');io.unobserve(x.target)}}),{threshold:.12});
function rv(){document.querySelectorAll('.rv:not(.on)').forEach(e=>io.observe(e))}
let CF={cpm:3,share:70,min:5};
const FEAT=[['\u26a1','Instant short links','Create branded short links with custom aliases in one second.'],['\ud83d\udcb0','Earn from every view','Unique valid clicks credit your balance automatically.'],['\ud83d\udcca','Live analytics','7-day click chart, balance and per-link stats in your dashboard.'],['\ud83d\udee1\ufe0f','Anti-bot protection','Bot filter, timing checks and one click per device every 24h.'],['\ud83c\udfac','Video + poster ads','Two-step page with video and banner ad slots for higher CPM.'],['\ud83d\udcb8','Simple payouts','Request payout to UPI or PayPal once you reach the minimum.']];
const FAQ=[['How do I earn money?','Share your short links. Each unique, valid visitor sees ads, and you get your share of the ad revenue.'],['When can I withdraw?','As soon as your balance reaches the minimum payout. Request it from the Payouts tab and it is paid manually.'],['Are all clicks counted?','Only unique human clicks count. Bots, repeated clicks from one device within 24 hours and too-fast clicks are ignored.'],['Can I choose my own alias?','Yes. Add a custom alias when you create a link, if it is not taken.']];
function modal(mode){const m=$('#mo');m.classList.add('on');let md=mode;const b1=$('#t1'),b2=$('#t2'),go=$('#ag'),er=$('#ae');const sw=x=>{md=x;b1.className=x=='login'?'on':'';b2.className=x=='login'?'':'on';go.textContent=x=='login'?'Login':'Create account';er.textContent=''};sw(mode);b1.onclick=()=>sw('login');b2.onclick=()=>sw('signup');
 go.onclick=async()=>{go.disabled=true;const d=await api('/api/'+md,{n:$('#au').value,p:$('#ap').value});go.disabled=false;if(d.e)er.textContent=d.e;else{m.classList.remove('on');start()}};m.onclick=e=>{if(e.target==m)m.classList.remove('on')}}
function landing(){document.body.classList.remove('dash');$('#nl').replaceChildren();const l=h('button','gh','Login'),s=h('button','go','Get started');l.onclick=()=>modal('login');s.onclick=()=>modal('signup');$('#nl').append(l,s);
 $('#app').innerHTML='<div class=w><div class=hero><div><div class=badge>Creator-first <b>link monetization</b></div><h1>Turn every link into <span>income.</span></h1><p class=sub>The premium link shortener built for creators. Shorten, share and get paid for every unique view, with real-time analytics and fast payouts.</p><div class=r><input id=hu placeholder="Paste your long link..."><button class=go id=hb>Shorten &amp; earn</button></div></div><div class=st><div class=pn id=hp><div style="color:var(--m);font-size:13px">Estimated monthly earnings</div><div class=big id=hv>$0</div><input type=range id=rg min=100 max=100000 step=100 value=5000><div style="display:flex;justify-content:space-between;color:var(--m);font-size:13px;margin-top:8px"><span id=hd></span><span>views per day</span></div></div></div></div>'+
 '<section><div class="sc rv"><h2 class=t>Everything you need to <span>grow</span></h2><p>Built like a real product, not a toy.</p></div><div class=gr id=ft></div></section>'+
 '<section><div class="sc rv"><h2 class=t>How it <span>works</span></h2></div><div class=gr><div class="cd rv"><div class=ic>1</div><h3>Create account</h3><p>Sign up free in 10 seconds.</p></div><div class="cd rv"><div class=ic>2</div><h3>Shorten &amp; share</h3><p>Post your links anywhere.</p></div><div class="cd rv"><div class=ic>3</div><h3>Get paid</h3><p>Request payout when you reach the minimum.</p></div></div></section>'+
 '<section><div class="sc rv"><h2 class=t>Frequently asked <span>questions</span></h2></div><div style="max-width:720px;margin:auto" id=fq></div></section></div><footer>&copy; Zyra. All rights reserved.</footer>';
 const ft=$('#ft');FEAT.forEach(f=>{const c=h('div','cd rv');c.innerHTML='<div class=ic>'+f[0]+'</div>';c.append(h('h3','',f[1]),h('p','',f[2]));tilt(c,10);ft.append(c)});
 FAQ.forEach(f=>{const q=h('div','fq rv'),b=h('button','',f[0]);b.append(h('span','','+'));q.append(b,h('div','',f[1]));b.onclick=()=>q.classList.toggle('on');$('#fq').append(q)});
 const rg=$('#rg'),calc=()=>{const v=+rg.value;$('#hv').textContent='$'+(v*30/1000*CF.cpm*CF.share/100).toFixed(0);$('#hd').textContent=v.toLocaleString()};rg.oninput=calc;api('/api/cfg').then(c=>{CF=c;calc()});calc();tilt($('#hp'),8);
 $('#hb').onclick=()=>modal('signup');$('#hu').onkeydown=e=>{if(e.key=='Enter')modal('signup')};rv()}
function chart(d){const W=600,Hh=160,mx=Math.max(1,...d.map(x=>x.c)),pt=d.map((x,i)=>[i*W/(d.length-1),Hh-12-x.c/mx*(Hh-40)]),ln=pt.map((q,i)=>(i?'L':'M')+q[0].toFixed(1)+' '+q[1].toFixed(1)).join(' ');
 return '<svg viewBox="0 0 '+W+' '+(Hh+22)+'" style="width:100%"><defs><linearGradient id=ga x1=0 y1=0 x2=0 y2=1><stop offset=0 stop-color=#8b5cf6 stop-opacity=.55 /><stop offset=1 stop-color=#8b5cf6 stop-opacity=0 /></linearGradient></defs><path d="'+ln+' L'+W+' '+Hh+' L0 '+Hh+'Z" fill="url(#ga)"/><path d="'+ln+'" fill=none stroke=#22d3ee stroke-width=3 stroke-linecap=round />'+pt.map((q,i)=>'<circle cx='+q[0]+' cy='+q[1]+' r=4 fill=#22d3ee /><text x='+q[0]+' y='+(Hh+16)+' fill=#a9a6c7 font-size=12 text-anchor=middle>'+d[i].d+'</text>').join('')+'</svg>'}
async function dash(d){document.body.classList.add('dash');const nl=$('#nl');nl.replaceChildren();const u=h('span','gh','@'+d.n),lo=h('button','gh','Logout');lo.onclick=async()=>{await api('/api/logout',{});location.reload()};nl.append(u,lo);
 const A=$('#app');A.innerHTML='<div class=w style="padding-top:26px"><h1 style="font-size:34px">Dashboard</h1><div class=dh id=dh></div><div class=tb style="max-width:460px"><button class=on id=d1>Overview</button><button id=d2>Links</button><button id=d3>Payouts</button></div><div id=dv></div></div>';
 [[d.links.length,'Links'],[d.clicks,'Valid clicks'],['$'+d.bal.toFixed(3),'Balance'],[d.cfg.share+'%','Your share']].forEach(a=>{const c=h('div','cd');c.append(h('small','',a[1]),h('b','',a[0]));tilt(c,10);$('#dh').append(c)});
 const V=$('#dv'),tabs=[$('#d1'),$('#d2'),$('#d3')],show=i=>{tabs.forEach((t,j)=>t.className=i==j?'on':'');V.replaceChildren();[ov,ls,py][i]()};tabs.forEach((t,i)=>t.onclick=()=>show(i));
 function crt(){const p=h('div','pn'),r=h('div','r'),i=h('input'),al=h('input'),go=h('button','go','Shorten'),m=h('div','msg');i.placeholder='Paste long link...';al.placeholder='Custom alias (optional)';r.append(i,al,go);p.append(r,m);
  go.onclick=async()=>{m.className='msg';go.disabled=true;const x=await api('/api/links',{u:i.value,a:al.value});go.disabled=false;if(x.e){m.textContent=x.e;return}const f=await api('/api/me');dash(f)};return p}
 function ov(){const c=h('div','pn');c.style.marginBottom='18px';c.innerHTML='<div style="color:var(--m);font-size:13px;margin-bottom:6px">Valid clicks, last 7 days</div>'+chart(d.days);V.append(c,crt())}
 function ls(){V.append(crt());V.append(h('h4','','Your links'));if(!d.links.length)V.append(h('div','cd','No links yet. Create your first one above.'));
  d.links.forEach(l=>{const it=h('div','it'),dv=h('div'),url=location.origin+'/'+l.k,b=h('button','sm','Copy'),x=h('button','sm dl','Delete'),s=h('span');s.append(h('b','',l.c),'clicks');s.firstChild.style.cssText='display:block;color:var(--t);font-size:16px';dv.append(h('b','',url),h('p','',l.u));b.onclick=()=>cp(url,b);x.onclick=async()=>{if(confirm('Delete this link?')){await api('/api/del',{k:l.k});dash(await api('/api/me'))}};it.append(dv,s,b,x);V.append(it)})}
 function py(){const p=h('div','pn'),r=h('div','r'),to=h('input'),pb=h('button','go','Request payout'),m=h('div','msg');to.placeholder='UPI ID / PayPal email';r.append(to,pb);p.append(h('small','','Balance $'+d.bal.toFixed(3)+' | Minimum payout $'+d.cfg.min),h('br'),h('br'),r,m);
  pb.onclick=async()=>{const x=await api('/api/payout',{to:to.value});m.className=x.e?'msg':'msg ok';m.textContent=x.e||'Payout requested!';if(!x.e)setTimeout(async()=>dash(await api('/api/me')),900)};V.append(p,h('h4','','Payout history'));
  if(!d.pays.length)V.append(h('div','cd','No payouts yet.'));d.pays.forEach(x=>{const it=h('div','it'),dv=h('div');dv.append(h('b','','$'+x.amt),h('p','',x.to));it.append(dv,h('span','',x.s));V.append(it)})}
 show(0)}
async function start(){const d=await api('/api/me');d.e?landing():dash(d)}
start()</script>`;
const GATE=`<!doctype html><title>Please wait...</title>%HEAD%${CSS}<div class=w style=text-align:center;padding-top:60px><h1 style=font-size:clamp(28px,6vw,48px)>Your link is <span>almost ready</span></h1><p class=sub style=margin-left:auto;margin-right:auto id=i>Step 1 of 2</p><div class=ad>%VIDEO%</div><div class=bar><i id=f></i></div><div class=ad>%BANNER%</div><button class=go id=b disabled>Please wait...</button><div class=msg id=m></div></div><script>const K='%K%',W=%WAIT%;let tok,step=1;const b=document.getElementById('b'),f=document.getElementById('f'),m=document.getElementById('m');
function run(){let t=W;f.style.transition='none';f.style.width='0';b.disabled=true;setTimeout(()=>f.style.transition='width 1s linear',30);b.textContent='Wait '+t+'s';const v=setInterval(()=>{t--;f.style.width=(W-t)/W*100+'%';b.textContent='Wait '+t+'s';if(t<=0){clearInterval(v);b.disabled=false;b.textContent=step==1?'Continue':'Get Link'}},1000)}
fetch('/api/start/'+K,{method:'POST'}).then(r=>r.json()).then(d=>{if(d.e){m.textContent=d.e;return}tok=d.t;run()});
b.onclick=()=>{if(step==1){step=2;document.getElementById('i').textContent='Step 2 of 2 - almost done';run();return}b.disabled=true;fetch('/api/go/'+K,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({t:tok})}).then(r=>r.json()).then(d=>d.u?location.href=d.u:(m.textContent=d.e||'Error'))}</script>`;
const ADMIN=`<!doctype html><title>Zyra Admin</title>${CSS}<main><h1>Admin <span>Panel</span></h1><div id=a></div></main><script>
const pw=prompt('Admin password'),H={'content-type':'application/json','x-admin':pw},A=document.getElementById('a');
const post=(p,b)=>fetch(p,{method:'POST',headers:H,body:JSON.stringify(b)}).then(r=>r.json());
async function load(){const d=await fetch('/api/admin',{headers:H}).then(r=>r.json());if(d.e){A.textContent=d.e;return}A.replaceChildren();
 const pn=document.createElement('div');pn.className='pn';const F={};['cpm','share','min','wait'].forEach(k=>{const l=document.createElement('small');l.textContent=k+(k=='cpm'?' ($ per 1000)':k=='share'?' (% to creator)':k=='min'?' ($ min payout)':' (sec per step)');const i=document.createElement('input');i.type='number';i.step='any';i.value=d.cfg[k];i.style.width='100%';i.style.marginBottom='8px';F[k]=i;pn.append(l,i)});
 const s=document.createElement('button');s.className='go';s.textContent='Save';s.onclick=async()=>{await post('/api/admin/cfg',{cpm:F.cpm.value,share:F.share.value,min:F.min.value,wait:F.wait.value});s.textContent='Saved';setTimeout(()=>s.textContent='Save',1000)};pn.append(s);A.append(pn);
 const t=document.createElement('h2');t.textContent='Payout requests';A.append(t);d.pays.forEach(x=>{const it=document.createElement('div'),dv=document.createElement('div'),b=document.createElement('b'),p=document.createElement('p');it.className='it';b.textContent='$'+x.amt+' - '+x.o+' - '+x.s;p.textContent=x.to;dv.append(b,p);it.append(dv);
  if(x.s=='pending'){const c=document.createElement('button');c.className='sm';c.textContent='Mark paid';c.onclick=async()=>{await post('/api/admin/paid',{id:x.id});load()};it.append(c)}A.append(it)})}
load()</script>`;
