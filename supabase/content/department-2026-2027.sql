-- The department as the 2026-2027 Academic Catalog describes it: faculty and the About page.
-- Source: https://franciscan.smartcatalogiq.com/en/2026-2027/academic-catalog-2026-2027/undergraduate-academic-programs/engineering
-- (and .../computer-science). Safe to run again: it adds only what's missing and never overwrites
-- later edits. Run it on a hosted project with `npx supabase db query --linked -f <this file>`.

begin;

-- Faculty. The catalog gives roles for the chair and the pre-engineering director only; emails and
-- photos can be added in Edit mode.
insert into public.faculty (name, title)
select v.name, v.title from (values
  ($t$Dr. Tyler Brown$t$, $t$Chair, Department of Engineering and Computing$t$),
  ($t$Dr. Derek Doroski$t$, $t$Pre-Engineering Transfer Programs Director$t$),
  ($t$Dr. Justin Greenly$t$, $t$Engineering and Computing faculty$t$),
  ($t$Prof. Jose Roberto Lopez$t$, $t$Engineering and Computing faculty$t$),
  ($t$Rev. Dr. Stephen Frezza, PSEM$t$, $t$Engineering and Computing faculty$t$),
  ($t$Dr. Fernanda Psihas$t$, $t$Engineering and Computing faculty$t$),
  ($t$Dr. Michael Seibert$t$, $t$Engineering and Computing faculty$t$)
) as v (name, title)
where not exists (select 1 from public.faculty f where f.name = v.name);

-- About page text (editable in Edit mode).
insert into public.site_content (key, value) values
  ($t$about.title$t$, $t$Department of Engineering and Computing$t$),
  ($t$about.body$t$, $t$The Engineering and Computing programs at Franciscan University of Steubenville aim to prepare students to bring value to people through the development of technology. The department offers four different degree pathways: Computer Science, Mechanical Engineering, Software Engineering, and various Dual-Degree “Pre-Engineering” options in collaboration with partner schools. Each pathway offers students the opportunity to develop competence in a wide variety of engineering and computing disciplines and leverages the University’s commitment to Dynamic Orthodoxy with coursework and retreats that foster virtue formation and are built firmly on the Catholic intellectual tradition.$t$),
  ($t$about.mission$t$, $t$Guided by our Catholic faith, driven by innovation: we form virtuous engineering and computing professionals to serve the authentic good with skill and excellence. The mission of the Engineering and Computing Department is to form the intellectual and spiritual minds of the students through rigorous academic study, practical application of course material in internship and co-op opportunities, and retreat programs that focus on the continuous growth of virtues in the lives of students. The Engineering programs emphasize the development of professional and personal virtue unique to the Franciscan educational culture, preparing students to successfully seek employment in their chosen industry, while living in Truth and developing in virtue.$t$),
  ($t$about.objectives$t$, $t$The engineering and computing programs at Franciscan University of Steubenville form graduates in virtue who are armed to rebuild the Church and sanctify the world.

By educating and forming technically competent and personally balanced disciples of Jesus Christ who are prepared personally and professionally to act as leaven in transforming the culture, the programs succeed in delivering to the world joyful and courageous individuals who proclaim the truth of the Gospel from the heart of the Church. The programs foster a community of encounter and conversion, including the students, faculty, staff, alumni, and employers.$t$),
  ($t$about.programs$t$, $t$Bachelor of Science: Computer Science; Computer Science (Cybersecurity Concentration); Software Engineering; Software Engineering (Cybersecurity Concentration); Mechanical Engineering.

Pre-Engineering dual degrees: 2+2 with Catholic University of America (Biomedical, Civil, Electrical and Mechanical Engineering); 2+2 with Gannon University (Biomedical, Electrical and Environmental Engineering); 2+2 with the University of Pittsburgh (Chemical, Civil, Electrical and Mechanical Engineering); 3+2 with Notre Dame (Aerospace, Civil and Mechanical Engineering; Chemical Engineering; Electrical Engineering).

Minors: Computer Science; Cybersecurity; Software Engineering; Mechanical Engineering.

Also: the Bioinformatics Certificate Program and the Honors Program.$t$)
on conflict (key) do nothing;

commit;
