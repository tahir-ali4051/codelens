-- CodeLens — classes & progress.  Run this whole file once in Supabase → SQL Editor → New query → Run.
-- Safe to run again (it drops and recreates the functions, keeps your data).

create table if not exists public.classes (
  id          uuid primary key default gen_random_uuid(),
  teacher_id  uuid not null references auth.users(id) on delete cascade,
  name        text not null check (char_length(name) between 1 and 60),
  code        text not null unique,
  archived    boolean not null default false,
  created_at  timestamptz not null default now()
);

create table if not exists public.students (
  id          uuid primary key default gen_random_uuid(),
  class_id    uuid not null references public.classes(id) on delete cascade,
  session_token uuid unique,                     -- secret kept in the student's browser; a new join on another device replaces it
  name        text not null check (char_length(name) between 1 and 40),
  pin_salt    text not null,
  pin_hash    text not null,
  pin_fails   int  not null default 0,
  created_at  timestamptz not null default now(),
  last_seen   timestamptz not null default now()
);
create unique index if not exists students_class_name_uq on public.students (class_id, lower(name));
create index if not exists students_class_idx on public.students (class_id);

create table if not exists public.progress (
  student_id  uuid not null references public.students(id) on delete cascade,
  lesson_id   text not null check (char_length(lesson_id) <= 80),
  lang        text not null check (lang in ('c','cpp','py')),
  runs        int  not null default 0,
  best_pct    int  not null default 0 check (best_pct between 0 and 100),
  done        boolean not null default false,
  first_at    timestamptz not null default now(),
  last_at     timestamptz not null default now(),
  primary key (student_id, lesson_id, lang)
);

alter table public.classes  enable row level security;
alter table public.students enable row level security;
alter table public.progress enable row level security;

-- helper functions (security definer so the policies below cannot loop into each other)
create or replace function public.my_teacher_class_ids() returns setof uuid
  language sql stable security definer set search_path = public as
  $$ select id from public.classes where teacher_id = auth.uid() $$;

drop policy if exists classes_read   on public.classes;
drop policy if exists classes_update on public.classes;
drop policy if exists classes_delete on public.classes;
create policy classes_read   on public.classes for select to authenticated using (teacher_id = auth.uid());
create policy classes_update on public.classes for update to authenticated
  using (teacher_id = auth.uid()) with check (teacher_id = auth.uid());
create policy classes_delete on public.classes for delete to authenticated using (teacher_id = auth.uid());

drop policy if exists students_read   on public.students;
drop policy if exists students_delete on public.students;
create policy students_read   on public.students for select to authenticated
  using (class_id in (select public.my_teacher_class_ids()));
create policy students_delete on public.students for delete to authenticated
  using (class_id in (select public.my_teacher_class_ids()));

drop policy if exists progress_read on public.progress;
create policy progress_read on public.progress for select to authenticated
  using (student_id in (select id from public.students));   -- already limited to the teacher's own students

-- students never sign in with an account: they hold a secret token (see join_class), so there are no sign-in limits for a big class
create or replace function public.is_teacher() returns boolean
  language sql stable as
  $$ select auth.uid() is not null and coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false $$;

create or replace function public.hash_pin(p_salt text, p_pin text) returns text
  language sql immutable as
  $$ select encode(sha256(convert_to(p_salt || ':' || p_pin, 'UTF8')), 'hex') $$;

-- TEACHER: make a class. Code looks like  K7M2-QX  (no confusing letters).
create or replace function public.create_class(p_name text) returns public.classes
  language plpgsql security definer set search_path = public as $$
declare
  v_code text; v_alpha text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; v_row public.classes; i int; tries int := 0;
begin
  if not public.is_teacher() then raise exception 'not_teacher'; end if;
  p_name := btrim(coalesce(p_name, ''));
  if p_name = '' or char_length(p_name) > 60 then raise exception 'bad_name'; end if;
  loop
    v_code := '';
    for i in 1..6 loop
      v_code := v_code || substr(v_alpha, 1 + floor(random() * length(v_alpha))::int, 1);
      if i = 4 then v_code := v_code || '-'; end if;
    end loop;
    begin
      insert into public.classes (teacher_id, name, code) values (auth.uid(), p_name, v_code) returning * into v_row;
      return v_row;
    exception when unique_violation then
      tries := tries + 1; if tries > 20 then raise; end if;
    end;
  end loop;
end $$;

-- STUDENT: join with class code + name + 4-digit PIN. Same name + same PIN on a new device = same student again.
create or replace function public.join_class(p_code text, p_name text, p_pin text) returns json
  language plpgsql security definer set search_path = public as $$
declare
  v_class public.classes; v_st public.students; v_salt text; v_tok uuid := gen_random_uuid();
