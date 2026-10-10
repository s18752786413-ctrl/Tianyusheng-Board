import React,{useState,useEffect,useCallback,useRef,lazy,Suspense} from 'react';
import {createRoot} from 'react-dom/client';
import {publicBoard} from './cloud.js';
import Board from './Board.jsx';
const Admin=lazy(()=>import('./Admin.jsx'));
import {snapshot} from './core.js';
import './style.css';

function App(){
 const [admin,setAdmin]=useState((location.hash.startsWith('#admin')||new URLSearchParams(location.search).get('reset')==='1')),[data,setData]=useState(null),[status,setStatus]=useState('正在连接看板…'),[sample,setSample]=useState(false),[localPreview,setLocalPreview]=useState(null);
 const hasCloud=useRef(false);
 const refresh=useCallback(async()=>{try{const d=await publicBoard();hasCloud.current=true;setData(d);setSample(false);setStatus('云端已同步');}catch(e){if(hasCloud.current){setStatus('同步暂不可用 · 保留上次云端数据');return;}setStatus('云端尚未初始化 · 当前为样本预览');setSample(true);setData(d=>d);const r=await fetch('./sample-preview.json');if(r.ok)setData(await r.json());}},[]);
 useEffect(()=>{refresh();const t=setInterval(refresh,5000);const nav=()=>setAdmin(location.hash.startsWith('#admin'));window.addEventListener('hashchange',nav);return()=>{clearInterval(t);window.removeEventListener('hashchange',nav);};},[refresh]);
 const nav=v=>{location.hash=v?'admin':'';setAdmin(v);};
 return admin?<Suspense fallback={<div className="empty-display">正在打开管理台…</div>}><Admin onBack={()=>{nav(false);if(!localPreview)refresh();}} onSaved={d=>{if(d?.preview)setLocalPreview(snapshot(d.preview));else{setLocalPreview(null);refresh();}}}/></Suspense>:<Board data={localPreview||data} status={localPreview?'本机编辑预览 · 未写入云端':status} sample={!!localPreview||sample} onAdmin={()=>nav(true)}/>;
}
createRoot(document.getElementById('root')).render(<App/>);
