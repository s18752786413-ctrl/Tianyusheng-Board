export const addDays=(d,n)=>new Date(Date.parse(d+'T00:00:00Z')+n*86400000).toISOString().slice(0,10);
export const monday=d=>addDays(d,-((new Date(d+'T00:00:00Z').getUTCDay()+6)%7));
export const todayShanghai=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
export const validDate=d=>/^\d{4}-\d{2}-\d{2}$/.test(d||'')&&!isNaN(Date.parse(d))&&new Date(d+'T00:00:00Z').toISOString().slice(0,10)===d;
export const formatNum=n=>new Intl.NumberFormat('zh-CN').format(n||0);
export const formatTime=s=>`${Math.floor((s||0)/3600)}小时${Math.floor((s||0)%3600/60)}分`;
export function tierFor(wave,tiers,ratio){const sorted=[...tiers].sort((a,b)=>a.total-b.total);const hit=sorted.filter(t=>t.total*ratio<=wave).at(-1);const next=sorted.find(t=>t.total*ratio>wave);return {tier:hit?.name||'未达青铜1',nextGap:next?next.total*ratio-wave:null};}
export function ranked(rows,key){let previous=null,rank=0;return [...rows].sort((a,b)=>(b[key]||0)-(a[key]||0)||a.name.localeCompare(b.name,'zh-CN')).map((r,i)=>{if(r[key]!==previous)rank=i+1;previous=r[key];return {...r,rank};});}
export function snapshot(state,today=todayShanghai()){
 const asOf=addDays(today,-1),month=today.slice(0,7),ws=monday(today),people=[],rewards=[];
 const sum=(id,start,end)=>state.records.filter(r=>r.profileId===id&&r.date>=start&&r.date<=end).reduce((s,r)=>s+(r.wave||0),0);
 const visible=state.profiles.filter(p=>p.show!==false);
 for(const p of visible){const rs=state.records.filter(r=>r.profileId===p.id&&r.date>=month+'-01'&&r.date<=asOf);const wave=rs.reduce((s,r)=>s+(r.wave||0),0);
 const item={id:p.id,name:p.name,avatar:p.avatar||'',portrait:p.portrait||'',photoPosition:p.photoPosition||50,photoScale:p.photoScale||1,month:wave,yesterday:sum(p.id,asOf,asOf),best:Math.max(0,...rs.map(r=>r.wave||0)),seconds:rs.reduce((s,r)=>s+(r.seconds||0),0),days:rs.map(r=>({date:r.date,wave:r.wave})),...tierFor(wave,state.tiers,state.ratio)};
 if(wave>0)people.push(item);
 if(!p.offline||p.left||wave<=0)continue;
 const push=(rule,start,end)=>{const current=sum(p.id,start,end<asOf?end:asOf);rewards.push({id:p.id+'-'+rule.id,name:p.name,avatar:p.avatar||'',label:rule.label,reward:rule.reward,current,target:rule.target,gap:Math.max(rule.target-current,0)});};
 for(const t of state.tasks.filter(t=>t.profileId===p.id&&t.week===ws)){push({...t,label:'本周流水任务',reward:t.reward||'零食礼包'},p.joinDate&&p.joinDate>ws?p.joinDate:ws,addDays(ws,6));}
 if(!validDate(p.joinDate))continue;
 const end30=addDays(p.joinDate,29),normalStart=addDays(monday(end30),7),jweek=monday(p.joinDate);
 if(ws>=normalStart){const rules=state.rules.filter(r=>r.enabled&&r.kind==='weekly').sort((a,b)=>a.target-b.target),total=sum(p.id,ws,asOf);const chosen=rules.filter(r=>r.target<=total).at(-1)||rules[0];if(chosen)push(chosen,ws,addDays(ws,6));}
 for(const rule of state.rules.filter(r=>r.enabled&&r.kind!=='weekly')){if(rule.kind==='new-month'){if(today>=p.joinDate&&ws<=monday(end30))push(rule,p.joinDate,end30);}else{const n=Number(rule.kind.split('-')[1])-1,start=addDays(jweek,n*7);if(ws===start)push(rule,start<p.joinDate?p.joinDate:start,addDays(start,6));}}
 }
 // 月初的昨日冠军使用昨日所在月作为并列比较周期。
 const candidates=visible.map(p=>({id:p.id,name:p.name,avatar:p.avatar||'',portrait:p.portrait||'',photoPosition:p.photoPosition||50,photoScale:p.photoScale||1,yesterday:sum(p.id,asOf,asOf),month:sum(p.id,asOf.slice(0,7)+'-01',asOf)})).filter(p=>p.yesterday>0).sort((a,b)=>b.yesterday-a.yesterday||b.month-a.month||a.name.localeCompare(b.name,'zh-CN'));
 return {today,asOf,month,people,champion:candidates[0]||null,rewards:rewards.sort((a,b)=>a.gap-b.gap||a.name.localeCompare(b.name,'zh-CN')).slice(0,20),latestDate:state.records.map(r=>r.date).filter(d=>d<=asOf).sort().at(-1)||null};
}
export function validateState(s){
 if(!Number.isFinite(s.ratio)||s.ratio<=0)throw Error('积分换算必须大于0');
 if(!s.tiers.length||s.tiers.some((t,i)=>!t.name||!Number.isFinite(t.total)||t.total<=0||(i&&t.total<=s.tiers[i-1].total)))throw Error('段位名称不能为空，累计积分必须严格递增');
 const ids=new Set(s.profiles.map(p=>p.id));if(ids.size!==s.profiles.length)throw Error('主播标识重复');
 const names=new Set();for(const p of s.profiles){if(!p.name.trim()||names.has(p.name.trim()))throw Error('拍档名不能为空或重复');names.add(p.name.trim());if(p.joinDate&&!validDate(p.joinDate))throw Error('入会日期格式错误');}
 const keys=new Set();for(const r of s.records){const key=r.profileId+r.date;if(keys.has(key))throw Error('存在同一主播同一天的重复记录');keys.add(key);if(!ids.has(r.profileId)||!validDate(r.date)||!Number.isFinite(r.wave)||r.wave<0||!Number.isInteger(r.wave)||!Number.isFinite(r.seconds)||r.seconds<0)throw Error('每日数据中的日期、主播、音浪或时长不正确');}
 for(const r of s.rules)if(!r.reward||!Number.isFinite(r.target)||r.target<=0)throw Error('奖励目标必须大于0，奖励内容不能为空');
 const tasks=new Set();for(const t of s.tasks){const k=t.profileId+t.week;if(tasks.has(k))throw Error('同一主播同一周只可设置一项周任务');tasks.add(k);if(!ids.has(t.profileId)||!validDate(t.week)||monday(t.week)!==t.week||!Number.isFinite(t.target)||t.target<=0)throw Error('周任务需要正确的主播、周一日期和正数目标');}
 return s;
}
export const normalizeName=n=>String(n).normalize('NFKC').toLowerCase().replace(/^(?:[퓣퓐]\s*[.．·]?\s*|[tＴ]\s*[.．·]\s*)/i,'').replace(/[\s\p{P}\p{S}]/gu,'');
export function similarity(a,b){a=normalizeName(a);b=normalizeName(b);if(!a||!b)return 0;if(a===b)return 1;if(a.includes(b)||b.includes(a))return .85;let prev=Array.from({length:b.length+1},(_,i)=>i);for(let i=1;i<=a.length;i++){const row=[i];for(let j=1;j<=b.length;j++)row[j]=Math.min(row[j-1]+1,prev[j]+1,prev[j-1]+(a[i-1]===b[j-1]?0:1));prev=row;}return 1-prev[b.length]/Math.max(a.length,b.length);}
export function importRows(rows,profiles){
 const valid=[],excluded=[],errors=[],matches={};
 rows.forEach((r,i)=>{const name=String(r.name||'').trim();if(String(r.joinDate||'').trim()==='非本公会'){excluded.push({row:i+2,name});return;}
 if(!name||!validDate(r.date)||!validDate(r.joinDate)||!Number.isFinite(r.wave)||r.wave<0||!Number.isInteger(r.wave)||!Number.isFinite(r.seconds)||r.seconds<0){errors.push({row:i+2,name,message:'请检查拍档名、日期、音浪、时长和入会日期'});return;}
 const exact=profiles.find(p=>p.name===name||(p.aliases||[]).includes(name))||profiles.find(p=>normalizeName(p.name)===normalizeName(name));if(!(name in matches))matches[name]={target:exact?.id||'',suggestions:exact?[]:profiles.map(p=>({id:p.id,name:p.name,score:similarity(name,p.name)})).filter(x=>x.score>=.55).sort((a,b)=>b.score-a.score).slice(0,4)};
 valid.push({...r,name});});return {valid,excluded,errors,matches};
}
export function applyImport(state,analysis,mode='replace',part='all'){
 const s=structuredClone(state),lookup=new Map(),conflicts=[],batchKeys=new Set(),nameKeys=new Set();if(mode==='replace'){if(!analysis.valid.length||analysis.errors.length)throw Error('新表没有有效数据或存在异常，旧数据未清除');s.records=[];}for(const r of analysis.valid){let p=s.profiles.find(p=>p.id===analysis.matches[r.name]?.target)||s.profiles.find(p=>p.name===r.name||(p.aliases||[]).includes(r.name))||s.profiles.find(p=>normalizeName(p.name)===normalizeName(r.name));
 if(!p){p={id:crypto.randomUUID(),name:r.name,joinDate:r.joinDate,show:true,offline:false,left:false,aliases:[]};s.profiles.push(p);}else{if(!p.joinDate)p.joinDate=r.joinDate;else if(p.joinDate!==r.joinDate)conflicts.push(`${r.name}：保留已存入会日期${p.joinDate}`);if(p.name!==r.name&&!p.aliases?.includes(r.name))p.aliases=[...(p.aliases||[]),r.name];}lookup.set(r.name,p.id);}
 for(const r of analysis.valid){const id=lookup.get(r.name),batchKey=id+'/'+r.date;const nameKey=normalizeName(r.name)+'/'+r.date;if(batchKeys.has(batchKey)||nameKeys.has(nameKey))throw Error('本批次存在同一主播同一天的多条记录，请核对姓名匹配并移除重复行');batchKeys.add(batchKey);nameKeys.add(nameKey);const old=s.records.find(x=>x.profileId===id&&x.date===r.date);if(old&&mode==='skip')continue;if(old){if(part!=='time')old.wave=r.wave;if(part!=='wave')old.seconds=r.seconds;}else s.records.push({profileId:id,date:r.date,wave:part==='time'?0:r.wave,seconds:part==='wave'?0:r.seconds});}
 return {state:validateState(s),conflicts};
}
