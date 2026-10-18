-- 甜屿声独立数据看板：在现有Supabase项目的SQL Editor一次执行。
-- 不修改外宣培训记录表。业务状态仅可由授权邮箱通过RPC读取和保存。
begin;
create table if not exists public.tys_admins(email text primary key check(email=lower(email)));
create table if not exists public.tys_state(id boolean primary key default true check(id),payload jsonb not null,revision bigint not null default 0,updated_at timestamptz not null default now());
-- 用户已指定的管理员账号对应邮箱；密码由Supabase Auth管理。
insert into public.tys_admins(email) values ('15356974248@163.com') on conflict do nothing;
alter table public.tys_admins enable row level security;
alter table public.tys_state enable row level security;
revoke all on public.tys_admins,public.tys_state from anon,authenticated;

create or replace function public.tys_is_admin() returns boolean language sql stable security definer set search_path=public,pg_temp as $$
 select auth.uid() is not null and exists(select 1 from public.tys_admins where email=lower(auth.jwt()->>'email'));
$$;
revoke all on function public.tys_is_admin() from public;
grant execute on function public.tys_is_admin() to authenticated;

create or replace function public.tys_load() returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare result jsonb;
begin
 if not public.tys_is_admin() then raise exception '此邮箱未获看板维护权限'; end if;
 select jsonb_build_object('state',payload,'revision',revision,'updatedAt',updated_at) into result from public.tys_state where id;
 return result;
end;$$;

create or replace function public.tys_save(payload jsonb,expected_revision bigint) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare n bigint; p jsonb; r jsonb; prev numeric := 0; total numeric; seen text[] := '{}'; key text; pids text[] := '{}';
begin
 if not public.tys_is_admin() then raise exception '此邮箱未获看板维护权限'; end if;
 if octet_length(payload::text)>15000000 then raise exception '数据超过单次保存上限'; end if;
 if coalesce(jsonb_typeof(payload->'profiles'),'')<>'array' or coalesce(jsonb_typeof(payload->'records'),'')<>'array' or coalesce(jsonb_typeof(payload->'tiers'),'')<>'array' or coalesce(jsonb_typeof(payload->'rules'),'')<>'array' or coalesce(jsonb_typeof(payload->'tasks'),'')<>'array' then raise exception '数据结构不完整'; end if;
 if coalesce((payload->>'ratio')::numeric,0)<=0 then raise exception '积分换算必须大于0'; end if;
 if jsonb_array_length(payload->'tiers')=0 then raise exception '至少保留一个段位'; end if;
 for r in select value from jsonb_array_elements(payload->'tiers') loop
  total:=(r->>'total')::numeric;
  if total is null or total<=prev or length(coalesce(r->>'name',''))=0 then raise exception '段位累计门槛必须严格递增'; end if;
  prev:=total;
 end loop;
 for p in select value from jsonb_array_elements(payload->'profiles') loop
  if length(coalesce(p->>'id',''))=0 or length(trim(coalesce(p->>'name','')))=0 or (p->>'name')=any(seen) or (p->>'id')=any(pids) then raise exception '拍档名或标识为空或重复'; end if;
  seen:=array_append(seen,p->>'name'); pids:=array_append(pids,p->>'id');
  if coalesce(p->>'joinDate','')<>'' then perform (p->>'joinDate')::date; end if;
 end loop;
 seen:='{}';
 for r in select value from jsonb_array_elements(payload->'records') loop
  key:=(r->>'profileId')||'/'||(r->>'date');
  if key is null or not (r->>'profileId')=any(pids) or key=any(seen) or r->>'wave' is null or r->>'seconds' is null or (r->>'wave')::numeric<0 or (r->>'wave')::numeric<>trunc((r->>'wave')::numeric) or (r->>'seconds')::numeric<0 then raise exception '日数据存在重复、负数或无效主播'; end if;
  perform (r->>'date')::date; seen:=array_append(seen,key);
 end loop;
 for r in select value from jsonb_array_elements(payload->'rules') loop
  if coalesce(r->>'kind','') not in ('weekly','new-1','new-2','new-3','new-month') or coalesce((r->>'target')::numeric,0)<=0 or coalesce(r->>'reward','')='' then raise exception '奖励目标和内容不正确'; end if;
 end loop;
 seen:='{}';
 for r in select value from jsonb_array_elements(payload->'tasks') loop
  key:=(r->>'profileId')||'/'||(r->>'week');
  if key is null or not (r->>'profileId')=any(pids) or key=any(seen) or coalesce((r->>'target')::numeric,0)<=0 or extract(isodow from (r->>'week')::date)<>1 then raise exception '周任务日期、目标或主播不正确'; end if;
  seen:=array_append(seen,key);
 end loop;
 update public.tys_state s set payload=tys_save.payload,revision=s.revision+1,updated_at=now() where id and revision=expected_revision returning revision into n;
 if n is null then raise exception '另一位维护者已更新数据，请刷新后重新核对；当前编辑内容仍可导出'; end if;
 return jsonb_build_object('revision',n,'updatedAt',now());
