// Phase 0 alignment checks (health split, CORS, upload folders + signed GET, category imageUrl, refresh grace).
// Requires a running server and seed data: npm run seed && npm start, then npm run test:phase0
import 'dotenv/config';
import jwtLib from 'jsonwebtoken';
const B=`http://localhost:${process.env.PORT||3001}`;
const j=async(m,p,t,b,h={})=>{const r=await fetch(B+p,{method:m,headers:{'content-type':'application/json',...(t?{authorization:'Bearer '+t}:{}),...h},body:b?JSON.stringify(b):undefined});let d;try{d=await r.json()}catch{};return {s:r.status,d,hdr:r.headers}};
const ok=(c,m,x='')=>console.log((c?'PASS':'FAIL')+'  '+m+(c?'':'  -> '+x));
const tok=async e=>(await j('POST','/api/auth/signin',null,{email:e,password:'Password123!'})).d.token;
const alice=await tok('alice.student@gloxad.com'), admin=await tok('admin@gloxad.com'), bob=await tok('bob.student@gloxad.com');

// health
let r=await j('GET','/api/health/liveness'); ok(r.s===200,'liveness 200');
r=await j('GET','/api/health/readiness'); ok(r.s===200&&r.d.checks.mongodb==='ok','readiness 200 w/ mongodb ok', JSON.stringify(r.d));
r=await j('GET','/api/health'); ok(r.s===200,'legacy /api/health still 200');

// CORS
for (const o of ['https://www.gloxadacademy.com','https://gloxadacademy.com','http://localhost:3000']){
  const x=await fetch(B+'/api/health',{headers:{origin:o}}); ok(x.headers.get('access-control-allow-origin')===o,'CORS allows '+o);}
const evil=await fetch(B+'/api/health',{headers:{origin:'https://evil.example'}}); ok(!evil.headers.get('access-control-allow-origin'),'CORS rejects unknown origin');

// presign folders
for (const f of ['logos','signatures','categories','avatars']){ r=await j('POST','/api/upload/presigned-url',alice,{filename:'a.png',fileType:'image/png',folder:f}); ok(r.s===200&&r.d.key.startsWith(f+'/')&&r.d.fileUrl,'presign public folder '+f); }
const priv={};
for (const f of ['documents','submissions','certificates','certifications']){ r=await j('POST','/api/upload/presigned-url',alice,{filename:'a.pdf',fileType:'application/pdf',folder:f}); priv[f]=r.d.key; ok(r.s===200&&r.d.key.startsWith(f+'/')&&r.d.fileUrl===null,'presign private folder '+f+' -> key only, no public URL', JSON.stringify(r.d)); }
// signed-url access control
r=await j('GET','/api/upload/signed-url?key='+encodeURIComponent(priv.documents),alice); ok(r.s===200&&r.d.url,'owner gets signed url');
r=await j('GET','/api/upload/signed-url?key='+encodeURIComponent(priv.documents),admin); ok(r.s===200,'admin gets signed url');
r=await j('GET','/api/upload/signed-url?key='+encodeURIComponent(priv.documents),bob); ok(r.s===403,'other user gets 403');
r=await j('GET','/api/upload/signed-url?key='+encodeURIComponent(priv.documents)); ok(r.s===401,'no auth 401');
r=await j('GET','/api/upload/signed-url?key=avatars/x/y.png',alice); ok(r.s===400,'public-folder key rejected 400');
r=await j('GET','/api/upload/signed-url?key=documents/../../etc/passwd',alice); ok(r.s===400,'path traversal rejected');
r=await j('GET','/api/upload/signed-url',alice); ok(r.s===400,'missing key 400');

// category imageUrl
r=await j('POST','/api/admin/categories',admin,{name:'ImgCat'+Date.now(),imageUrl:'https://cdn.example.com/c.png'}); ok(r.s===201&&r.d.category.imageUrl==='https://cdn.example.com/c.png','create category persists imageUrl',JSON.stringify(r.d)); const cid=r.d.category?._id;
r=await j('PUT','/api/admin/categories/'+cid,admin,{imageUrl:'https://cdn.example.com/d.png'}); ok(r.s===200&&r.d.category.imageUrl==='https://cdn.example.com/d.png','update changes imageUrl');
r=await j('PUT','/api/admin/categories/'+cid,admin,{name:'Renamed'+Date.now()}); ok(r.s===200&&r.d.category.imageUrl==='https://cdn.example.com/d.png','update w/o imageUrl keeps it');
r=await j('PUT','/api/admin/categories/'+cid,admin,{imageUrl:'javascript:alert(1)'}); ok(r.s===400&&r.d.fields?.imageUrl,'invalid imageUrl rejected 400 + fields');
r=await j('PUT','/api/admin/categories/'+cid,admin,{imageUrl:''}); ok(r.s===200&&r.d.category.imageUrl==='','empty imageUrl clears');
r=await j('GET','/api/categories'); ok(r.d.categories.every(c=>'imageUrl' in c),'public list exposes imageUrl');
await j('DELETE','/api/admin/categories/'+cid,admin);

// refresh grace
const jwt=jwtLib;
const dec=jwt.decode(alice); const secret=process.env.JWT_SECRET||'gloxad_academy_super_secret_jwt_key_2026_xyz123!';
const mk=(ago)=>jwt.sign({sub:dec.sub,role:dec.role,tokenVersion:dec.tokenVersion,iat:Math.floor(Date.now()/1000)-ago-60,exp:Math.floor(Date.now()/1000)-ago},secret);
r=await j('POST','/api/auth/refresh',mk(120)); ok(r.s===200&&r.d.token&&r.d.user,'token expired 2 min ago refreshes -> {token,user}',JSON.stringify(r.d));
r=await j('POST','/api/auth/refresh',mk(600)); ok(r.s===401,'token expired 10 min ago rejected');
r=await j('POST','/api/auth/refresh',jwt.sign({sub:dec.sub,tokenVersion:dec.tokenVersion},'wrong-secret')); ok(r.s===401,'bad signature rejected');
r=await j('GET','/api/auth/me',mk(120)); ok(r.s===401,'expired token still rejected on normal routes');
r=await j('POST','/api/auth/refresh',alice); ok(r.s===200,'valid token refreshes');

// validation error shape
r=await j('POST','/api/admin/categories',admin,{name:'x',subCategories:[{topics:['a']}]}); console.log('INFO  validation shape sample:',r.s,JSON.stringify(r.d));
