-- Sample content for the hosted dev project ("Franciscan Site Dev"), so the frontend has
-- something to show. With the repo linked to dev (see docs/backend-setup.md, 3.2):
--
--   npx supabase db query --linked -f supabase/dev-content.sql
--
-- It runs as one block, so it either loads everything or nothing. It refuses to run on
-- production or when the content is already there. The students are fake accounts at
-- @sample.invalid with random passwords nobody knows, so nobody can sign in as them. Names and
-- organizations are made up. Local development uses supabase/seed.sql instead.

do $$
declare
  sam uuid := 'e1000000-0000-4000-8000-000000000001';
  jordan uuid := 'e1000000-0000-4000-8000-000000000002';
  alex uuid := 'e1000000-0000-4000-8000-000000000003';
  pat uuid := 'e2000000-0000-4000-8000-000000000001';
  morgan uuid := 'e2000000-0000-4000-8000-000000000002';
  grant_org uuid := 'e3000000-0000-4000-8000-000000000001';
  partner_org uuid := 'e3000000-0000-4000-8000-000000000002';
  website uuid := 'e4000000-0000-4000-8000-000000000001';
  robot uuid := 'e4000000-0000-4000-8000-000000000002';
  finder uuid := 'e4000000-0000-4000-8000-000000000003';
  advisor uuid := 'e4000000-0000-4000-8000-000000000004';
  balloon uuid := 'e4000000-0000-4000-8000-000000000005';
  draft uuid := 'e4000000-0000-4000-8000-000000000006';