begin
  p_code := upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'));
  p_name := regexp_replace(btrim(coalesce(p_name, '')), '\s+', ' ', 'g');
  if p_name = '' or char_length(p_name) > 40 then return json_build_object('error', 'bad_name'); end if;
  if coalesce(p_pin, '') !~ '^[0-9]{4}$' then return json_build_object('error', 'bad_pin'); end if;
  select * into v_class from public.classes
    where replace(code, '-', '') = p_code and not archived;
  if not found then return json_build_object('error', 'bad_code'); end if;

  select * into v_st from public.students where class_id = v_class.id and lower(name) = lower(p_name);
  if found then
    if v_st.pin_fails >= 10 then return json_build_object('error', 'locked'); end if;
    if v_st.pin_hash <> public.hash_pin(v_st.pin_salt, p_pin) then
      -- (returned, not raised, so the counter is really saved)
      update public.students set pin_fails = pin_fails + 1 where id = v_st.id;
      return json_build_object('error', 'wrong_pin');
    end if;
  else
    v_salt := gen_random_uuid()::text;
    insert into public.students (class_id, name, pin_salt, pin_hash)
      values (v_class.id, p_name, v_salt, public.hash_pin(v_salt, p_pin)) returning * into v_st;
  end if;
  update public.students set session_token = v_tok, pin_fails = 0, last_seen = now() where id = v_st.id;
  return json_build_object('student_id', v_st.id, 'name', v_st.name, 'class_name', v_class.name, 'token', v_tok);
end $$;

-- STUDENT: who am I (resume after a page reload) — null if the token is not valid any more
create or replace function public.whoami(p_token uuid) returns json
  language sql stable security definer set search_path = public as $$
  select json_build_object('student_id', s.id, 'name', s.name, 'class_name', c.name)
  from public.students s join public.classes c on c.id = s.class_id where s.session_token = p_token $$;

-- STUDENT: leave the class on this device
create or replace function public.leave_class(p_token uuid) returns void
  language sql security definer set search_path = public as $$
  update public.students set session_token = null where session_token = p_token $$;

-- STUDENT: read my own progress
create or replace function public.my_progress(p_token uuid)
  returns table (lesson_id text, lang text, runs int, best_pct int, done boolean)
  language sql stable security definer set search_path = public as $$
  select p.lesson_id, p.lang, p.runs, p.best_pct, p.done from public.progress p
  join public.students s on s.id = p.student_id where s.session_token = p_token $$;

-- STUDENT: remember that a lesson was run / finished
create or replace function public.record_progress(p_token uuid, p_lesson text, p_lang text, p_pct int, p_done boolean, p_run boolean)
  returns void language plpgsql security definer set search_path = public as $$
declare v_sid uuid;
begin
  select id into v_sid from public.students where session_token = p_token;
  if v_sid is null then return; end if;               -- not in a class: nothing to save
  if p_lang not in ('c','cpp','py') or coalesce(char_length(p_lesson), 0) not between 1 and 80 then return; end if;
  p_pct := greatest(0, least(100, coalesce(p_pct, 0)));
  insert into public.progress (student_id, lesson_id, lang, runs, best_pct, done)
    values (v_sid, p_lesson, p_lang, case when p_run then 1 else 0 end, p_pct, coalesce(p_done, false))
  on conflict (student_id, lesson_id, lang) do update set
    runs = public.progress.runs + case when p_run then 1 else 0 end,
    best_pct = greatest(public.progress.best_pct, excluded.best_pct),
    done = public.progress.done or excluded.done,
    last_at = now();
  update public.students set last_seen = now() where id = v_sid;
end $$;

-- TEACHER: set a new PIN for a student who forgot it (also unlocks them)
create or replace function public.reset_pin(p_student uuid, p_pin text) returns void
  language plpgsql security definer set search_path = public as $$
declare v_salt text := gen_random_uuid()::text;
begin
  if p_pin !~ '^[0-9]{4}$' then raise exception 'bad_pin'; end if;
  update public.students set pin_salt = v_salt, pin_hash = public.hash_pin(v_salt, p_pin), pin_fails = 0
   where id = p_student and class_id in (select public.my_teacher_class_ids());
  if not found then raise exception 'not_allowed'; end if;
end $$;

revoke all on function public.create_class(text), public.join_class(text,text,text), public.whoami(uuid), public.leave_class(uuid),
  public.my_progress(uuid), public.record_progress(uuid,text,text,int,boolean,boolean), public.reset_pin(uuid,text) from public, anon, authenticated;
-- students (not signed in = "anon") may use only these:
grant execute on function public.join_class(text,text,text), public.whoami(uuid), public.leave_class(uuid),
  public.my_progress(uuid), public.record_progress(uuid,text,text,int,boolean,boolean) to anon, authenticated;
-- teachers (signed in) additionally:
grant execute on function public.create_class(text), public.reset_pin(uuid,text) to authenticated;
grant select, update, delete on public.classes, public.students to authenticated;
grant select on public.progress to authenticated;
