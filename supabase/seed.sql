-- Local development data. Loaded by `supabase start` and `supabase db reset`, never by
-- `supabase db push`, so none of this reaches the hosted project.
--
-- Test accounts (password for all: password123)
--   admin@franciscan.edu     admin
--   faculty@franciscan.edu   faculty
--   student1@franciscan.edu  student, public profile
--   student2@franciscan.edu  student, private profile

-- Local-only password for the server-side read role. Never reuse it on the hosted project.
alter role web_reader with login password 'web_reader_local';

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change
)
select
  '00000000-0000-0000-0000-000000000000', u.id, 'authenticated', 'authenticated', u.email,
  extensions.crypt('password123', extensions.gen_salt('bf')), now(),
  '{"provider": "email", "providers": ["email"]}', jsonb_build_object('full_name', u.full_name), now(), now(),
  '', '', '', ''
from (values
  ('00000000-0000-4000-8000-000000000001'::uuid, 'admin@franciscan.edu', 'Avery Admin'),
  ('00000000-0000-4000-8000-000000000002'::uuid, 'faculty@franciscan.edu', 'Pat Faculty'),
  ('00000000-0000-4000-8000-000000000003'::uuid, 'student1@franciscan.edu', 'Sam Student'),
  ('00000000-0000-4000-8000-000000000004'::uuid, 'student2@franciscan.edu', 'Alex Student')
) as u (id, email, full_name);

insert into auth.identities (provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
select u.id::text, u.id, jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true),
  'email', now(), now(), now()
from auth.users u;

-- The sign-up trigger created a private student profile for each account; fill them in.
update public.profiles p set
  role = s.role::public.app_role,
  headline = s.headline,
  bio = s.bio,
  major = s.major,
  graduation_year = s.graduation_year,
  is_public = s.is_public
from (values
  ('00000000-0000-4000-8000-000000000001'::uuid, 'admin', 'Department web administrator', '', null, null, false),
  ('00000000-0000-4000-8000-000000000002'::uuid, 'faculty', 'Professor of Computer Science', 'Teaches algorithms and advises student projects.', null, null, true),
  ('00000000-0000-4000-8000-000000000003'::uuid, 'student', 'Computer Science, Class of 2027', 'Backend developer who likes databases.', 'Computer Science', 2027, true),
  ('00000000-0000-4000-8000-000000000004'::uuid, 'student', 'Software Engineering, Class of 2028', 'Working on robotics.', 'Software Engineering', 2028, false)
) as s (id, role, headline, bio, major, graduation_year, is_public)
where p.id = s.id;

insert into public.projects (id, slug, title, summary, description, status, publish_state, is_featured, tags, started_on, ended_on, created_by)
values
  ('10000000-0000-4000-8000-000000000001', 'department-website', 'Department Website',
   'The site you are looking at, built by the Algorithms class.',
   'A **Next.js** site on Cloudflare backed by Supabase.',
   'ongoing', 'published', true, '{web,databases}', '2026-09-01', null,
   '00000000-0000-4000-8000-000000000002'),
  ('10000000-0000-4000-8000-000000000002', 'campus-robot', 'Campus Delivery Robot',
   'A small robot that carries packages across campus.',
   'Built in the engineering lab over two semesters.',
   'completed', 'published', false, '{robotics,embedded}', '2025-09-01', '2026-05-01',
   '00000000-0000-4000-8000-000000000002'),
  ('10000000-0000-4000-8000-000000000003', 'study-group-finder', 'Study Group Finder',
   'Match students into study groups by course.',
   'Still a draft: only its team and faculty can see it.',
   'proposed', 'draft', false, '{web,mobile}', null, null,
   '00000000-0000-4000-8000-000000000003'),
  ('10000000-0000-4000-8000-000000000004', 'lab-sensor-network', 'Lab Sensor Network',
   'Temperature and humidity sensors for the labs.',
   'Waiting for faculty review before it goes public.',
   'ongoing', 'in_review', false, '{embedded,iot}', '2026-09-15', null,
   '00000000-0000-4000-8000-000000000004');

insert into public.project_members (project_id, profile_id, role_title, term, can_edit, sort_order)
values
  ('10000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000002', 'Faculty advisor', 'Fall 2026', true, 0),
  ('10000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000003', 'Backend developer', 'Fall 2026', true, 1),
  ('10000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000004', 'Frontend developer', 'Fall 2026', false, 2),
  ('10000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000004', 'Hardware lead', 'Spring 2026', true, 0),
  ('10000000-0000-4000-8000-000000000003', '00000000-0000-4000-8000-000000000003', 'Project lead', 'Fall 2026', true, 0),
  ('10000000-0000-4000-8000-000000000004', '00000000-0000-4000-8000-000000000004', 'Project lead', 'Fall 2026', true, 0);

insert into public.posts (slug, title, summary, body, publish_state, published_at, author_id)
values
  ('fall-open-house', 'Fall Open House', 'Tour the labs and meet faculty.',
   'Join us in the engineering building to see student projects.', 'published', '2026-10-01 09:00:00-04',
   '00000000-0000-4000-8000-000000000002'),
  ('spring-showcase-draft', 'Spring Showcase (draft)', 'Not published yet.',
   'Only staff can see this post.', 'draft', null,
   '00000000-0000-4000-8000-000000000002');
