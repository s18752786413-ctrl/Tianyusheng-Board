-- 仅读取公开数据版本，不暴露后台资料；在现有项目SQL Editor执行。
create or replace function public.tys_board_version() returns jsonb language sql stable security definer set search_path=public,pg_temp as $$
 select jsonb_build_object('revision',revision,'today',(now() at time zone 'Asia/Shanghai')::date) from public.tys_state where id;
$$;
revoke all on function public.tys_board_version() from public;
grant execute on function public.tys_board_version() to anon,authenticated;
notify pgrst, 'reload schema';
