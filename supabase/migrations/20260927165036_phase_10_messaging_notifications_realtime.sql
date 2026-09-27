-- Phase 10: persisted messaging and selective database-change delivery.
insert into public.capabilities(key,description,resource_scope_required) values
 ('channel.view','Participate in an authorized channel.',true),
 ('channel.create','Create a Project channel within authorized scope.',true),
 ('channel.manage_members','Manage explicit channel members.',true),
 ('message.view','Read messages in a channel membership.',true),
 ('message.send','Send messages in a channel membership.',true),
 ('notification.view','Read own notifications.',false),
 ('notification.manage_own','Mark own notifications read.',false),
 ('notification.preferences.manage_own','Manage own notification preferences.',false);
insert into public.role_capabilities(role_key,capability_key)
select 'agency_director',key from public.capabilities where key in
 ('channel.view','channel.create','channel.manage_members','message.view','message.send',
  'notification.view','notification.manage_own','notification.preferences.manage_own');
insert into public.role_capabilities(role_key,capability_key) values
 ('project_manager','channel.create'),('project_manager','channel.manage_members'),
 ('project_manager','message.view'),('project_manager','message.send'),
 ('contributor','message.view'),('contributor','message.send'),
 ('client_admin','message.view'),('client_admin','message.send'),
 ('client_reviewer','message.view'),('client_reviewer','message.send'),
 ('client_viewer','message.view'),('client_viewer','message.send');
insert into public.role_capabilities(role_key,capability_key)
select r.key,c.key from public.roles r cross join public.capabilities c
where r.key <> 'agency_director' and c.key in
 ('notification.view','notification.manage_own','notification.preferences.manage_own');

create table public.channels (
 id uuid primary key default gen_random_uuid(),
 kind text not null check(kind in ('organization','project')),
 organization_id uuid not null references public.organizations(id) on delete restrict,
 project_id uuid references public.projects(id) on delete restrict,
 created_by uuid references public.profiles(user_id) on delete restrict,
 created_at timestamptz not null default now(),
 archived_at timestamptz,
 check ((kind='organization' and project_id is null) or (kind='project' and project_id is not null))
);
create unique index channels_one_general_per_organization on public.channels(organization_id) where kind='organization';
create unique index channels_one_per_project on public.channels(project_id) where kind='project';
create index channels_organization_idx on public.channels(organization_id,kind);

create table public.channel_memberships (
 id uuid primary key default gen_random_uuid(),
 channel_id uuid not null references public.channels(id) on delete restrict,
 user_id uuid not null references public.profiles(user_id) on delete restrict,
 member_kind text not null check(member_kind in ('internal','client')),
 status text not null default 'active' check(status in ('active','removed')),
 added_by uuid references public.profiles(user_id) on delete restrict,
 created_at timestamptz not null default now(),
 removed_at timestamptz,
 last_read_at timestamptz,
 unique(channel_id,user_id),
 check ((status='removed')=(removed_at is not null))
);
create index channel_memberships_user_active_idx on public.channel_memberships(user_id,channel_id) where status='active';

