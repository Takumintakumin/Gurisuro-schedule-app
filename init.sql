create table if not exists users (
  id bigserial primary key,
  username text unique not null,
  password text not null,
  role text default 'user'
);

create table if not exists events (
  id bigserial primary key,
  date text not null,
  label text,
  icon text,
  start_time text,
  end_time text
);

insert into users (username, password, role)
values ('admin', 'admin123', 'admin')
on conflict (username) do nothing;
