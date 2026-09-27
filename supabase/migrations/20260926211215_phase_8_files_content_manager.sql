-- Phase 8: project-scoped private assets. A version receives links only at submission.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('project-files','project-files',false,52428800,array[
 'image/jpeg','image/png','image/webp','video/mp4','video/quicktime','application/pdf',
 'application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document',
 'application/vnd.ms-excel','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
 'application/vnd.ms-powerpoint','application/vnd.openxmlformats-officedocument.presentationml.presentation'
])
on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,
 allowed_mime_types=excluded.allowed_mime_types;
insert into public.capabilities(key,description,resource_scope_required) values
 ('file.view','Read private files in an authorized Project.',true),
 ('file.upload','Upload a private file to an authorized Project.',true),
 ('file.link','Link a ready file to editorial work or a submission.',true),
 ('file.archive','Archive a Project file.',true),
 ('file.delete_permanently','Explicitly remove an unreferenced private file.',true);
insert into public.role_capabilities(role_key,capability_key)
select 'agency_director',key from public.capabilities where key like 'file.%';
insert into public.role_capabilities(role_key,capability_key) values
 ('project_manager','file.view'),('project_manager','file.upload'),('project_manager','file.link'),('project_manager','file.archive'),
 ('contributor','file.view'),('contributor','file.upload'),('contributor','file.link');

create table public.file_assets (
 id uuid primary key default gen_random_uuid(),
 project_id uuid not null references public.projects(id) on delete restrict,
 bucket_id text not null default 'project-files' check(bucket_id='project-files'),
 object_path text not null unique,
 original_filename text not null check(char_length(btrim(original_filename)) between 1 and 240),
 mime_type text not null,
 size_bytes bigint not null check(size_bytes between 1 and 52428800),
 uploaded_by uuid not null references public.profiles(user_id) on delete restrict,
 status text not null default 'pending' check(status in ('pending','ready','archived','deleting','deleted')),
 created_at timestamptz not null default now(),
 finalized_at timestamptz,
 archived_at timestamptz,
 deleted_at timestamptz,
 unique(id,project_id),
 constraint file_asset_path_check check(object_path=project_id::text||'/'||id::text),
 constraint file_asset_state_check check(
   (status='pending' and finalized_at is null and archived_at is null and deleted_at is null)
   or (status='ready' and finalized_at is not null and archived_at is null and deleted_at is null)
   or (status='archived' and finalized_at is not null and archived_at is not null and deleted_at is null)
   or (status='deleting' and finalized_at is not null and deleted_at is null)
   or (status='deleted' and finalized_at is not null and deleted_at is not null))
);
create index file_assets_project_listing_idx on public.file_assets(project_id,status,created_at desc,id);
create index file_assets_pending_idx on public.file_assets(created_at) where status='pending';
create index file_assets_uploaded_by_idx on public.file_assets(uploaded_by);

create table public.project_files (
 project_id uuid not null references public.projects(id) on delete restrict,
 asset_id uuid not null unique,
 linked_by uuid not null references public.profiles(user_id) on delete restrict,
 linked_at timestamptz not null default now(),
 primary key(project_id,asset_id),
 foreign key(asset_id,project_id) references public.file_assets(id,project_id) on delete restrict
);
create index project_files_linked_by_idx on public.project_files(linked_by);

alter table public.editorial_items add constraint editorial_items_id_project_unique unique(id,project_id);
create table public.content_asset_links (
 editorial_item_id uuid not null,
 asset_id uuid not null,
 project_id uuid not null,
 linked_by uuid not null references public.profiles(user_id) on delete restrict,
 linked_at timestamptz not null default now(),
 primary key(editorial_item_id,asset_id),
 foreign key(editorial_item_id,project_id) references public.editorial_items(id,project_id) on delete restrict,
 foreign key(asset_id,project_id) references public.file_assets(id,project_id) on delete restrict
);
create index content_asset_links_asset_idx on public.content_asset_links(asset_id);
create index content_asset_links_linked_by_idx on public.content_asset_links(linked_by);

