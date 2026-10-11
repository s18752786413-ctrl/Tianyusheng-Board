import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyState} from '../src/defaults.js';
import {snapshot,importRows,applyImport,tierFor,ranked,validateState,mergeProfiles,splitAlias,deleteProfile,addAlias} from '../src/core.js';
const profile=(id,extra={})=>({id,name:id,joinDate:'2026-10-01',show:true,offline:false,left:false,aliases:[],...extra});
const record=(id,date,wave,seconds=3600)=>({profileId:id,date,wave,seconds});
test('非本公会不建档；后续导入保留人工身份及入会日期',()=>{
 const s=emptyState();s.profiles=[profile('甲',{show:false,offline:true,left:true,joinDate:'2026-09-01'})];
 const rows=[{name:'甲',date:'2026-10-09',wave:100,seconds:3600,joinDate:'2026-10-01'},{name:'外部',date:'坏日期',wave:100,seconds:100,joinDate:'非本公会'}];
 const a=importRows(rows,s.profiles);assert.equal(a.excluded.length,1);assert.equal(a.errors.length,0);const r=applyImport(s,a);
 assert.equal(r.state.profiles.length,1);assert.equal(r.state.profiles[0].left,true);assert.equal(r.state.profiles[0].show,false);assert.equal(r.state.profiles[0].joinDate,'2026-09-01');assert.equal(r.conflicts.length,1);
});
test('重复导入不盲加；可分别覆盖流水或时长；同批次重复拒绝',()=>{
 const s=emptyState();s.profiles=[profile('甲')];s.records=[record('甲','2026-10-09',100,3600)];const a=importRows([{name:'甲',date:'2026-10-09',wave:500,seconds:7200,joinDate:'2026-10-01'}],s.profiles);
 assert.equal(applyImport(s,a,'skip').state.records[0].wave,100);assert.equal(applyImport(s,a,'overwrite','time').state.records[0].wave,100);assert.equal(applyImport(s,a,'overwrite','time').state.records[0].seconds,7200);assert.equal(applyImport(s,a,'overwrite','wave').state.records[0].seconds,3600);
 assert.throws(()=>applyImport(s,{...a,valid:[...a.valid,...a.valid]},'overwrite'),/多条记录/);
});
test('截至昨日、月累计段位、冠军并列用月流水、隐藏与月零排除',()=>{
 const s=emptyState();s.profiles=[profile('甲'),profile('乙'),profile('隐藏',{show:false}),profile('零')];s.records=[record('甲','2026-10-08',1200),record('甲','2026-10-09',300),record('乙','2026-10-09',300),record('乙','2026-10-10',50000),record('隐藏','2026-10-09',100000)];
 const d=snapshot(s,'2026-10-10');assert.equal(d.champion.name,'甲');assert.equal(d.people.length,2);assert.equal(d.people[0].month,1500);assert.equal(d.people[0].tier,'青铜1');assert.equal(d.people[0].nextGap,1500);
 assert.deepEqual(ranked([{name:'甲',v:4},{name:'乙',v:4},{name:'丙',v:1}],'v').map(x=>x.rank),[1,1,3]);assert.equal(tierFor(2000000,s.tiers,10).nextGap,null);
});
test('全0不产生冠军；月初昨日冠军使用上月并列流水',()=>{
 const s=emptyState();s.profiles=[profile('甲'),profile('乙')];assert.equal(snapshot(s,'2026-10-10').champion,null);s.records=[record('甲','2026-09-29',1000),record('甲','2026-09-30',50),record('乙','2026-09-30',50)];assert.equal(snapshot(s,'2026-10-01').champion.name,'甲');assert.equal(snapshot(s,'2026-10-01').people.length,0);
});
test('新人入会当周只算入会日起，周任务与新人同时获得',()=>{
 const s=emptyState();s.profiles=[profile('甲',{offline:true,joinDate:'2026-10-07'})];s.records=[record('甲','2026-10-06',50000),record('甲','2026-10-07',6000),record('甲','2026-10-08',5000)];s.tasks=[{id:'t',profileId:'甲',week:'2026-10-05',target:10000,reward:'零食礼包'}];
 const d=snapshot(s,'2026-10-09');assert.equal(d.rewards.length,3);assert.ok(d.rewards.every(r=>r.current===11000));assert.ok(d.rewards.filter(r=>r.gap===0).length===2);assert.ok(!d.rewards.some(r=>r.label.includes('周流水阶梯')));
});
test('前30天目标6万；满30天后下个完整自然周启用普通最高阶梯',()=>{
 const s=emptyState();s.profiles=[profile('甲',{offline:true,joinDate:'2026-09-09'})];s.records=[record('甲','2026-10-07',65000),record('甲','2026-10-12',55000)];
 const before=snapshot(s,'2026-10-11');assert.equal(before.rewards.find(r=>r.label.includes('30')).target,60000);assert.ok(!before.rewards.some(r=>r.label.includes('周流水阶梯')));
 const after=snapshot(s,'2026-10-13');assert.equal(after.rewards.length,1);assert.equal(after.rewards[0].target,50000);assert.equal(after.rewards[0].gap,0);
 s.profiles[0].left=true;assert.equal(snapshot(s,'2026-10-13').rewards.length,0);
});
test('重复日和非法日期阻止保存',()=>{const s=emptyState();s.profiles=[profile('甲')];s.records=[record('甲','2026-02-30',1)];assert.throws(()=>validateState(s));s.records=[record('甲','2026-10-01',1),record('甲','2026-10-01',2)];assert.throws(()=>validateState(s),/重复/);});

