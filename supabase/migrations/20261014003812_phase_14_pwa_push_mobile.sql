-- Phase 14: delivery channel for existing notifications, never a second domain.
alter table public.notification_preferences add column push_enabled boolean not null default false;

create table app_private.push_subscriptions (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references public.profiles(user_id) on delete restrict,
 session_id uuid not null references auth.sessions(id) on delete cascade,
 endpoint text not null unique check(length(endpoint) between 20 and 2048),
 p256dh text not null check(p256dh ~ '^[A-Za-z0-9_-]{87}$'),
 auth_key text not null check(auth_key ~ '^[A-Za-z0-9_-]{22}$'),
 surface text not null check(surface in ('app','portal')),
 generation integer not null default 1,
 device_token uuid not null,
 active boolean not null default true,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 last_success_at timestamptz,
 last_error text check(last_error in ('gone','rejected','rate_limited','unavailable','timeout','retry_exhausted'))
);
create index push_subscriptions_user_active_idx on app_private.push_subscriptions(user_id) where active;
create index push_subscriptions_session_idx on app_private.push_subscriptions(session_id);
alter table app_private.push_subscriptions enable row level security;
alter table app_private.push_subscriptions force row level security;

create table app_private.push_delivery_outbox (
 id uuid primary key default gen_random_uuid(),
 notification_id uuid not null references public.notifications(id) on delete cascade,
 subscription_id uuid not null references app_private.push_subscriptions(id) on delete cascade,
 generation integer not null,
 status text not null default 'pending' check(status in ('pending','sending','delivered','failed','cancelled')),
 attempts integer not null default 0 check(attempts between 0 and 5),
 available_at timestamptz not null default now(),
 lease_until timestamptz,
 claim_token uuid,
 last_error text check(last_error in ('gone','rejected','rate_limited','unavailable','timeout','retry_exhausted')),
 created_at timestamptz not null default now(),
 delivered_at timestamptz,
 unique(notification_id,subscription_id)
);
create index push_outbox_ready_idx on app_private.push_delivery_outbox(available_at,created_at) where status in ('pending','sending');
create index push_outbox_subscription_idx on app_private.push_delivery_outbox(subscription_id);
alter table app_private.push_delivery_outbox enable row level security;
alter table app_private.push_delivery_outbox force row level security;
revoke all on app_private.push_subscriptions,app_private.push_delivery_outbox from public,anon,authenticated,service_role;

-- Strict provider boundary prevents registering SSRF destinations even by RPC.
create function app_private.valid_push_endpoint(p_endpoint text)
returns boolean language sql immutable set search_path='' as $$
 select length(p_endpoint) between 20 and 2048 and p_endpoint ~
 '^https://(fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|web\.push\.apple\.com|[a-z0-9-]+\.notify\.windows\.com)/[A-Za-z0-9_/?=&.%~-]+$';
$$;
create function app_private.push_session()
returns uuid language plpgsql stable security definer set search_path='' as $$
declare v_session uuid;
begin
 if auth.uid() is null then raise exception 'unauthorized' using errcode='42501'; end if;
 begin v_session:=(auth.jwt()->>'session_id')::uuid;
 exception when invalid_text_representation then raise exception 'unauthorized' using errcode='42501'; end;
 if not exists(select 1 from auth.sessions s where s.id=v_session and s.user_id=auth.uid()
   and (s.not_after is null or s.not_after>now())) then
  raise exception 'unauthorized' using errcode='42501';
 end if;
 return v_session;
end; $$;

create function public.register_push_subscription(p_subscription jsonb,p_surface text)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_session uuid:=app_private.push_session(); v_user uuid:=auth.uid(); v_id uuid;
 v_existing app_private.push_subscriptions%rowtype; v_endpoint text:=p_subscription->>'endpoint';
