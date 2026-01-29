-- ==========================================
-- SUPABASE SQL SCHEMA
-- Copy and paste this into the Supabase SQL Editor
-- ==========================================

-- 1. Create Profiles Table (Linked to Auth)
create table public.profiles (
  id uuid references auth.users not null primary key,
  name text,
  email text,
  photo_url text,
  phone_number text,
  country text default 'Bangladesh',
  currency text default 'BDT',
  distance_unit text default 'km',
  fuel_unit text default 'liter',
  theme text default 'dark',
  notifications_enabled boolean default true,
  backup_frequency text default 'manual',
  google_drive_connected boolean default false,
  last_backup_date text
);

-- 2. Create Vehicles Table
create table public.vehicles (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users not null,
  name text,
  make text,
  model text,
  year int,
  fuel_type text,
  current_odometer float default 0,
  license_plate text,
  tank_capacity float,
  default_octane int,
  reminders jsonb default '[]'::jsonb,
  created_at timestamp with time zone default timezone('utc'::text, now())
);

-- 3. Create Logs Table (Fuel, Service, Expenses)
create table public.logs (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users not null,
  vehicle_id uuid references public.vehicles(id) on delete cascade,
  type text,
  date text,
  odometer float,
  cost float,
  notes text,
  liters float,
  price_per_liter float,
  full_tank boolean,
  station text,
  fuel_grade text,
  tank_percentage int,
  service_type text,
  parts_details text,
  created_at timestamp with time zone default timezone('utc'::text, now())
);

-- 4. Create Favorites Table (Saved Places)
create table public.favorites (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users not null,
  name text,
  address text,
  lat float,
  lng float,
  type text,
  created_at timestamp with time zone default timezone('utc'::text, now())
);

-- 5. Enable Row Level Security (RLS)
alter table public.profiles enable row level security;
alter table public.vehicles enable row level security;
alter table public.logs enable row level security;
alter table public.favorites enable row level security;

-- 6. Create Security Policies (Users can only access their own data)
create policy "Users can manage own profile" on public.profiles for all using (auth.uid() = id);
create policy "Users can manage own vehicles" on public.vehicles for all using (auth.uid() = user_id);
create policy "Users can manage own logs" on public.logs for all using (auth.uid() = user_id);
create policy "Users can manage own favorites" on public.favorites for all using (auth.uid() = user_id);

-- 7. Create Trigger to automatically create a Profile on User Signup
create or replace function public.handle_new_user() 
returns trigger as $$
begin
  insert into public.profiles (id, email, name)
  values (new.id, new.email, new.raw_user_meta_data->>'name');
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
