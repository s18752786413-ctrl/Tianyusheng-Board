import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {PGlite} from '@electric-sql/pglite';import {emptyState} from '../src/defaults.js';import {snapshot,addDays} from '../src/core.js';
test('迁移可执行；公开接口脱敏；后台校验邮箱与保存版本',async()=>{
 const db=new PGlite();try{
 await db.exec(`create role anon;create role authenticated;create schema auth;create function auth.uid() returns uuid language sql as $$select nullif(current_setting('test.uid',true),'')::uuid$$;create function auth.jwt() returns jsonb language sql as $$select jsonb_build_object('email',current_setting('test.email',true))$$;create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);create table storage.objects(bucket_id text);alter table storage.objects enable row level security;`);
 await db.exec(fs.readFileSync(new URL('../supabase/初始化.sql',import.meta.url),'utf8'));
 await assert.rejects(db.query('select tys_load()'),/维护权限/);
 await db.exec("insert into tys_admins values ('qa@example.test');set test.uid='12345678-1234-4234-9234-123456789012';set test.email='qa@example.test';");
 const today=(await db.query("select to_char(now() at time zone 'Asia/Shanghai','YYYY-MM-DD') d")).rows[0].d;
 const s=emptyState();s.prompt='私有提示词';s.profiles=[{id:'甲',name:'甲',show:true,offline:true,left:false,joinDate:addDays(today,-45),aliases:['私有别名']},{id:'隐藏',name:'隐藏',show:false}];s.records=[{profileId:'甲',date:addDays(today,-1),wave:55000,seconds:3600},{profileId:'隐藏',date:addDays(today,-1),wave:99000,seconds:100}];
 const save=await db.query('select tys_save($1::jsonb,0) r',[JSON.stringify(s)]);assert.equal(save.rows[0].r.revision,1);
 await assert.rejects(db.query('select tys_save($1::jsonb,0)',[JSON.stringify(s)]),/维护者已更新/);
 const pub=(await db.query('select tys_public_board() r')).rows[0].r;const expected=snapshot(s,today);assert.equal(pub.champion.name,expected.champion.name);assert.deepEqual(pub.people,expected.people);assert.deepEqual(pub.rewards,expected.rewards);assert.ok(!JSON.stringify(pub).includes('私有'));assert.ok(!JSON.stringify(pub).includes('joinDate'));
 await db.exec('set role anon');await assert.rejects(db.query('select * from tys_state'),/permission denied/);await assert.rejects(db.query('select tys_load()'),/permission denied/);assert.equal((await db.query('select tys_public_board() r')).rows[0].r.champion.name,'甲');
 }finally{await db.close();}
});