-- The inner function accepts a recipient for transactional fan-out. It is never exposed to API roles.
create function app_private.channel_access(p_channel uuid,p_actor uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select p_actor is not null and exists (
  select 1 from public.channels c
  join public.organizations o on o.id=c.organization_id
  join public.channel_memberships m on m.channel_id=c.id and m.user_id=p_actor and m.status='active'
  where c.id=p_channel and c.archived_at is null and o.lifecycle='active_client'
   and (c.kind='organization' or exists (
     select 1 from public.projects p join public.brands b on b.id=p.brand_id
     where p.id=c.project_id and p.archived_at is null and b.organization_id=c.organization_id))
   and (
    (m.member_kind='client' and exists (
      select 1 from public.client_memberships cm where cm.user_id=p_actor
       and cm.organization_id=c.organization_id and cm.status='active')
      and (c.kind='organization' or exists (
       select 1 from public.project_memberships pm where pm.project_id=c.project_id
        and pm.user_id=p_actor and pm.member_type='client' and pm.status='active')))
    or
    (m.member_kind='internal' and exists (
      select 1 from public.agency_memberships am where am.user_id=p_actor
       and am.agency_id=o.agency_id and am.status='active'
       and (am.role_key='agency_director' or
        (c.kind='organization' and exists (
          select 1 from public.capability_grants cg where cg.user_id=p_actor
           and cg.organization_id=c.organization_id and cg.capability_key='channel.view'
           and cg.revoked_at is null and (cg.expires_at is null or cg.expires_at>now()))
         or c.kind='project')))
      and (c.kind='organization' or exists (
       select 1 from public.project_memberships pm where pm.project_id=c.project_id
        and pm.user_id=p_actor and pm.member_type='internal' and pm.status='active')
       or exists (select 1 from public.agency_memberships am where am.user_id=p_actor
        and am.agency_id=o.agency_id and am.status='active' and am.role_key='agency_director')))
   )
 );
$$;
create function app_private.channel_access(p_channel uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select app_private.channel_access($1,(select auth.uid()));
$$;

create function app_private.ensure_general_channel()
returns trigger language plpgsql security definer set search_path='' as $$
declare v_channel uuid;
begin
 if new.lifecycle <> 'active_client' then return new; end if;
 insert into public.channels(kind,organization_id) values('organization',new.id)
 on conflict do nothing;
 select id into v_channel from public.channels where organization_id=new.id and kind='organization';
 insert into public.channel_memberships(channel_id,user_id,member_kind)
 select v_channel,cm.user_id,'client' from public.client_memberships cm
 where cm.organization_id=new.id and cm.status='active'
 on conflict(channel_id,user_id) do update set status='active',removed_at=null;
 insert into public.channel_memberships(channel_id,user_id,member_kind)
 select v_channel,am.user_id,'internal' from public.agency_memberships am
 where am.agency_id=new.agency_id and am.role_key='agency_director' and am.status='active'
 on conflict(channel_id,user_id) do update set status='active',removed_at=null;
 return new;
end; $$;
create trigger organizations_general_channel after insert or update of lifecycle on public.organizations
for each row execute function app_private.ensure_general_channel();

create function app_private.sync_general_channel_member()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.status='active' then
  insert into public.channel_memberships(channel_id,user_id,member_kind)
  select c.id,new.user_id,'client' from public.channels c
  where c.kind='organization' and c.organization_id=new.organization_id
  on conflict(channel_id,user_id) do update set status='active',removed_at=null;
 end if;
 return new;
end; $$;
create trigger client_memberships_general_channel after insert or update of status on public.client_memberships
for each row execute function app_private.sync_general_channel_member();
create function app_private.sync_director_channel_member()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.status='active' and new.role_key='agency_director' then
  insert into public.channel_memberships(channel_id,user_id,member_kind)
  select c.id,new.user_id,'internal' from public.channels c
  join public.organizations o on o.id=c.organization_id
  where c.kind='organization' and o.agency_id=new.agency_id
  on conflict(channel_id,user_id) do update set status='active',removed_at=null;
 end if;
 return new;
end; $$;
create trigger agency_director_general_channel after insert or update of status,role_key on public.agency_memberships
for each row execute function app_private.sync_director_channel_member();
update public.organizations set lifecycle=lifecycle where lifecycle='active_client';

create table public.messages (
 id uuid primary key default gen_random_uuid(),
 channel_id uuid not null references public.channels(id) on delete restrict,
 author_user_id uuid not null references public.profiles(user_id) on delete restrict,
 client_message_id uuid not null,
 body text not null check(char_length(btrim(body)) between 1 and 4000),
 created_at timestamptz not null default clock_timestamp(),
 unique(author_user_id,client_message_id)
);
create index messages_channel_order_idx on public.messages(channel_id,created_at desc,id desc);

alter table public.notifications alter column project_id drop not null;
alter table public.notifications alter column deliverable_id drop not null;
alter table public.notifications drop constraint notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check check(kind in
 ('deliverable_published','approval_pending','client_approved','client_changes_requested','message_received'));
alter table public.notifications add column channel_id uuid references public.channels(id) on delete restrict;
alter table public.notifications add column message_id uuid references public.messages(id) on delete restrict;
alter table public.notifications add column publication_id uuid references public.client_publications(id) on delete restrict;
alter table public.notifications add column work_item_id uuid references public.work_items(id) on delete restrict;
alter table public.notifications add constraint notifications_context_check check(
 (kind='message_received' and channel_id is not null and message_id is not null and deliverable_id is null
  and publication_id is null and work_item_id is null)
 or (kind<>'message_received' and project_id is not null and deliverable_id is not null
  and channel_id is null and message_id is null));
create index notifications_recipient_unread_idx on public.notifications(recipient_id,created_at desc,id) where read_at is null;

create function app_private.enrich_notification_context()
returns trigger language plpgsql security definer set search_path='' as $$
declare v_payload jsonb;
begin
 if new.kind='message_received' then return new; end if;
 select d.work_item_id into new.work_item_id from public.deliverables d where d.id=new.deliverable_id;
 select e.payload into v_payload from public.domain_events e where e.event_id=new.domain_event_id;
 select cp.id into new.publication_id from public.client_publications cp
 where cp.deliverable_id=new.deliverable_id
 order by (cp.id::text=v_payload->>'publication_id'
  or cp.version_id::text=v_payload->>'version_id') desc,cp.published_at desc,cp.id desc limit 1;
 return new;
end; $$;
create trigger notifications_enrich_context before insert on public.notifications
for each row execute function app_private.enrich_notification_context();
update public.notifications n set work_item_id=d.work_item_id,
 publication_id=(select cp.id from public.client_publications cp
  join public.domain_events e on e.event_id=n.domain_event_id
  where cp.deliverable_id=n.deliverable_id
  order by (cp.id::text=e.payload->>'publication_id'
   or cp.version_id::text=e.payload->>'version_id') desc,cp.published_at desc,cp.id desc limit 1)
from public.deliverables d where d.id=n.deliverable_id;

create table public.notification_preferences (
 user_id uuid primary key references public.profiles(user_id) on delete restrict,
 messages boolean not null default true,
 approvals boolean not null default true,
 deliverable_updates boolean not null default true,
 updated_at timestamptz not null default now()
);
create table public.notification_outbox (
 id uuid primary key default gen_random_uuid(),
 domain_event_id uuid not null references public.domain_events(event_id) on delete restrict,
 recipient_id uuid not null references public.profiles(user_id) on delete restrict,
 notification_id uuid not null references public.notifications(id) on delete restrict,
 kind text not null,
 medium text not null default 'in_app' check(medium='in_app'),
 status text not null default 'delivered' check(status='delivered'),
 created_at timestamptz not null default now(),
 unique(domain_event_id,recipient_id,kind,medium)
);
create index notification_outbox_recipient_idx on public.notification_outbox(recipient_id,created_at desc);

create function app_private.record_notification_intent()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 insert into public.notification_outbox(domain_event_id,recipient_id,notification_id,kind)
 values(new.domain_event_id,new.recipient_id,new.id,new.kind) on conflict do nothing;
 return new;
end; $$;
create trigger notifications_record_intent after insert on public.notifications
for each row execute function app_private.record_notification_intent();
insert into public.notification_outbox(domain_event_id,recipient_id,notification_id,kind)
select domain_event_id,recipient_id,id,kind from public.notifications on conflict do nothing;

create function app_private.apply_notification_preferences()
returns trigger language plpgsql security definer set search_path='' as $$
declare v_preferences public.notification_preferences%rowtype;
begin
 select * into v_preferences from public.notification_preferences where user_id=new.recipient_id;
 if (new.kind='message_received' and v_preferences.messages is false)
  or (new.kind='approval_pending' and v_preferences.approvals is false)
  or (new.kind in ('deliverable_published','client_approved','client_changes_requested')
   and v_preferences.deliverable_updates is false) then return null; end if;
 return new;
end; $$;
create trigger notifications_apply_preferences before insert on public.notifications
for each row execute function app_private.apply_notification_preferences();

create function public.create_project_channel(p_project uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_actor uuid:=auth.uid(); v_org uuid; v_channel uuid;
begin
 select b.organization_id into v_org from public.projects p
 join public.brands b on b.id=p.brand_id join public.organizations o on o.id=b.organization_id
 where p.id=p_project and p.archived_at is null and o.lifecycle='active_client' for share of p;
 if v_actor is null or v_org is null or not app_private.project_permission(p_project,'channel.create')
  or not app_private.can_manage_project_members(p_project) then
  raise exception using errcode='42501',message='channel_create_forbidden'; end if;
 insert into public.channels(kind,organization_id,project_id,created_by)
 values('project',v_org,p_project,v_actor) on conflict do nothing;
 select id into v_channel from public.channels where project_id=p_project and kind='project';
 insert into public.channel_memberships(channel_id,user_id,member_kind,added_by)
 values(v_channel,v_actor,'internal',v_actor) on conflict(channel_id,user_id)
 do update set status='active',removed_at=null;
 return v_channel;
end; $$;

create function app_private.can_manage_channel(p_channel uuid)
returns boolean language plpgsql stable security definer set search_path='' as $$
declare v_c public.channels%rowtype; v_agency uuid; v_role text;
begin
 select * into v_c from public.channels where id=p_channel and archived_at is null;
 if v_c.id is null or auth.uid() is null then return false; end if;
 select agency_id into v_agency from public.organizations where id=v_c.organization_id;
 select role_key into v_role from public.agency_memberships
 where user_id=auth.uid() and agency_id=v_agency and status='active';
 if v_role is null then return false; end if;
 if v_c.kind='project' then
  return app_private.project_permission(v_c.project_id,'channel.manage_members')
   and app_private.can_manage_project_members(v_c.project_id);
 end if;
 return v_role='agency_director' or exists(
  select 1 from public.capability_grants g where g.user_id=auth.uid()
   and g.organization_id=v_c.organization_id and g.capability_key='channel.manage_members'
   and g.revoked_at is null and (g.expires_at is null or g.expires_at>now()));
end; $$;

create function public.add_channel_member(p_channel uuid,p_user uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_c public.channels%rowtype; v_kind text; v_id uuid;
begin
 select * into v_c from public.channels where id=p_channel and archived_at is null for update;
 if v_c.id is null or not app_private.can_manage_channel(p_channel) then
  raise exception using errcode='42501',message='channel_member_forbidden'; end if;
 if v_c.kind='project' then
  if exists(select 1 from public.project_memberships pm where pm.project_id=v_c.project_id
     and pm.user_id=p_user and pm.member_type='client' and pm.status='active')
     and exists(select 1 from public.client_memberships cm where cm.organization_id=v_c.organization_id
      and cm.user_id=p_user and cm.status='active') then v_kind:='client';
  elsif exists(select 1 from public.project_memberships pm where pm.project_id=v_c.project_id
     and pm.user_id=p_user and pm.member_type='internal' and pm.status='active')
     and exists(select 1 from public.agency_memberships am join public.organizations o on o.agency_id=am.agency_id
      where o.id=v_c.organization_id and am.user_id=p_user and am.status='active') then v_kind:='internal';
  end if;
 else
  if exists(select 1 from public.client_memberships cm where cm.organization_id=v_c.organization_id
    and cm.user_id=p_user and cm.status='active') then v_kind:='client';
  elsif exists(select 1 from public.agency_memberships am join public.organizations o on o.agency_id=am.agency_id
    where o.id=v_c.organization_id and am.user_id=p_user and am.status='active') then v_kind:='internal'; end if;
 end if;
 if v_kind is null then raise exception using errcode='42501',message='channel_member_ineligible'; end if;
 insert into public.channel_memberships(channel_id,user_id,member_kind,added_by)
 values(p_channel,p_user,v_kind,auth.uid()) on conflict(channel_id,user_id)
 do update set status='active',removed_at=null,member_kind=excluded.member_kind
 returning id into v_id;
 perform app_private.emit_event('channel.member.added',auth.uid(),'channel_membership',v_id,null,v_c.organization_id,
 gen_random_uuid(),null,jsonb_build_object('channel_id',p_channel,'user_id',p_user));
 return v_id;
end; $$;

create function public.remove_channel_member(p_channel uuid,p_user uuid)
returns void language plpgsql security definer set search_path='' as $$
declare v_c public.channels%rowtype; v_id uuid;
begin
 select * into v_c from public.channels where id=p_channel and archived_at is null for update;
 if v_c.id is null or not app_private.can_manage_channel(p_channel) or v_c.kind='organization'
  and exists(select 1 from public.client_memberships where organization_id=v_c.organization_id
   and user_id=p_user and status='active') then
  raise exception using errcode='42501',message='channel_member_forbidden'; end if;
 update public.channel_memberships set status='removed',removed_at=coalesce(removed_at,now())
 where channel_id=p_channel and user_id=p_user and status='active' returning id into v_id;
 if v_id is not null then
  perform app_private.emit_event('channel.member.removed',auth.uid(),'channel_membership',v_id,null,v_c.organization_id,
   gen_random_uuid(),null,jsonb_build_object('channel_id',p_channel,'user_id',p_user));
 end if;
end; $$;

create function public.channel_members(p_channel uuid)
returns table(user_id uuid,display_name text,member_kind text,status text)
language plpgsql stable security definer set search_path='' as $$
begin
 if not app_private.can_manage_channel(p_channel) then
  raise exception using errcode='42501',message='channel_member_forbidden'; end if;
 return query select m.user_id,coalesce(p.display_name,'Participante'),m.member_kind,m.status
 from public.channel_memberships m join public.profiles p on p.user_id=m.user_id
 where m.channel_id=p_channel order by m.status,p.display_name,m.user_id;
end; $$;

create function public.send_message(p_channel uuid,p_body text,p_client_message_id uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_actor uuid:=auth.uid(); v_c public.channels%rowtype; v_m public.messages%rowtype;
 v_member public.channel_memberships%rowtype; v_event uuid; v_rec record;
 v_agency uuid;
begin
 if v_actor is null or p_client_message_id is null or p_body is null
  or char_length(btrim(p_body)) not between 1 and 4000 then
  raise exception using errcode='22023',message='invalid_message'; end if;
 perform pg_advisory_xact_lock(hashtextextended(v_actor::text||p_client_message_id::text,0));
 select * into v_m from public.messages where author_user_id=v_actor and client_message_id=p_client_message_id;
 if v_m.id is not null then
  if v_m.channel_id<>p_channel or v_m.body<>btrim(p_body) then
   raise exception using errcode='22023',message='idempotency_key_conflict'; end if;
  return v_m.id;
 end if;
 select * into v_c from public.channels where id=p_channel and archived_at is null for share;
 select * into v_member from public.channel_memberships where channel_id=p_channel and user_id=v_actor for share;
 if v_c.id is null or v_member.id is null or v_member.status<>'active' then
  raise exception using errcode='42501',message='message_send_forbidden'; end if;
 if v_member.member_kind='client' then
  perform 1 from public.client_memberships where user_id=v_actor and organization_id=v_c.organization_id
   and status='active' for share;
  if not found then raise exception using errcode='42501',message='message_send_forbidden'; end if;
  if v_c.kind='project' then
   perform 1 from public.project_memberships where project_id=v_c.project_id and user_id=v_actor
    and member_type='client' and status='active' for share;
   if not found then raise exception using errcode='42501',message='message_send_forbidden'; end if;
  end if;
 else
  perform 1 from public.agency_memberships am join public.organizations o on o.agency_id=am.agency_id
   where o.id=v_c.organization_id and am.user_id=v_actor and am.status='active' for share of am;
  if not found then raise exception using errcode='42501',message='message_send_forbidden'; end if;
  if v_c.kind='project' then
   perform 1 from public.project_memberships where project_id=v_c.project_id and user_id=v_actor
    and member_type='internal' and status='active' for share;
   if not found and not exists(select 1 from public.agency_memberships am
    join public.organizations o on o.agency_id=am.agency_id where o.id=v_c.organization_id
     and am.user_id=v_actor and am.status='active' and am.role_key='agency_director') then
    raise exception using errcode='42501',message='message_send_forbidden'; end if;
  end if;
 end if;
 if not app_private.channel_access(p_channel,v_actor) then
  raise exception using errcode='42501',message='message_send_forbidden'; end if;
 insert into public.messages(channel_id,author_user_id,client_message_id,body)
 values(p_channel,v_actor,p_client_message_id,btrim(p_body)) returning * into v_m;
 select o.agency_id into v_agency from public.organizations o where o.id=v_c.organization_id;
 v_event:=app_private.emit_event('message.sent',v_actor,'message',v_m.id,v_agency,
  v_c.organization_id,p_client_message_id,p_client_message_id,jsonb_build_object('channel_id',p_channel));
 for v_rec in select m.user_id from public.channel_memberships m
  where m.channel_id=p_channel and m.status='active' and m.user_id<>v_actor
   and app_private.channel_access(p_channel,m.user_id)
   and coalesce((select np.messages from public.notification_preferences np where np.user_id=m.user_id),true)
 loop
  insert into public.notifications(recipient_id,domain_event_id,kind,project_id,channel_id,message_id)
  values(v_rec.user_id,v_event,'message_received',v_c.project_id,p_channel,v_m.id)
  on conflict(recipient_id,domain_event_id,kind) do nothing;
 end loop;
 return v_m.id;
end; $$;

create function public.channel_messages(p_channel uuid,p_limit integer default 30,
 p_before_at timestamptz default null,p_before_id uuid default null)
returns table(id uuid,channel_id uuid,author_user_id uuid,author_name text,
 body text,created_at timestamptz,client_message_id uuid)
language plpgsql stable security definer set search_path='' as $$
begin
 if not app_private.channel_access(p_channel) then
  raise exception using errcode='42501',message='channel_read_forbidden'; end if;
 return query select m.id,m.channel_id,m.author_user_id,coalesce(p.display_name,'Participante'),
  m.body,m.created_at,m.client_message_id
 from public.messages m join public.profiles p on p.user_id=m.author_user_id where m.channel_id=p_channel
  and (p_before_at is null or (m.created_at,m.id)<(p_before_at,p_before_id))
 order by m.created_at desc,m.id desc limit greatest(1,least(coalesce(p_limit,30),50));
end; $$;

create function public.my_channels()
returns table(id uuid,kind text,organization_id uuid,project_id uuid,label text,
 last_message_at timestamptz,last_message_preview text,unread_count bigint)
language sql stable security definer set search_path='' as $$
 select c.id,c.kind,c.organization_id,c.project_id,
  case when c.kind='organization' then o.name||' · General' else p.name end,
  lm.created_at,left(lm.body,120),
  (select count(*) from public.messages m where m.channel_id=c.id and m.author_user_id<>auth.uid()
   and m.created_at>coalesce(cm.last_read_at,cm.created_at))
 from public.channel_memberships cm join public.channels c on c.id=cm.channel_id
 join public.organizations o on o.id=c.organization_id
 left join public.projects p on p.id=c.project_id
 left join lateral (select m.created_at,m.body from public.messages m where m.channel_id=c.id
  order by m.created_at desc,m.id desc limit 1) lm on true
 where cm.user_id=auth.uid() and cm.status='active' and app_private.channel_access(c.id)
 order by lm.created_at desc nulls last,c.created_at desc;
$$;

create function public.mark_channel_read(p_channel uuid)
returns void language plpgsql security definer set search_path='' as $$
declare v_latest timestamptz;
begin
 if not app_private.channel_access(p_channel) then
  raise exception using errcode='42501',message='channel_read_forbidden'; end if;
 select max(created_at) into v_latest from public.messages where channel_id=p_channel;
 update public.channel_memberships set last_read_at=greatest(coalesce(last_read_at,'-infinity'::timestamptz),
  coalesce(v_latest,now())) where channel_id=p_channel and user_id=auth.uid() and status='active';
end; $$;

create function public.mark_all_notifications_read()
returns integer language plpgsql security definer set search_path='' as $$
declare v_count integer;
begin
 if auth.uid() is null then raise exception using errcode='42501',message='notification_forbidden'; end if;
 update public.notifications set read_at=now() where recipient_id=auth.uid() and read_at is null;
 get diagnostics v_count=row_count;
 return v_count;
end; $$;

drop policy notifications_read_self on public.notifications;
create policy notifications_read_self on public.notifications for select to authenticated
 using(recipient_id=(select auth.uid()) and
  (kind='message_received' and app_private.channel_access(channel_id)
   or kind<>'message_received' and
    (app_private.client_project_access(project_id) or app_private.project_permission(project_id,'project.view'))));

alter table public.channels enable row level security;
alter table public.channels force row level security;
create policy channels_read_members on public.channels for select to authenticated
 using(app_private.channel_access(id));
alter table public.channel_memberships enable row level security;
alter table public.channel_memberships force row level security;
create policy channel_memberships_read_self on public.channel_memberships for select to authenticated
 using(user_id=(select auth.uid()) and app_private.channel_access(channel_id));
alter table public.messages enable row level security;
alter table public.messages force row level security;
create policy messages_read_members on public.messages for select to authenticated
 using(app_private.channel_access(channel_id));
alter table public.notification_preferences enable row level security;
alter table public.notification_preferences force row level security;
create policy notification_preferences_read_self on public.notification_preferences for select to authenticated
 using(user_id=(select auth.uid()));
create policy notification_preferences_insert_self on public.notification_preferences for insert to authenticated
 with check(user_id=(select auth.uid()));
create policy notification_preferences_update_self on public.notification_preferences for update to authenticated
 using(user_id=(select auth.uid())) with check(user_id=(select auth.uid()));
alter table public.notification_outbox enable row level security;
alter table public.notification_outbox force row level security;
revoke all on public.channels,public.channel_memberships,public.messages,
 public.notification_preferences,public.notification_outbox from public,anon,authenticated;
grant select on public.channels,public.channel_memberships,public.messages to authenticated;
grant select,insert,update on public.notification_preferences to authenticated;
revoke all on function app_private.channel_access(uuid,uuid),app_private.channel_access(uuid),
 app_private.ensure_general_channel(),app_private.sync_general_channel_member(),
 app_private.sync_director_channel_member(),app_private.can_manage_channel(uuid),
 app_private.apply_notification_preferences(),app_private.record_notification_intent(),
 app_private.enrich_notification_context()
 from public,anon,authenticated,service_role;
grant execute on function app_private.channel_access(uuid) to authenticated;
revoke all on function public.create_project_channel(uuid),public.add_channel_member(uuid,uuid),
 public.remove_channel_member(uuid,uuid),public.send_message(uuid,text,uuid),
 public.channel_members(uuid),
 public.channel_messages(uuid,integer,timestamptz,uuid),public.my_channels(),
 public.mark_channel_read(uuid),public.mark_all_notifications_read() from public,anon;
grant execute on function public.create_project_channel(uuid),public.add_channel_member(uuid,uuid),
 public.remove_channel_member(uuid,uuid),public.send_message(uuid,text,uuid),
 public.channel_members(uuid),
 public.channel_messages(uuid,integer,timestamptz,uuid),public.my_channels(),
 public.mark_channel_read(uuid),public.mark_all_notifications_read() to authenticated;

-- Postgres Changes sends only records that pass the subscribing user's SELECT policy.
alter publication supabase_realtime add table public.messages;
alter publication supabase_realtime add table public.notifications;
