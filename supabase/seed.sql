-- Local development data. Loaded by `supabase start` and `supabase db reset`, never by
-- `supabase db push`, so none of this reaches a hosted project. Names and organizations are
-- made up.
--
-- Test accounts (password for all: password123)
--   admin@franciscan.edu              admin
--   reviewer@franciscan.edu           reviewer (TA)
--   faculty@franciscan.edu            reviewer, and the faculty record "Dr. Pat Faculty"
--   student1@franciscan.edu           student, listed in the directory, shows an email address
--   student2@franciscan.edu           student, not listed; has asked to be added
--   student3@student.franciscan.edu   student, listed

-- Local-only password for the server-side read role. Never reuse it on a hosted project.
alter role web_reader with login password 'web_reader_local';

-- Lets the hourly carousel job reach the local function while `supabase functions serve` runs.
-- The secret matches supabase/functions/.env.example.
select vault.create_secret('http://supabase_kong_CSC-Dept-Website:8000/functions/v1/carousel', 'carousel_function_url');
select vault.create_secret('local-carousel-secret', 'carousel_cron_secret');

-- Accounts -------------------------------------------------------------------------------------

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change
)
select
  '00000000-0000-0000-0000-000000000000', u.id, 'authenticated', 'authenticated', u.email,
  extensions.crypt('password123', extensions.gen_salt('bf')), now(),
  '{"provider": "email", "providers": ["email"]}', jsonb_build_object('full_name', u.name), now(), now(),
  '', '', '', ''
from (values
  ('00000000-0000-4000-8000-000000000001'::uuid, 'admin@franciscan.edu', 'Avery Admin'),
  ('00000000-0000-4000-8000-000000000002'::uuid, 'reviewer@franciscan.edu', 'Riley Reviewer'),
  ('00000000-0000-4000-8000-000000000003'::uuid, 'faculty@franciscan.edu', 'Pat Faculty'),
  ('00000000-0000-4000-8000-000000000011'::uuid, 'student1@franciscan.edu', 'Sam Student'),
  ('00000000-0000-4000-8000-000000000012'::uuid, 'student2@franciscan.edu', 'Alex Student'),
  ('00000000-0000-4000-8000-000000000013'::uuid, 'student3@student.franciscan.edu', 'Jordan Student')
) as u (id, email, name);

insert into auth.identities (provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
select u.id::text, u.id, jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true),
  'email', now(), now(), now()
from auth.users u;

update public.profiles set role = 'admin' where id = '00000000-0000-4000-8000-000000000001';
update public.profiles set role = 'reviewer'
where id in ('00000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000003');

-- Consent comes before the fields it allows.
insert into public.consents (student_id, scope) values
  ('00000000-0000-4000-8000-000000000011', 'directory'),
  ('00000000-0000-4000-8000-000000000011', 'email'),
  ('00000000-0000-4000-8000-000000000012', 'directory'),
  ('00000000-0000-4000-8000-000000000013', 'directory');

update public.profiles p set
  visible = s.visible,
  headline = s.headline,
  background = s.background,
  major = s.major,
  class_year = s.class_year,
  skills = s.skills,
  clubs_roles = s.clubs_roles,
  linkedin_url = s.linkedin_url,
  contact_email = s.contact_email
from (values
  ('00000000-0000-4000-8000-000000000011'::uuid, true, 'Computer Science, Class of 2027',
   'Backend developer who likes databases.', 'Computer Science', 2027,
   '{SQL,TypeScript,Python}'::text[], '{"ACM, treasurer"}'::text[], 'https://www.linkedin.com/in/example-sam',
   'student1@franciscan.edu'),
  ('00000000-0000-4000-8000-000000000012'::uuid, false, 'Mechanical Engineering, Class of 2028',
   'Building robots.', 'Mechanical Engineering', 2028, '{CAD,Arduino}'::text[], '{}'::text[], null, null),
  ('00000000-0000-4000-8000-000000000013'::uuid, true, 'Software Engineering, Class of 2026',
   'Frontend and design.', 'Software Engineering', 2026, '{React,Figma}'::text[], '{"Robotics Club, president"}'::text[],
   null, null)
) as s (id, visible, headline, background, major, class_year, skills, clubs_roles, linkedin_url, contact_email)
where p.id = s.id;

-- People and partners --------------------------------------------------------------------------