begin
  if exists (
    select 1 from vault.decrypted_secrets
    where name = 'carousel_function_url' and decrypted_secret like '%rhvvvurfpzblbpsipgen%'
  ) then
    raise exception 'This is the production project. Sample content is for dev only.';
  end if;
  if exists (select 1 from public.projects where slug = 'department-website') then
    raise exception 'Sample content is already loaded.';
  end if;

  -- Students: fake accounts nobody can sign in to --------------------------------------------
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change_token_new, email_change
  )
  select
    '00000000-0000-0000-0000-000000000000', u.id, 'authenticated', 'authenticated', u.email,
    extensions.crypt(gen_random_uuid()::text || gen_random_uuid()::text, extensions.gen_salt('bf')), now(),
    '{"provider": "email", "providers": ["email"]}', jsonb_build_object('full_name', u.name), now(), now(),
    '', '', '', ''
  from (values
    (sam, 'sam.rivera@sample.invalid', 'Sam Rivera'),
    (jordan, 'jordan.avery@sample.invalid', 'Jordan Avery'),
    (alex, 'alex.morgan@sample.invalid', 'Alex Morgan')
  ) as u (id, email, name);

  insert into auth.identities (provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
  select u.id::text, u.id, jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true),
    'email', now(), now(), now()
  from auth.users u where u.id in (sam, jordan, alex);

  insert into public.consents (student_id, scope) values
    (sam, 'directory'), (sam, 'email'), (jordan, 'directory'), (alex, 'directory');

  update public.profiles p set
    visible = s.visible, headline = s.headline, background = s.background, major = s.major,
    class_year = s.class_year, skills = s.skills, clubs_roles = s.clubs_roles,
    linkedin_url = s.linkedin_url, contact_email = s.contact_email
  from (values
    (sam, true, 'Computer Science, Class of 2027', 'Backend developer who likes databases.',
     'Computer Science', 2027, '{SQL,TypeScript,Python}'::text[], '{"ACM, treasurer"}'::text[],
     'https://www.linkedin.com/in/sample-sam'::public.https_url, 'sam.rivera@sample.invalid'::public.email_address),
    (jordan, true, 'Software Engineering, Class of 2026', 'Frontend and design.',
     'Software Engineering', 2026, '{React,Figma}'::text[], '{"Robotics Club, president"}'::text[], null, null),
    -- Alex has consented but is waiting for review, so the public does not see them yet.
    (alex, false, 'Mechanical Engineering, Class of 2028', 'Building robots and drones.',
     'Mechanical Engineering', 2028, '{CAD,Arduino}'::text[], '{}'::text[], null, null)
  ) as s (id, visible, headline, background, major, class_year, skills, clubs_roles, linkedin_url, contact_email)
  where p.id = s.id;

  -- Faculty and partners ----------------------------------------------------------------------
  insert into public.faculty (id, name, title, email) values
    (pat, 'Dr. Pat Ellison', 'Professor of Computer Science', 'pellison@sample.invalid'),
    (morgan, 'Dr. Morgan Lee', 'Associate Professor of Engineering', 'mlee@sample.invalid');

  insert into public.organizations (id, name, type, url) values
    (grant_org, 'Example Research Grant', 'grant', null),
    (partner_org, 'Example Space Partner', 'organization', 'https://example.org');

  -- Projects ------------------------------------------------------------------------------------
  insert into public.projects (
    id, slug, title, summary, description, status, category_id, sub_department_id,
    priority, is_pinned, published, open_to_contributors, tags, date_started, date_finished,
    primary_contact_email, created_by
  )
  select p.id, p.slug, p.title, p.summary, p.description, p.status::public.project_status,
    (select id from public.categories where slug = p.category),
    (select id from public.sub_departments where slug = p.sub_department),
    p.priority, p.is_pinned, p.published, p.open_to_contributors, p.tags, p.date_started, p.date_finished,
    p.contact::public.email_address, p.created_by
  from (values
    (website, 'department-website', 'Department Website',
     'The site you are looking at, built by the Algorithms class.',
     'Built with **React**, **Supabase** and Cloudflare. Students submit projects; reviewers approve them.',
     'active', 'class', 'computer-science', 5, true, true, true, '{web,databases}'::text[],
     '2026-09-01'::date, null::date, 'pellison@sample.invalid', sam),
    (robot, 'campus-robot', 'Campus Delivery Robot',
     'A small robot that carries packages across campus.',
     'Built in the engineering lab over two semesters, with route planning and obstacle avoidance.',
     'completed', 'capstone', 'mechanical-engineering', 3, false, true, false, '{robotics,embedded}'::text[],
     '2025-09-01'::date, '2026-05-01'::date, 'mlee@sample.invalid', null::uuid),
    (finder, 'study-group-finder', 'Study Group Finder',
     'Match students into study groups by course.',
     'A planned web app. New contributors welcome.',
     'planned', 'personal', 'software-engineering', 1, false, true, true, '{web,mobile}'::text[],
     null::date, null::date, null, sam),
    (advisor, 'portfolio-advisor', 'AI Portfolio Advisor',
     'Explains investment ideas in plain language.',
     'A class project combining finance and machine learning.',
     'active', 'class', 'business-ai', 2, false, true, false, '{ai,finance}'::text[],
     '2026-08-25'::date, null::date, 'pellison@sample.invalid', null::uuid),
    (balloon, 'high-altitude-balloon', 'High-Altitude Balloon',
     'Sensors carried to the edge of space.',
     'A partner project measuring temperature, pressure and radiation during ascent.',
     'completed', 'partner', 'mechanical-engineering', 4, false, true, false, '{aerospace,sensors}'::text[],
     '2025-01-15'::date, '2025-11-30'::date, 'mlee@sample.invalid', null::uuid),
    (draft, 'unpublished-draft', 'Unpublished Draft',
     'Only reviewers and admins can see this.', 'An admin is still writing this one.',
     'planned', 'personal', 'computer-science', 1, false, false, false, '{}'::text[],
     null::date, null::date, null, null::uuid)
  ) as p (id, slug, title, summary, description, status, category, sub_department, priority, is_pinned,
    published, open_to_contributors, tags, date_started, date_finished, contact, created_by);

  insert into public.contributions (project_id, student_id, external_name, role, term, can_edit, confirmed, sort_order) values
    (website, sam, null, 'Backend developer', 'Fall 2026', true, true, 0),
    (website, jordan, null, 'Frontend developer', 'Fall 2026', false, true, 1),
    (robot, alex, null, 'Hardware lead', 'Spring 2026', true, true, 0),
    (robot, null, 'Lab volunteer', 'Mentor', '', false, true, 1),
    (finder, sam, null, 'Project lead', 'Fall 2026', true, true, 0),
    -- Waiting for Jordan to confirm (FR-3.7), so the public does not see it yet.
    (advisor, jordan, null, 'Data analyst', 'Fall 2026', false, false, 0),
    (balloon, null, 'Partner engineer', 'Mentor', '2025', false, true, 0);

  insert into public.advising (project_id, faculty_id) values
    (website, pat), (robot, morgan), (advisor, pat), (balloon, morgan);

  insert into public.project_organizations (project_id, organization_id) values
    (balloon, partner_org), (robot, grant_org);

  insert into public.monthly_pool (month, project_id, selected_by)
  select to_char(public.carousel_day(), 'YYYY-MM'), id, null
  from public.projects where published;

  -- Other content -----------------------------------------------------------------------------
  insert into public.internships (student_id, company, term, description) values
    (sam, 'Example Corp', 'Summer 2026', 'Built internal tools for the data team.');

  insert into public.alumni_stories (name, grad_year, job_title, employer, story, published) values
    ('Casey Graduate', 2022, 'Software Engineer', 'Example Software Co.',
     'The capstone project taught me how to work on a real team.', true);

  insert into public.posts (slug, title, summary, body, publish_state, published_at) values
    ('fall-open-house', 'Fall Open House', 'Tour the labs and meet faculty.',
     'Join us in the engineering building to see student projects.', 'published', '2026-10-01 09:00:00-04'),
    ('spring-showcase-draft', 'Spring Showcase (draft)', 'Not published yet.',
     'Only reviewers and admins can see this post.', 'draft', null);

  -- Submissions for the review queue ----------------------------------------------------------
  insert into public.pending_changes (submitter_id, target_type, action, target_id, proposed_data) values
    (alex, 'profile', 'create', alex,
     '{"headline": "Mechanical Engineering, Class of 2028", "background": "Building robots and drones."}'),
    (sam, 'project', 'update', finder,
     '{"status": "active", "date_started": "2026-10-01", "summary": "Match students into study groups by course and schedule."}'),
    (jordan, 'project', 'create', null,
     jsonb_build_object(
       'title', 'Robotics Club Website', 'slug', 'robotics-club-website',
       'summary', 'A site for the Robotics Club.', 'status', 'active',
       'category_id', (select id from public.categories where slug = 'personal'),
       'sub_department_id', (select id from public.sub_departments where slug = 'software-engineering'),
       'members', jsonb_build_array(
         jsonb_build_object('student_id', jordan, 'role', 'Lead developer'),
         jsonb_build_object('student_id', sam, 'role', 'Database help')),
       'advisor_ids', jsonb_build_array(pat)));

  -- Pick today's carousel from the new content: clear today's empty pick, then ask the
  -- carousel function to run, as the hourly job does.
  delete from public.daily_carousel where day = public.carousel_day();
  delete from public.carousel_state where day = public.carousel_day();
  perform private.request_carousel_refresh();
end;
$$;