create table public.deliverable_files (
 deliverable_version_id uuid not null references public.deliverable_versions(id) on delete restrict,
 asset_id uuid not null references public.file_assets(id) on delete restrict,
 ordinal integer not null check(ordinal between 1 and 20),
 primary key(deliverable_version_id,asset_id),
 unique(deliverable_version_id,ordinal)
);
create index deliverable_files_asset_idx on public.deliverable_files(asset_id);
create function app_private.check_deliverable_file()
returns trigger language plpgsql set search_path='' as $$
begin
 if not exists(select 1 from public.deliverable_versions dv
  join public.deliverables d on d.id=dv.deliverable_id
  join public.file_assets fa on fa.id=new.asset_id and fa.project_id=d.project_id and fa.status='ready'
  where dv.id=new.deliverable_version_id)
 then raise exception using errcode='23514',message='invalid_deliverable_file_scope'; end if;
 return new;
end; $$;
create trigger deliverable_files_scope before insert on public.deliverable_files
for each row execute function app_private.check_deliverable_file();
create trigger deliverable_files_immutable before update or delete on public.deliverable_files
for each row execute function app_private.phase7_immutable();

create function app_private.file_mime_allowed(p_mime text,p_name text)
returns boolean language sql immutable set search_path='' as $$
 select case lower(p_mime)
  when 'image/jpeg' then lower(p_name) ~ '\.(jpg|jpeg)$'
  when 'image/png' then lower(p_name) ~ '\.png$'
  when 'image/webp' then lower(p_name) ~ '\.webp$'
  when 'video/mp4' then lower(p_name) ~ '\.mp4$'
  when 'video/quicktime' then lower(p_name) ~ '\.mov$'
  when 'application/pdf' then lower(p_name) ~ '\.pdf$'
  when 'application/msword' then lower(p_name) ~ '\.doc$'
  when 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' then lower(p_name) ~ '\.docx$'
  when 'application/vnd.ms-excel' then lower(p_name) ~ '\.xls$'
  when 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' then lower(p_name) ~ '\.xlsx$'
  when 'application/vnd.ms-powerpoint' then lower(p_name) ~ '\.ppt$'
  when 'application/vnd.openxmlformats-officedocument.presentationml.presentation' then lower(p_name) ~ '\.pptx$'
  else false end;
$$;

create function app_private.file_event(p_asset uuid,p_type text)
returns void language plpgsql security definer set search_path='' as $$
declare v_asset public.file_assets%rowtype; v_agency uuid; v_org uuid;
begin
 select * into v_asset from public.file_assets where id=p_asset;
 select o.agency_id,o.id into v_agency,v_org from public.projects p
 join public.brands b on b.id=p.brand_id join public.organizations o on o.id=b.organization_id
 where p.id=v_asset.project_id;
 perform app_private.emit_event(p_type,auth.uid(),'file_asset',p_asset,v_agency,v_org,
   gen_random_uuid(),null,jsonb_build_object('project_id',v_asset.project_id));
end; $$;

create function public.prepare_file_asset(project_id uuid,original_filename text,mime_type text,size_bytes bigint)
returns public.file_assets language plpgsql security definer set search_path='' as $$
declare v_asset public.file_assets%rowtype; v_id uuid:=gen_random_uuid();
begin
 if auth.uid() is null or project_id is null or size_bytes is null or size_bytes not between 1 and 52428800
   or original_filename is null or char_length(btrim(original_filename)) not between 1 and 240
   or original_filename ~ '[\\/[:cntrl:]]' or not app_private.file_mime_allowed(mime_type,original_filename)
   or not app_private.project_permission(project_id,'file.upload')
   or not exists(select 1 from public.projects p where p.id=project_id and p.archived_at is null)
 then raise exception using errcode='42501',message='file_prepare_forbidden'; end if;
 insert into public.file_assets(id,project_id,object_path,original_filename,mime_type,size_bytes,uploaded_by)
 values(v_id,project_id,project_id::text||'/'||v_id::text,btrim(original_filename),mime_type,size_bytes,auth.uid())
 returning * into v_asset;
 return v_asset;
end; $$;

create function public.finalize_file_asset(asset_id uuid)
returns public.file_assets language plpgsql security definer set search_path='' as $$
declare v_asset public.file_assets%rowtype; v_object storage.objects%rowtype;
begin
 select * into v_asset from public.file_assets where id=asset_id for update;
 if auth.uid() is null or v_asset.id is null or v_asset.uploaded_by<>auth.uid()
   or not app_private.project_permission(v_asset.project_id,'file.upload')
 then raise exception using errcode='42501',message='file_finalize_forbidden'; end if;
 if v_asset.status='ready' then return v_asset; end if;
 if v_asset.status<>'pending' then raise exception using errcode='22023',message='file_not_pending'; end if;
 select * into v_object from storage.objects where bucket_id=v_asset.bucket_id and name=v_asset.object_path;
 if v_object.id is null or lower(coalesce(v_object.metadata->>'mimetype',''))<>lower(v_asset.mime_type)
   or (v_object.metadata->>'size')::bigint is distinct from v_asset.size_bytes
 then raise exception using errcode='22023',message='file_object_mismatch'; end if;
 update public.file_assets set status='ready',finalized_at=now() where id=asset_id returning * into v_asset;
 insert into public.project_files(project_id,asset_id,linked_by) values(v_asset.project_id,asset_id,auth.uid());
 perform app_private.file_event(asset_id,'file.upload.finalized');
 return v_asset;