insert into public.faculty (id, name, title, email, profile_id) values
  ('20000000-0000-4000-8000-000000000001', 'Dr. Pat Faculty', 'Professor of Computer Science',
   'faculty@franciscan.edu', '00000000-0000-4000-8000-000000000003'),
  ('20000000-0000-4000-8000-000000000002', 'Dr. Morgan Lee', 'Associate Professor of Engineering',
   'mlee@franciscan.edu', null);

insert into public.organizations (id, name, type, url) values
  ('30000000-0000-4000-8000-000000000001', 'Example Research Grant', 'grant', null),
  ('30000000-0000-4000-8000-000000000002', 'Example Partner Organization', 'organization', 'https://example.org');

-- Projects -------------------------------------------------------------------------------------

insert into public.projects (
  id, slug, title, summary, description, status, category_id, sub_department_id,
  priority, is_pinned, published, open_to_contributors, tags, date_started, date_finished,
  primary_contact_email, created_by
)
select p.id, p.slug, p.title, p.summary, p.description, p.status::public.project_status,
  (select id from public.categories where slug = p.category),
  (select id from public.sub_departments where slug = p.sub_department),
  p.priority, p.is_pinned, p.published, p.open_to_contributors, p.tags, p.date_started, p.date_finished,
  p.contact, p.created_by
from (values
  ('10000000-0000-4000-8000-000000000001'::uuid, 'department-website', 'Department Website',
   'The site you are looking at, built by the Algorithms class.', 'Built with **Supabase** and Cloudflare.',
   'active', 'class', 'computer-science', 5, true, true, true, '{web,databases}'::text[],
   '2026-09-01'::date, null::date, 'faculty@franciscan.edu', '00000000-0000-4000-8000-000000000001'::uuid),
  ('10000000-0000-4000-8000-000000000002'::uuid, 'campus-robot', 'Campus Delivery Robot',
   'A small robot that carries packages across campus.', 'Built in the engineering lab over two semesters.',
   'completed', 'capstone', 'mechanical-engineering', 3, false, true, false, '{robotics,embedded}'::text[],
   '2025-09-01'::date, '2026-05-01'::date, 'mlee@franciscan.edu', '00000000-0000-4000-8000-000000000001'::uuid),
  ('10000000-0000-4000-8000-000000000003'::uuid, 'study-group-finder', 'Study Group Finder',
   'Match students into study groups by course.', 'A planned web app. New contributors welcome.',
   'planned', 'personal', 'software-engineering', 1, false, true, true, '{web,mobile}'::text[],
   null::date, null::date, null, '00000000-0000-4000-8000-000000000011'::uuid),
  ('10000000-0000-4000-8000-000000000004'::uuid, 'portfolio-advisor', 'AI Portfolio Advisor',
   'Explains investment ideas in plain language.', 'A class project combining finance and machine learning.',
   'active', 'class', 'business-ai', 2, false, true, false, '{ai,finance}'::text[],
   '2026-08-25'::date, null::date, 'faculty@franciscan.edu', '00000000-0000-4000-8000-000000000001'::uuid),
  ('10000000-0000-4000-8000-000000000005'::uuid, 'high-altitude-balloon', 'High-Altitude Balloon',
   'Sensors carried to the edge of space.', 'A partner project with an outside organization.',
   'completed', 'partner', 'mechanical-engineering', 4, false, true, false, '{aerospace,sensors}'::text[],
   '2025-01-15'::date, '2025-11-30'::date, 'mlee@franciscan.edu', '00000000-0000-4000-8000-000000000001'::uuid),
  ('10000000-0000-4000-8000-000000000006'::uuid, 'admin-draft', 'Unpublished Draft',
   'Only reviewers and admins can see this.', 'An admin is still writing this one.',
   'planned', 'personal', 'computer-science', 1, false, false, false, '{}'::text[],
   null::date, null::date, null, '00000000-0000-4000-8000-000000000001'::uuid)
) as p (id, slug, title, summary, description, status, category, sub_department, priority, is_pinned, published,
  open_to_contributors, tags, date_started, date_finished, contact, created_by);

