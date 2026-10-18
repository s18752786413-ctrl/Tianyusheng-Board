// 兼容电视HTTP入口：仍使用浏览器随机源生成档案标识。
if(typeof crypto!=='undefined'&&!crypto.randomUUID&&crypto.getRandomValues)crypto.randomUUID=()=>{const b=crypto.getRandomValues(new Uint8Array(16));b[6]=(b[6]&15)|64;b[8]=(b[8]&63)|128;const h=Array.from(b,x=>x.toString(16).padStart(2,'0')).join('');return h.slice(0,8)+'-'+h.slice(8,12)+'-'+h.slice(12,16)+'-'+h.slice(16,20)+'-'+h.slice(20);};
import {readBoardCache,writeBoardCache,needsBoardUpdate,CHECK_MS,FALLBACK_MS} from './cache.js';
import React,{useState,useEffect,useCallback,useRef,lazy,Suspense} from 'react';
import {createRoot} from 'react-dom/client';
import {publicBoard,boardVersion} from './cloud.js';
import Board from './Board.jsx';
const Admin=lazy(()=>import('./Admin.jsx'));
import {snapshot,todayShanghai} from './core.js';
import './style.css';

function App(){
 const [admin,setAdmin]=useState((location.hash.startsWith('#admin')||new URLSearchParams(location.search).get('reset')==='1')),[data,setData]=useState(()=>readBoardCache()?.data||null),[status,setStatus]=useState('正在连接看板…'),[sample,setSample]=useState(false),[localPreview,setLocalPreview]=useState(null);
 const cache=useRef(readBoardCache()),inFlight=useRef(false),versionAvailable=useRef(true),lastFull=useRef(cache.current?.savedAt||0),retryAfter=useRef(0);
 const refresh=useCallback(async(force=false)=>{if(inFlight.current||(!force&&Date.now()<retryAfter.current))return;inFlight.current=true;try{if(!force&&cache.current?.data){if(versionAvailable.current){try{const meta=await boardVersion();if(!needsBoardUpdate(cache.current,meta,todayShanghai())){setStatus('本机缓存展示 · 已检查，无更新');return;}}catch(e){if(e.code==='PGRST202')versionAvailable.current=false;else throw e;}}if(!versionAvailable.current&&Date.now()-lastFull.current<FALLBACK_MS&&cache.current.data.today===todayShanghai()){setStatus('本机缓存展示 · 每30分钟检查更新');return;}}
 const d=await publicBoard();cache.current={data:d,savedAt:Date.now()};lastFull.current=Date.now();writeBoardCache(d);setData(d);setSample(false);setStatus('更新已缓存 · 轮播不重复下载图片');retryAfter.current=0;
 }catch(e){retryAfter.current=Date.now()+FALLBACK_MS;if(cache.current?.data){setStatus('云端暂不可用 · 使用上次本机缓存（截至'+cache.current.data.asOf+'）');setSample(false);}else{setStatus('云端暂不可用 · 尚无本机缓存，当前为样本');setSample(true);try{const r=await fetch('./sample-preview.json');if(r.ok)setData(await r.json());}catch{}}}finally{inFlight.current=false;}},[]);
 useEffect(()=>{if(!admin)refresh();const t=setInterval(()=>{if(!admin&&document.visibilityState!=='hidden')refresh();},CHECK_MS);const nav=()=>setAdmin(location.hash.startsWith('#admin'));window.addEventListener('hashchange',nav);return()=>{clearInterval(t);window.removeEventListener('hashchange',nav);};},[refresh,admin]);
 const nav=v=>{location.hash=v?'admin':'';setAdmin(v);};
 return admin?<Suspense fallback={<div className="empty-display">正在打开管理台…</div>}><Admin onBack={()=>{nav(false);if(!localPreview)refresh();}} onSaved={d=>{if(d?.preview)setLocalPreview(snapshot(d.preview));else{setLocalPreview(null);refresh(true);}}}/></Suspense>:<Board data={localPreview||data} status={localPreview?'本机编辑预览 · 未写入云端':status} sample={!!localPreview||sample} onAdmin={()=>nav(true)}/>;
}
createRoot(document.getElementById('root')).render(<App/>);