begin
 if jsonb_typeof(p_subscription)<>'object' or jsonb_typeof(p_subscription->'keys')<>'object'
  or not (p_subscription ?& array['endpoint','keys'])
  or (p_subscription - array['endpoint','keys','expirationTime','device_token'])<>'{}'::jsonb
  or not coalesce(p_subscription->>'device_token' ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$',false)
  or ((p_subscription->'keys') - array['p256dh','auth'])<>'{}'::jsonb
  or not coalesce(app_private.valid_push_endpoint(v_endpoint),false)
  or not coalesce(p_subscription->'keys'->>'p256dh' ~ '^[A-Za-z0-9_-]{87}$',false)
  or not coalesce(p_subscription->'keys'->>'auth' ~ '^[A-Za-z0-9_-]{22}$',false)
  or p_surface not in ('app','portal') or p_surface is null then
  raise exception 'invalid_subscription' using errcode='22023';
 end if;
 if (p_surface='app' and not exists(select 1 from public.agency_memberships where user_id=v_user and status='active'))
  or (p_surface='portal' and not exists(select 1 from public.client_memberships where user_id=v_user and status='active')) then
  raise exception 'surface_forbidden' using errcode='42501';
 end if;
 -- Endpoint lock serializes registration/reassignment across users/devices.
 perform pg_advisory_xact_lock(hashtextextended(v_endpoint,14));
 select * into v_existing from app_private.push_subscriptions where endpoint=v_endpoint for update;
 if found and v_existing.active and v_existing.user_id<>v_user then
  raise exception 'endpoint_owned' using errcode='42501';
 end if;
 if v_existing.id is not null and (v_existing.user_id<>v_user or v_existing.session_id<>v_session
   or not v_existing.active or v_existing.p256dh<>p_subscription->'keys'->>'p256dh'
   or v_existing.auth_key<>p_subscription->'keys'->>'auth' or v_existing.device_token<>(p_subscription->>'device_token')::uuid) then
  update app_private.push_delivery_outbox set status='cancelled',claim_token=null,lease_until=null
   where subscription_id=v_existing.id and status in ('pending','sending');
 end if;
 insert into app_private.push_subscriptions(user_id,session_id,endpoint,p256dh,auth_key,surface,device_token)
 values(v_user,v_session,v_endpoint,p_subscription->'keys'->>'p256dh',p_subscription->'keys'->>'auth',p_surface,(p_subscription->>'device_token')::uuid)
 on conflict(endpoint) do update set user_id=excluded.user_id,session_id=excluded.session_id,
  p256dh=excluded.p256dh,auth_key=excluded.auth_key,surface=excluded.surface,device_token=excluded.device_token,active=true,updated_at=now(),last_error=null,
  generation=app_private.push_subscriptions.generation + case when v_existing.user_id<>v_user
   or v_existing.session_id<>v_session or not v_existing.active or v_existing.p256dh<>excluded.p256dh
   or v_existing.auth_key<>excluded.auth_key or v_existing.device_token<>excluded.device_token then 1 else 0 end
 returning id into v_id;
 insert into public.notification_preferences(user_id,push_enabled) values(v_user,true)
 on conflict(user_id) do update set push_enabled=true,updated_at=now();
 return v_id;
end; $$;

create function public.unregister_push_subscription(p_endpoint text)
returns void language plpgsql security definer set search_path='' as $$
declare v_session uuid:=app_private.push_session();
begin
 update app_private.push_subscriptions set active=false,updated_at=now()
 where endpoint=p_endpoint and user_id=auth.uid() and session_id=v_session;
 update app_private.push_delivery_outbox d set status='cancelled',claim_token=null,lease_until=null
 from app_private.push_subscriptions s where d.subscription_id=s.id and s.endpoint=p_endpoint
 and s.user_id=auth.uid() and s.session_id=v_session and d.status in ('pending','sending');
 if not exists(select 1 from app_private.push_subscriptions where user_id=auth.uid() and active) then
  update public.notification_preferences set push_enabled=false,updated_at=now() where user_id=auth.uid();
 end if;
end; $$;
create function public.push_subscription_status(p_endpoint text,p_device_token uuid default null)
returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from app_private.push_subscriptions s join public.notification_preferences p on p.user_id=s.user_id
 where s.endpoint=p_endpoint and s.device_token=p_device_token and s.user_id=auth.uid() and s.session_id=app_private.push_session() and s.active and p.push_enabled);
$$;

create function app_private.push_eligible(p_notification uuid,p_subscription uuid,p_generation integer)
returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.notifications n
 join app_private.push_subscriptions s on s.user_id=n.recipient_id and s.id=p_subscription
 join auth.sessions a on a.id=s.session_id and a.user_id=s.user_id
 join public.notification_preferences p on p.user_id=s.user_id
 where n.id=p_notification and s.active and s.generation=p_generation and p.push_enabled
  and n.read_at is null and (a.not_after is null or a.not_after>now())
  and case when n.kind='message_received' then p.messages when n.kind='approval_pending' then p.approvals
    else p.deliverable_updates end
  and case when s.surface='app' then exists(select 1 from public.agency_memberships m where m.user_id=s.user_id and m.status='active')
    else exists(select 1 from public.client_memberships m where m.user_id=s.user_id and m.status='active') end);
$$;
create function app_private.enqueue_notification_push()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 insert into app_private.push_delivery_outbox(notification_id,subscription_id,generation)
 select new.id,s.id,s.generation from app_private.push_subscriptions s
 where s.user_id=new.recipient_id and app_private.push_eligible(new.id,s.id,s.generation)
 on conflict(notification_id,subscription_id) do nothing;
 return new;
end; $$;
create trigger notifications_enqueue_push after insert on public.notifications
for each row execute function app_private.enqueue_notification_push();

create function public.push_claim_delivery()
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_delivery app_private.push_delivery_outbox%rowtype;
begin
 if current_setting('request.jwt.claim.role',true) is distinct from 'service_role'
 and coalesce(auth.jwt()->>'role','')<>'service_role' then raise exception 'worker_only' using errcode='42501'; end if;
 update app_private.push_delivery_outbox d set status='cancelled',claim_token=null,lease_until=null
 where d.status in ('pending','sending') and not app_private.push_eligible(d.notification_id,d.subscription_id,d.generation);
 update app_private.push_delivery_outbox set status='failed',last_error='retry_exhausted',claim_token=null,lease_until=null
 where status='sending' and lease_until<now() and attempts>=5;
 select * into v_delivery from app_private.push_delivery_outbox
 where (status='pending' and available_at<=now() or status='sending' and lease_until<now())
 and attempts<5 order by created_at,id for update skip locked limit 1;
 if not found then return null; end if;
 update app_private.push_delivery_outbox set status='sending',attempts=attempts+1,
 claim_token=gen_random_uuid(),lease_until=now()+interval '60 seconds'
 where id=v_delivery.id returning * into v_delivery;
 return jsonb_build_object('id',v_delivery.id,'token',v_delivery.claim_token,'attempt',v_delivery.attempts);