insert into public.contributions (project_id, student_id, external_name, role, term, can_edit, confirmed, sort_order) values
  ('10000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000011', null, 'Backend developer', 'Fall 2026', true, true, 0),
  ('10000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000013', null, 'Frontend developer', 'Fall 2026', false, true, 1),
  -- student2 is not listed, so the public never sees this row.
  ('10000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000012', null, 'Hardware lead', 'Spring 2026', true, true, 0),
  ('10000000-0000-4000-8000-000000000002', null, 'Lab volunteer', 'Mentor', '', false, true, 1),
  ('10000000-0000-4000-8000-000000000003', '00000000-0000-4000-8000-000000000011', null, 'Project lead', 'Fall 2026', true, true, 0),
  -- Waiting for student3 to confirm (FR-3.7).
  ('10000000-0000-4000-8000-000000000004', '00000000-0000-4000-8000-000000000013', null, 'Data analyst', 'Fall 2026', false, false, 0),
  ('10000000-0000-4000-8000-000000000005', null, 'Partner engineer', 'Mentor', '2025', false, true, 0);

insert into public.advising (project_id, faculty_id) values
  ('10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001'),
  ('10000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000002'),
  ('10000000-0000-4000-8000-000000000004', '20000000-0000-4000-8000-000000000001'),
  ('10000000-0000-4000-8000-000000000005', '20000000-0000-4000-8000-000000000002');

insert into public.project_organizations (project_id, organization_id) values
  ('10000000-0000-4000-8000-000000000005', '30000000-0000-4000-8000-000000000002'),
  ('10000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000001');

-- Carousel: this month's pool, and today's pick so the home page has something to show before
-- the carousel function runs.
insert into public.monthly_pool (month, project_id, selected_by)
select to_char(public.carousel_day(), 'YYYY-MM'), id, '00000000-0000-4000-8000-000000000001'
from public.projects where published;

select public.save_carousel(public.carousel_day(), array[
  '10000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000004',
  '10000000-0000-4000-8000-000000000002',
  '10000000-0000-4000-8000-000000000003',
  '10000000-0000-4000-8000-000000000005'
]::uuid[]);

-- Other content --------------------------------------------------------------------------------

insert into public.internships (student_id, company, term, description) values
  ('00000000-0000-4000-8000-000000000011', 'Example Corp', 'Summer 2026', 'Built internal tools for the data team.');

insert into public.alumni_stories (name, grad_year, job_title, employer, story, published) values
  ('Casey Graduate', 2022, 'Software Engineer', 'Example Software Co.',
   'The capstone project taught me how to work on a real team.', true);

insert into public.posts (slug, title, summary, body, publish_state, published_at, author_id) values
  ('fall-open-house', 'Fall Open House', 'Tour the labs and meet faculty.',
   'Join us in the engineering building to see student projects.', 'published', '2026-10-01 09:00:00-04',
   '00000000-0000-4000-8000-000000000001'),
  ('spring-showcase-draft', 'Spring Showcase (draft)', 'Not published yet.',
   'Only reviewers and admins can see this post.', 'draft', null,
   '00000000-0000-4000-8000-000000000001');

-- Submissions waiting for review ---------------------------------------------------------------

insert into public.pending_changes (submitter_id, target_type, action, target_id, proposed_data) values
  -- student2 asks to be added to the directory (FR-3.1).
  ('00000000-0000-4000-8000-000000000012', 'profile', 'create', '00000000-0000-4000-8000-000000000012',
   '{"headline": "Mechanical Engineering, Class of 2028", "background": "Building robots and drones."}'),
  -- student1 edits a project they lead.
  ('00000000-0000-4000-8000-000000000011', 'project', 'update', '10000000-0000-4000-8000-000000000003',
   '{"status": "active", "date_started": "2026-10-01", "summary": "Match students into study groups by course and schedule."}'),
  -- student3 submits a new project and lists student1 as a teammate.
  ('00000000-0000-4000-8000-000000000013', 'project', 'create', null,
   jsonb_build_object(
     'title', 'Robotics Club Website', 'slug', 'robotics-club-website',
     'summary', 'A site for the Robotics Club.', 'status', 'active',
     'category_id', (select id from public.categories where slug = 'personal'),
     'sub_department_id', (select id from public.sub_departments where slug = 'software-engineering'),
     'members', jsonb_build_array(
       jsonb_build_object('student_id', '00000000-0000-4000-8000-000000000013', 'role', 'Lead developer'),
       jsonb_build_object('student_id', '00000000-0000-4000-8000-000000000011', 'role', 'Database help')),
     'advisor_ids', jsonb_build_array('20000000-0000-4000-8000-000000000001')));
