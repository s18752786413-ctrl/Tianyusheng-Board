import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyState} from '../src/defaults.js';
import {snapshot,importRows,applyImport,tierFor,ranked,validateState} from '../src/core.js';
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
 assert.equal(applyImport(s,a).state.records[0].wave,100);assert.equal(applyImport(s,a,'overwrite','time').state.records[0].wave,100);assert.equal(applyImport(s,a,'overwrite','time').state.records[0].seconds,7200);assert.equal(applyImport(s,a,'overwrite','wave').state.records[0].seconds,3600);
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