end;$$;

create or replace function public.tys_sum(records jsonb,profile_id text,start_day date,end_day date) returns numeric language sql immutable as $$
 select coalesce(sum((r->>'wave')::numeric),0) from jsonb_array_elements(records) r where r->>'profileId'=profile_id and (r->>'date')::date between start_day and end_day;
$$;
revoke all on function public.tys_sum(jsonb,text,date,date) from public;

create or replace function public.tys_public_board() returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare s jsonb; rev bigint; stamp timestamptz;
 today date := (now() at time zone 'Asia/Shanghai')::date; cutoff date := today-1; mstart date := date_trunc('month',today)::date; ws date := date_trunc('week',today)::date;
 p jsonb; item jsonb; rule jsonb; task jsonb; rules jsonb; days jsonb; result_people jsonb := '[]'; candidates jsonb := '[]'; reward_rows jsonb := '[]'; champion jsonb;
 wave numeric; yesterday numeric; seconds numeric; best numeric; tie_month numeric; ratio numeric; tier_name text; next_gap numeric; next_total numeric; jdate date; jweek date; end30 date; normal_start date; start_day date; end_day date; current_wave numeric; latest date; n int;
begin
 select payload,revision,updated_at into s,rev,stamp from public.tys_state where id;
 if s is null then raise exception '看板尚未初始化'; end if;
 ratio:=(s->>'ratio')::numeric;
 select max((r->>'date')::date) into latest from jsonb_array_elements(s->'records') r where (r->>'date')::date<=cutoff;
 for p in select value from jsonb_array_elements(s->'profiles') loop
  if coalesce((p->>'show')::boolean,true)=false then continue; end if;
  wave:=public.tys_sum(s->'records',p->>'id',mstart,cutoff);
  yesterday:=public.tys_sum(s->'records',p->>'id',cutoff,cutoff);
  tie_month:=public.tys_sum(s->'records',p->>'id',date_trunc('month',cutoff)::date,cutoff);
  if yesterday>0 then candidates:=candidates||jsonb_build_array(jsonb_build_object('id',p->>'id','name',p->>'name','avatar',coalesce(p->>'avatar',''),'portrait',coalesce(p->>'portrait',''),'photoPosition',coalesce((p->>'photoPosition')::numeric,50),'photoScale',coalesce((p->>'photoScale')::numeric,1),'yesterday',yesterday,'month',tie_month)); end if;
  if wave<=0 then continue; end if;
  select coalesce(sum((r->>'seconds')::numeric),0),coalesce(max((r->>'wave')::numeric),0),coalesce(jsonb_agg(jsonb_build_object('date',r->>'date','wave',(r->>'wave')::numeric) order by r->>'date'),'[]') into seconds,best,days from jsonb_array_elements(s->'records') r where r->>'profileId'=p->>'id' and (r->>'date')::date between mstart and cutoff;
  select t->>'name' into tier_name from jsonb_array_elements(s->'tiers') t where (t->>'total')::numeric*ratio<=wave order by (t->>'total')::numeric desc limit 1;
  select (t->>'total')::numeric*ratio into next_total from jsonb_array_elements(s->'tiers') t where (t->>'total')::numeric*ratio>wave order by (t->>'total')::numeric limit 1;
  next_gap:=next_total-wave;
  item:=jsonb_build_object('id',p->>'id','name',p->>'name','avatar',coalesce(p->>'avatar',''),'portrait',coalesce(p->>'portrait',''),'photoPosition',coalesce((p->>'photoPosition')::numeric,50),'photoScale',coalesce((p->>'photoScale')::numeric,1),'month',wave,'yesterday',yesterday,'best',best,'seconds',seconds,'days',days,'tier',coalesce(tier_name,'未达青铜1'),'nextGap',next_gap);
  result_people:=result_people||jsonb_build_array(item);
  if not coalesce((p->>'offline')::boolean,false) or coalesce((p->>'left')::boolean,false) then continue; end if;
  jdate:=nullif(p->>'joinDate','')::date;
  for task in select value from jsonb_array_elements(s->'tasks') where value->>'profileId'=p->>'id' and (value->>'week')::date=ws loop
   current_wave:=public.tys_sum(s->'records',p->>'id',greatest(ws,coalesce(jdate,ws)),least(ws+6,cutoff));
   reward_rows:=reward_rows||jsonb_build_array(jsonb_build_object('id',(p->>'id')||'-'||(task->>'id'),'name',p->>'name','avatar',coalesce(p->>'avatar',''),'label','本周流水任务','reward',coalesce(task->>'reward','零食礼包'),'current',current_wave,'target',(task->>'target')::numeric,'gap',greatest((task->>'target')::numeric-current_wave,0)));
  end loop;
  if jdate is null then continue; end if;
  jweek:=date_trunc('week',jdate)::date; end30:=jdate+29; normal_start:=date_trunc('week',end30)::date+7;
  if ws>=normal_start then
   current_wave:=public.tys_sum(s->'records',p->>'id',ws,cutoff);
   select value into rule from jsonb_array_elements(s->'rules') where value->>'kind'='weekly' and coalesce((value->>'enabled')::boolean,true) order by case when (value->>'target')::numeric<=current_wave then 0 else 1 end,case when (value->>'target')::numeric<=current_wave then -(value->>'target')::numeric else (value->>'target')::numeric end limit 1;
   if rule is not null then reward_rows:=reward_rows||jsonb_build_array(jsonb_build_object('id',(p->>'id')||'-'||(rule->>'id'),'name',p->>'name','avatar',coalesce(p->>'avatar',''),'label',rule->>'label','reward',rule->>'reward','current',current_wave,'target',(rule->>'target')::numeric,'gap',greatest((rule->>'target')::numeric-current_wave,0))); end if;
  end if;
  for rule in select value from jsonb_array_elements(s->'rules') where value->>'kind'<>'weekly' and coalesce((value->>'enabled')::boolean,true) loop
   if rule->>'kind'='new-month' then
    if today<jdate or ws>date_trunc('week',end30)::date then continue; end if;
    start_day:=jdate;end_day:=end30;
   else
    n:=split_part(rule->>'kind','-',2)::int-1;start_day:=jweek+n*7;
    if start_day<>ws then continue; end if;
    end_day:=start_day+6;start_day:=greatest(start_day,jdate);
   end if;
   current_wave:=public.tys_sum(s->'records',p->>'id',start_day,least(end_day,cutoff));
   reward_rows:=reward_rows||jsonb_build_array(jsonb_build_object('id',(p->>'id')||'-'||(rule->>'id'),'name',p->>'name','avatar',coalesce(p->>'avatar',''),'label',rule->>'label','reward',rule->>'reward','current',current_wave,'target',(rule->>'target')::numeric,'gap',greatest((rule->>'target')::numeric-current_wave,0)));
  end loop;
 end loop;
 select value into champion from jsonb_array_elements(candidates) order by (value->>'yesterday')::numeric desc,(value->>'month')::numeric desc,value->>'name' limit 1;
 select coalesce(jsonb_agg(value),'[]') into reward_rows from (select value from jsonb_array_elements(reward_rows) order by (value->>'gap')::numeric,value->>'name' limit 20) q;
 return jsonb_build_object('today',today,'asOf',cutoff,'month',to_char(today,'YYYY-MM'),'people',result_people,'champion',champion,'rewards',reward_rows,'latestDate',latest,'revision',rev,'updatedAt',stamp);
