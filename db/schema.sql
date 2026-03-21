create extension if not exists pgcrypto;

create table if not exists saved_models (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  object_url text not null
);