end; $$;

create function public.archive_file_asset(asset_id uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_asset public.file_assets%rowtype;
begin
 select * into v_asset from public.file_assets where id=asset_id for update;
 if auth.uid() is null or v_asset.id is null or not app_private.project_permission(v_asset.project_id,'file.archive')
 then raise exception using errcode='42501',message='file_archive_forbidden'; end if;
 if v_asset.status='archived' then return asset_id; end if;
 if v_asset.status<>'ready' then raise exception using errcode='22023',message='file_not_ready'; end if;
 update public.file_assets set status='archived',archived_at=now() where id=asset_id;
 perform app_private.file_event(asset_id,'file.archived');
 return asset_id;
end; $$;

create function public.link_content_asset(item_id uuid,asset_id uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_item public.editorial_items%rowtype; v_asset public.file_assets%rowtype; v_inserted integer;
begin
 select * into v_item from public.editorial_items where id=item_id;
 select * into v_asset from public.file_assets where id=asset_id for share;
 if auth.uid() is null or v_item.id is null or v_asset.id is null
   or v_item.project_id<>v_asset.project_id or v_item.archived_at is not null or v_asset.status<>'ready'
   or not app_private.project_permission(v_item.project_id,'file.link')
   or not app_private.project_permission(v_item.project_id,'editorial.view')
 then raise exception using errcode='42501',message='content_asset_link_forbidden'; end if;
 insert into public.content_asset_links(editorial_item_id,asset_id,project_id,linked_by)
 values(item_id,asset_id,v_item.project_id,auth.uid()) on conflict do nothing;
 get diagnostics v_inserted=row_count;
 if v_inserted>0 then perform app_private.file_event(asset_id,'content.asset.linked'); end if;
 return asset_id;
end; $$;

-- Rename the Phase 7 command and keep its checked, immutable creation transaction intact.
alter function public.submit_deliverable_version(uuid,text,uuid) rename to phase7_submit_deliverable_version;
revoke execute on function public.phase7_submit_deliverable_version(uuid,text,uuid) from public,anon,authenticated;
create function public.submit_deliverable_version(deliverable_id uuid,notes text,idempotency_key uuid,asset_ids uuid[] default '{}')
returns uuid language plpgsql security definer set search_path='' as $$
declare v_project uuid; v_version uuid; v_existing uuid; v_count integer; v_distinct integer;
begin
 if auth.uid() is null or asset_ids is null or cardinality(asset_ids)>20 or array_position(asset_ids,null) is not null
 then raise exception using errcode='22023',message='invalid_submission_assets'; end if;
 select d.project_id into v_project from public.deliverables d where d.id=deliverable_id;
 if v_project is null or not app_private.project_permission(v_project,'file.link')
 then raise exception using errcode='42501',message='file_link_forbidden'; end if;
 -- Serialize retries before comparing their file sets, including concurrent empty sets.
 perform 1 from public.work_items wi join public.deliverables d on d.work_item_id=wi.id
  where d.id=deliverable_id for update of wi;
 select count(*),count(distinct x.id) into v_count,v_distinct from unnest(asset_ids) x(id);
 if v_count<>v_distinct then raise exception using errcode='22023',message='duplicate_submission_asset'; end if;
 select dv.id into v_existing from public.deliverable_versions dv
 where dv.submitted_by=auth.uid() and dv.submission_key=idempotency_key;
 if v_existing is not null and exists(
  select id from unnest(asset_ids) x(id)
  except select df.asset_id from public.deliverable_files df where df.deliverable_version_id=v_existing
  union all
  (select df.asset_id from public.deliverable_files df where df.deliverable_version_id=v_existing
   except select id from unnest(asset_ids) x(id))
 ) then raise exception using errcode='22023',message='idempotency_key_conflict'; end if;
 -- Existing versions retain their original file set even if an asset was archived later.
 if v_existing is not null then
  return public.phase7_submit_deliverable_version(deliverable_id,notes,idempotency_key);
 end if;
 -- Share locks serialize new submissions with archive and delete commands.
 perform 1 from public.file_assets fa where fa.id=any(asset_ids) for share;
 if (select count(*) from public.file_assets fa where fa.id=any(asset_ids)
    and fa.project_id=v_project and fa.status='ready')<>v_count
 then raise exception using errcode='42501',message='submission_asset_forbidden'; end if;
 v_version:=public.phase7_submit_deliverable_version(deliverable_id,notes,idempotency_key);
 insert into public.deliverable_files(deliverable_version_id,asset_id,ordinal)
  select v_version,x.id,x.ordinality::integer from unnest(asset_ids) with ordinality x(id,ordinality);
 if v_count>0 then perform app_private.file_event(asset_ids[1],'deliverable.version.assets_attached'); end if;
 return v_version;
end; $$;

create function app_private.file_director_permission(p_project uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select app_private.project_permission($1,'file.delete_permanently') and exists(
  select 1 from public.projects p
  join public.brands b on b.id=p.brand_id
  join public.organizations o on o.id=b.organization_id
  join public.agency_memberships am on am.agency_id=o.agency_id
  where p.id=$1 and am.user_id=auth.uid() and am.status='active' and am.role_key='agency_director');
$$;

create function public.request_file_permanent_delete(asset_id uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_asset public.file_assets%rowtype;
begin
 select * into v_asset from public.file_assets where id=asset_id for update;
 if auth.uid() is null or v_asset.id is null
   or not app_private.file_director_permission(v_asset.project_id)
   or exists(select 1 from public.deliverable_files df where df.asset_id=v_asset.id)
   or exists(select 1 from public.content_asset_links cal where cal.asset_id=v_asset.id)
 then raise exception using errcode='42501',message='file_delete_forbidden'; end if;
 if v_asset.status not in ('ready','archived','deleting')
 then raise exception using errcode='22023',message='file_delete_invalid_state'; end if;
 if v_asset.status<>'deleting' then
  update public.file_assets set status='deleting' where id=asset_id;
  perform app_private.file_event(asset_id,'file.delete.requested');
 end if;
 return asset_id;
end; $$;

create function public.confirm_file_permanent_delete(asset_id uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_asset public.file_assets%rowtype;
begin
 select * into v_asset from public.file_assets where id=asset_id for update;
 if auth.uid() is null or v_asset.id is null or v_asset.status<>'deleting'
   or not app_private.file_director_permission(v_asset.project_id)
   or exists(select 1 from public.deliverable_files df where df.asset_id=v_asset.id)
   or exists(select 1 from public.content_asset_links cal where cal.asset_id=v_asset.id)
 then raise exception using errcode='42501',message='file_delete_forbidden'; end if;
 if exists(select 1 from storage.objects where bucket_id=v_asset.bucket_id and name=v_asset.object_path)
 then raise exception using errcode='22023',message='file_object_still_present'; end if;
 update public.file_assets set status='deleted',deleted_at=now() where id=asset_id;
 perform app_private.file_event(asset_id,'file.deleted_permanently');
 return asset_id;
end; $$;

create function app_private.file_storage_read(p_bucket text,p_path text)
returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.file_assets fa where fa.bucket_id=p_bucket and fa.object_path=p_path
  and ((fa.status in ('ready','archived') and app_private.project_permission(fa.project_id,'file.view'))
    or (fa.status='deleting' and app_private.file_director_permission(fa.project_id))));
$$;
create function app_private.file_storage_insert(p_bucket text,p_path text)
returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.file_assets fa where fa.bucket_id=p_bucket and fa.object_path=p_path
  and fa.status='pending' and fa.uploaded_by=auth.uid()
  and app_private.project_permission(fa.project_id,'file.upload'));
$$;
create function app_private.file_storage_delete(p_bucket text,p_path text)
returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.file_assets fa where fa.bucket_id=p_bucket and fa.object_path=p_path
  and fa.status='deleting' and not exists(select 1 from public.deliverable_files df where df.asset_id=fa.id)
  and not exists(select 1 from public.content_asset_links cal where cal.asset_id=fa.id)
  and app_private.file_director_permission(fa.project_id));
$$;

create function public.file_director_access_allowed(project_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select app_private.file_director_permission($1);
$$;
create function public.file_object_read_allowed(bucket text,path text)
returns boolean language sql stable security definer set search_path='' as $$
 select app_private.file_storage_read($1,$2);
$$;
create function public.file_object_insert_allowed(bucket text,path text)
returns boolean language sql stable security definer set search_path='' as $$
 select app_private.file_storage_insert($1,$2);
$$;
create function public.file_object_delete_allowed(bucket text,path text)
returns boolean language sql stable security definer set search_path='' as $$
 select app_private.file_storage_delete($1,$2);
$$;

alter table public.file_assets enable row level security;
alter table public.file_assets force row level security;
alter table public.project_files enable row level security;
alter table public.project_files force row level security;
alter table public.content_asset_links enable row level security;
alter table public.content_asset_links force row level security;
alter table public.deliverable_files enable row level security;
alter table public.deliverable_files force row level security;
create policy file_assets_read on public.file_assets for select to authenticated
 using ((public.project_access_allowed(project_id,'file.view') and
  (status in ('ready','archived') or (status='pending' and uploaded_by=(select auth.uid()))))
  or (status='deleting' and public.file_director_access_allowed(project_id)));
create policy project_files_read on public.project_files for select to authenticated
 using (public.project_access_allowed(project_id,'file.view'));
create policy content_asset_links_read on public.content_asset_links for select to authenticated
 using (exists(select 1 from public.editorial_items ei join public.file_assets fa
   on fa.id=asset_id and fa.project_id=ei.project_id where ei.id=editorial_item_id
   and public.project_access_allowed(ei.project_id,'editorial.view')
   and public.project_access_allowed(ei.project_id,'file.view')));
create policy deliverable_files_read on public.deliverable_files for select to authenticated
 using (exists(select 1 from public.deliverable_versions dv join public.deliverables d
   on d.id=dv.deliverable_id join public.file_assets fa on fa.id=asset_id and fa.project_id=d.project_id
   where dv.id=deliverable_version_id and public.deliverable_access_allowed(d.id)
   and public.project_access_allowed(d.project_id,'file.view')));
revoke all on public.file_assets,public.project_files,public.content_asset_links,public.deliverable_files from anon,authenticated;
grant select on public.file_assets,public.project_files,public.content_asset_links,public.deliverable_files to authenticated;

create policy project_files_object_read on storage.objects for select to authenticated
 using (storage.allow_any_operation(array[
   'object.list','object.list_v2','object.get_authenticated','object.get_authenticated_info',
   'object.head_authenticated_info','object.delete','object.delete_many'
 ]) and public.file_object_read_allowed(bucket_id,name));
create policy project_files_object_insert on storage.objects for insert to authenticated
 with check (public.file_object_insert_allowed(bucket_id,name));
create policy project_files_object_delete on storage.objects for delete to authenticated
 using (public.file_object_delete_allowed(bucket_id,name));
-- No UPDATE policy: upsert, replacement, and move fail even for a Director.

revoke all on function app_private.check_deliverable_file(),app_private.file_mime_allowed(text,text),app_private.file_event(uuid,text),
 app_private.file_storage_read(text,text),app_private.file_storage_insert(text,text),
 app_private.file_storage_delete(text,text),app_private.file_director_permission(uuid) from public,anon,authenticated,service_role;
revoke execute on function public.file_object_read_allowed(text,text),
 public.file_object_insert_allowed(text,text),public.file_object_delete_allowed(text,text),
 public.file_director_access_allowed(uuid) from public,anon;
grant execute on function public.file_object_read_allowed(text,text),
 public.file_object_insert_allowed(text,text),public.file_object_delete_allowed(text,text),
 public.file_director_access_allowed(uuid) to authenticated;
revoke execute on function public.prepare_file_asset(uuid,text,text,bigint),
 public.finalize_file_asset(uuid),public.archive_file_asset(uuid),public.link_content_asset(uuid,uuid),
 public.submit_deliverable_version(uuid,text,uuid,uuid[]),public.request_file_permanent_delete(uuid),
 public.confirm_file_permanent_delete(uuid) from public,anon;
grant execute on function public.prepare_file_asset(uuid,text,text,bigint),
 public.finalize_file_asset(uuid),public.archive_file_asset(uuid),public.link_content_asset(uuid,uuid),
 public.submit_deliverable_version(uuid,text,uuid,uuid[]),public.request_file_permanent_delete(uuid),
 public.confirm_file_permanent_delete(uuid) to authenticated;