end; $$;
create function public.push_delivery_material(p_delivery uuid,p_token uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_delivery app_private.push_delivery_outbox%rowtype; v_subscription app_private.push_subscriptions%rowtype;
begin
 if coalesce(auth.jwt()->>'role',current_setting('request.jwt.claim.role',true),'')<>'service_role' then
  raise exception 'worker_only' using errcode='42501'; end if;
 select * into v_delivery from app_private.push_delivery_outbox where id=p_delivery and status='sending'
 and claim_token=p_token and lease_until>now();
 if not found or not app_private.push_eligible(v_delivery.notification_id,v_delivery.subscription_id,v_delivery.generation) then
  raise exception 'stale_claim' using errcode='42501'; end if;
 select * into v_subscription from app_private.push_subscriptions where id=v_delivery.subscription_id;
 return jsonb_build_object('subscription',jsonb_build_object('endpoint',v_subscription.endpoint,
  'keys',jsonb_build_object('p256dh',v_subscription.p256dh,'auth',v_subscription.auth_key)),
  'payload',jsonb_build_object('notification_id',v_delivery.notification_id,'surface',v_subscription.surface,
   'device_token',v_subscription.device_token,
   'endpoint_hash',encode(extensions.digest(v_subscription.endpoint,'sha256'),'hex')));
end; $$;
create function public.push_finish_delivery(p_delivery uuid,p_token uuid,p_status integer,p_error text default null)
returns boolean language plpgsql security definer set search_path='' as $$
declare v_delivery app_private.push_delivery_outbox%rowtype; v_error text; v_retry boolean;
begin
 if coalesce(auth.jwt()->>'role',current_setting('request.jwt.claim.role',true),'')<>'service_role' then
  raise exception 'worker_only' using errcode='42501'; end if;
 select * into v_delivery from app_private.push_delivery_outbox where id=p_delivery and status='sending'
 and claim_token=p_token and lease_until>now() for update;
 if not found then return false; end if;
 if not app_private.push_eligible(v_delivery.notification_id,v_delivery.subscription_id,v_delivery.generation) then
  update app_private.push_delivery_outbox set status='cancelled',lease_until=null,claim_token=null where id=p_delivery;
  return false;
 end if;
 if p_status between 200 and 299 then
  update app_private.push_delivery_outbox set status='delivered',delivered_at=now(),last_error=null,lease_until=null,claim_token=null where id=p_delivery;
  update app_private.push_subscriptions set last_success_at=now(),last_error=null where id=v_delivery.subscription_id;
  return true;
 end if;
 v_error:=case when p_status in (404,410) then 'gone' when p_status=429 then 'rate_limited'
  when p_status>=500 then 'unavailable' when p_status is null and p_error='timeout' then 'timeout' else 'rejected' end;
 v_retry:=v_error in ('rate_limited','unavailable','timeout') and v_delivery.attempts<5;
 update app_private.push_delivery_outbox set status=case when v_retry then 'pending' else 'failed' end,
  last_error=case when v_error in ('rate_limited','unavailable','timeout') and not v_retry then 'retry_exhausted' else v_error end,
  available_at=now()+make_interval(secs=>least(3600,30*power(2,v_delivery.attempts-1)::integer)),lease_until=null,claim_token=null where id=p_delivery;
 update app_private.push_subscriptions set active=case when v_error='gone' then false else active end,
  last_error=v_error,updated_at=now() where id=v_delivery.subscription_id;
 if v_error='gone' then
  update app_private.push_delivery_outbox set status='cancelled',lease_until=null,claim_token=null
  where subscription_id=v_delivery.subscription_id and status in ('pending','sending');
 end if;
 return true;
end; $$;

revoke all on function app_private.valid_push_endpoint(text),app_private.push_session(),
 app_private.push_eligible(uuid,uuid,integer),app_private.enqueue_notification_push() from public,anon,authenticated,service_role;
revoke all on function public.register_push_subscription(jsonb,text),public.unregister_push_subscription(text),
 public.push_subscription_status(text,uuid),public.push_claim_delivery(),public.push_delivery_material(uuid,uuid),
 public.push_finish_delivery(uuid,uuid,integer,text) from public,anon,authenticated,service_role;
grant execute on function public.register_push_subscription(jsonb,text),public.unregister_push_subscription(text),
 public.push_subscription_status(text,uuid) to authenticated;
grant execute on function public.push_claim_delivery(),public.push_delivery_material(uuid,uuid),
 public.push_finish_delivery(uuid,uuid,integer,text) to service_role;