end;$$;

revoke all on function public.tys_load(),public.tys_save(jsonb,bigint),public.tys_public_board() from public;
grant execute on function public.tys_load(),public.tys_save(jsonb,bigint) to authenticated;
grant execute on function public.tys_public_board() to anon,authenticated;

insert into public.tys_state(id,payload) values(true,'{"profiles":[],"records":[],"tiers":[],"rules":[],"tasks":[],"ratio":10,"prompt":""}') on conflict(id) do nothing;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('tys-display','tys-display',true,10485760,array['image/jpeg','image/png','image/webp']) on conflict(id) do nothing;
drop policy if exists tys_image_insert on storage.objects;
drop policy if exists tys_image_update on storage.objects;
drop policy if exists tys_image_delete on storage.objects;
create policy tys_image_insert on storage.objects for insert to authenticated with check(bucket_id='tys-display' and public.tys_is_admin());
create policy tys_image_update on storage.objects for update to authenticated using(bucket_id='tys-display' and public.tys_is_admin()) with check(bucket_id='tys-display' and public.tys_is_admin());
create policy tys_image_delete on storage.objects for delete to authenticated using(bucket_id='tys-display' and public.tys_is_admin());
commit;
-- 初始化后，将QA及会长的实际邮箱加入下面的名单（替换占位符再单独执行）。
-- insert into public.tys_admins(email) values (lower('QA实际邮箱')), (lower('会长实际邮箱')) on conflict do nothing;

-- 通知接口服务重新加载新增函数。
notify pgrst, 'reload schema';

-- 仅读取公开数据版本，不暴露后台资料；在现有项目SQL Editor执行。
create or replace function public.tys_board_version() returns jsonb language sql stable security definer set search_path=public,pg_temp as $$
 select jsonb_build_object('revision',revision,'today',(now() at time zone 'Asia/Shanghai')::date) from public.tys_state where id;
$$;
revoke all on function public.tys_board_version() from public;
grant execute on function public.tys_board_version() to anon,authenticated;
notify pgrst, 'reload schema';
