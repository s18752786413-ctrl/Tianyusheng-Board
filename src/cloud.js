import {optimizeImage} from './cache.js';
const listeners=new Set();
async function request(path,options={}){const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),30000);try{const r=await fetch('/api/'+path,{credentials:'same-origin',...options,signal:controller.signal});const data=await r.json();if(!r.ok){const e=new Error(data.error||'服务器请求失败');e.code=data.code;throw e;}return data;}catch(e){if(e.name==='AbortError')throw Error('服务器请求超时，请重新读取后台确认保存结果');throw e;}finally{clearTimeout(timer);}}
const notify=s=>listeners.forEach(fn=>fn(s?'SIGNED_IN':'SIGNED_OUT',s));
export const supabase={auth:{getSession:async()=>{try{return {data:{session:(await request('session')).session}};}catch{return {data:{session:null}};}},onAuthStateChange:fn=>{listeners.add(fn);return {data:{subscription:{unsubscribe:()=>listeners.delete(fn)}}};},signInWithPassword:async({email,password})=>{try{const data=await request('login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({account:email,password})});notify(data.session);return {data,error:null};}catch(error){return {data:{session:null},error};}},signOut:async()=>{await request('logout',{method:'POST'});notify(null);}}};
export const boardVersion=()=>request('version');
export const publicBoard=()=>request('board');
export const loadPrivate=()=>request('state');
export const savePrivate=(state,revision)=>request('state',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({state,revision})});
export const migrateImages=()=>request('migrate-images',{method:'POST'});
export async function uploadImage(file,field){file=await optimizeImage(file,field);const data=await request('images',{method:'POST',headers:{'Content-Type':file.type},body:file});return data.url;}