test('新表默认整批替换，旧日期和旧主播记录全部移除，资料保留',()=>{const s=emptyState();s.profiles=[profile('甲',{name:'퓣.小雅',offline:true,left:true,show:false,avatar:'已上传头像'}),profile('旧主播')];s.records=[record('甲','2026-09-01',999),record('旧主播','2026-10-09',300)];const a=importRows([{name:'小雅',date:'2026-10-10',wave:200,seconds:60,joinDate:'2026-10-01'}],s.profiles);const next=applyImport(s,a).state;assert.equal(next.records.length,1);assert.equal(next.records[0].profileId,'甲');assert.equal(next.records[0].wave,200);assert.equal(next.profiles[0].avatar,'已上传头像');assert.equal(next.profiles[0].left,true);assert.equal(next.profiles[0].show,false);assert.equal(next.profiles.length,2);assert.throws(()=>applyImport(s,{valid:[],errors:[],matches:{}}),/旧数据未清除/);});

test('合并保留当前资料，同日取最新且不累加；拆分恢复各来源记录',()=>{const s=emptyState();s.profiles=[profile('甲',{avatar:'保留照片',offline:true}),profile('乙',{avatar:'旧照片'})];s.records=[{...record('甲','2026-10-09',100),updatedAt:'2026-10-10T01:00:00Z'},{...record('乙','2026-10-09',200),updatedAt:'2026-10-10T02:00:00Z'},record('乙','2026-10-08',50)];const merged=addAlias(s,'甲','乙');assert.equal(merged.profiles.length,1);assert.equal(merged.profiles[0].avatar,'保留照片');assert.equal(merged.profiles[0].offline,true);assert.deepEqual(merged.profiles[0].aliases,['乙']);assert.equal(merged.records.find(r=>r.date==='2026-10-09').wave,200);const split=splitAlias(merged,'甲','乙');assert.equal(split.profiles.length,2);assert.equal(split.records.find(r=>r.profileId==='甲').wave,100);const other=split.profiles.find(p=>p.name==='乙');assert.equal(other.avatar,'旧照片');assert.equal(split.records.filter(r=>r.profileId===other.id).length,2);assert.equal(split.records.find(r=>r.profileId===other.id&&r.date==='2026-10-09').wave,200);});
test('旧记录无时间优先当前资料；删除主播移除关联数据与任务',()=>{const s=emptyState();s.profiles=[profile('甲'),profile('乙')];s.records=[record('甲','2026-10-09',100),record('乙','2026-10-09',200)];s.tasks=[{id:'任务',profileId:'乙',week:'2026-10-05',target:10000}];const m=mergeProfiles(s,'甲','乙');assert.equal(m.records[0].wave,100);assert.equal(m.tasks[0].profileId,'甲');const d=deleteProfile(m,'甲');assert.equal(d.profiles.length,0);assert.equal(d.records.length,0);assert.equal(d.tasks.length,0);});
test('上传唯一高置信相似昵称自动关联并补别名，多候选不自动合并',()=>{const s=emptyState();s.profiles=[profile('甲',{name:'悠悠呼不醒'})];const rows=[{name:'悠悠呼不醒呀',date:'2026-10-09',wave:100,seconds:3600,joinDate:'2026-10-01'}];const a=importRows(rows,s.profiles);assert.equal(a.matches[rows[0].name].target,'甲');const m=applyImport(s,a);assert.equal(m.state.profiles.length,1);assert.ok(m.state.profiles[0].aliases.includes(rows[0].name));const split=splitAlias(m.state,'甲',rows[0].name);assert.equal(split.records[0].profileId,split.profiles[1].id);const ambiguous=importRows(rows,[...s.profiles,profile('乙',{name:'悠悠呼不醒啦'})]);assert.equal(ambiguous.matches[rows[0].name].target,'');});
test('最新整表替换后，拆分别名不恢复以前上传的旧记录',()=>{const s=emptyState();s.profiles=[profile('甲'),profile('乙')];s.records=[record('乙','2026-10-08',900)];const m=mergeProfiles(s,'甲','乙');const r=applyImport(m,importRows([{name:'乙',date:'2026-10-09',wave:200,seconds:60,joinDate:'2026-10-01'}],m.profiles)).state;const split=splitAlias(r,'甲','乙');assert.equal(split.records.length,1);assert.equal(split.records[0].date,'2026-10-09');});
