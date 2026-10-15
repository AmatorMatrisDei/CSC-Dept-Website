import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import {
  CheckField,
  Fieldset,
  Notice,
  PhotoField,
  TextArea,
  TextField,
  buttonClass,
  type PhotoValue,
} from "@/components/Form";
import {
  OPEN_STATUSES,
  getDashboard,
  getSubmission,
  grantConsent,
  removeUploads,
  resubmitChange,
  revokeConsent,
  submitChange,
  uploadPhoto,
  type ConsentScope,
  type Me,
  type ProfileFields,
  type Submission,
} from "@/lib/account";
import { useSignedInSession } from "@/lib/auth";
import { useAction, useAsync, useTitle } from "@/lib/hooks";

// The student's directory profile (FR-2.1, FR-3.1): permissions first, which take effect at once,
// then the profile itself, which a reviewer approves. The permission wording is a draft until the
// Registrar confirms what FERPA requires (see the Requirements and Team Guide, NFR-3).

const SCOPES: { scope: ConsentScope; label: string; hint: string }[] = [
  {
    scope: "directory",
    label: "List me in the student directory",
    hint: "Your profile appears on the Students pages, and your name appears on projects you confirm. Needed before you can ask to be added.",
  },
  { scope: "photo", label: "Show my photo", hint: "Lets you add a photo to your profile." },
  { scope: "email", label: "Show an email address", hint: "Lets you add a contact email address to your profile." },
  { scope: "phone", label: "Show a phone number", hint: "Lets you add a phone number to your profile." },
];

async function loadChange(id: string): Promise<Submission | null> {
  return id ? getSubmission(id) : null;
}

export default function ProfileForm() {
  const session = useSignedInSession();
  const [params] = useSearchParams();
  const changeId = params.get("change") ?? "";
  const data = useAsync(getDashboard, session.user.id);
  const change = useAsync(loadChange, changeId);
  const [consents, setConsents] = useState<ConsentScope[] | null>(null);
  useTitle("My profile");

  if (!data || change === undefined) return <p className="text-muted">Loading…</p>;

  const active = consents ?? data.consents;
  const listed = data.me.visible && active.includes("directory");
  const open = data.submissions.filter((s) => s.target_type === "profile" && OPEN_STATUSES.includes(s.status));
  const editing = change && change.target_type === "profile" && change.status === "changes_requested" ? change : null;

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <header className="flex flex-col gap-2">
        <Link to="/account" className="inline-flex min-h-11 w-fit items-center text-sm underline">
          My account
        </Link>
        <h1 className="text-3xl font-semibold">My directory profile</h1>
        <p className="text-muted">
          Only what you choose to share appears on the site. Grades, student ID numbers and schedules are never shown.
        </p>
      </header>

      <Permissions userId={session.user.id} active={active} onChange={setConsents} />

      {editing ? (
        <ProfileEditor me={data.me} consents={active} listed={listed} change={editing} />
      ) : open.length > 0 ? (
        <Notice>
          {open[0].action === "delete" ? (
            "You asked to be removed from the directory. A reviewer will finish the removal."
          ) : open[0].status === "changes_requested" ? (
            <>
              A reviewer asked for changes to your last profile submission.{" "}
              <Link to={`/account/profile?change=${open[0].id}`} className="underline">
                Edit and send it back
              </Link>
              .
            </>
          ) : (
            <>
              Your last profile changes are still with a reviewer. You can send more once they&apos;re reviewed, or
              withdraw them from{" "}
              <Link to="/account" className="underline">
                your account page
              </Link>
              .
            </>
          )}
        </Notice>
      ) : (
        <ProfileEditor me={data.me} consents={active} listed={listed} change={null} />
      )}
    </div>
  );
}

function Permissions({
  userId,
  active,
  onChange,
}: {
  userId: string;
  active: ConsentScope[];
  onChange: (consents: ConsentScope[]) => void;
}) {
  const { busy, error, run } = useAction();
  return (
    <section id="permissions" aria-labelledby="permissions-title" className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-4 sm:p-6">
      <h2 id="permissions-title" className="text-xl font-semibold">
        What you agree to share
      </h2>
      <p className="text-sm text-muted">
        Each takes effect as soon as you tick or untick it, and you can change your mind at any time. Unticking
        removes that information from the site straight away.
      </p>
      {SCOPES.map(({ scope, label, hint }) => (
        <CheckField
          key={scope}
          label={label}
          hint={hint}
          checked={active.includes(scope)}
          disabled={busy}
          onChange={(checked) => {
            if (!checked && scope === "directory" &&
              !window.confirm("Stop being listed? Your profile and your name on projects are hidden straight away.")) {
              return;
            }
            // Show the tick straight away; put it back if the database refuses.
            onChange(checked ? [...active, scope] : active.filter((s) => s !== scope));
            void run(async () => {
              try {
                if (checked) await grantConsent(scope);
                else await revokeConsent(userId, scope);
              } catch (e) {
                onChange(active);
                throw e;
              }
            });
          }}
        />
      ))}
      {error && <Notice tone="error">{error}</Notice>}
    </section>
  );
}

function splitList(text: string, separator: string): string[] {
  return [...new Set(text.split(separator).map((item) => item.trim()).filter(Boolean))];
}

function ProfileEditor({
  me,
  consents,
  listed,
  change,
}: {
  me: Me;
  consents: ConsentScope[];
  listed: boolean;
  change: Submission | null;
}) {
  const start = { ...me, ...(change?.proposed_data as Partial<ProfileFields> | undefined) };
  const [name, setName] = useState(start.name);
  const [headline, setHeadline] = useState(start.headline);
  const [major, setMajor] = useState(start.major ?? "");
  const [classYear, setClassYear] = useState(start.class_year ? String(start.class_year) : "");
  const [background, setBackground] = useState(start.background);
  const [skills, setSkills] = useState(start.skills.join(", "));
  const [clubs, setClubs] = useState(start.clubs_roles.join("\n"));
  const [linkedin, setLinkedin] = useState(start.linkedin_url ?? "");
  const [github, setGithub] = useState(start.github_url ?? "");
  const [website, setWebsite] = useState(start.website_url ?? "");
  const [photo, setPhoto] = useState<PhotoValue>({ path: start.photo_path, file: null });
  const [email, setEmail] = useState(start.contact_email ?? "");
  const [phone, setPhone] = useState(start.contact_phone ?? "");
  const { busy, error, run, setError } = useAction();
  const navigate = useNavigate();
  const session = useSignedInSession();

  const can = (scope: ConsentScope) => consents.includes(scope);
  const creating = !change && !listed;
  const blocked = creating && !can("directory");

  async function save() {
    const skillList = splitList(skills, ",");
    const clubList = splitList(clubs, "\n");
    if (skillList.length > 30) throw new Error("List up to 30 skills.");
    if (clubList.length > 20) throw new Error("List up to 20 clubs and roles.");

    const uploaded: string[] = [];
    try {
      const proposed: Partial<ProfileFields> = {
        name: name.trim(),
        headline: headline.trim(),
        background: background.trim(),
        major: major.trim() || null,
        class_year: classYear ? Number(classYear) : null,
        skills: skillList,
        clubs_roles: clubList,
        linkedin_url: linkedin.trim() || null,
        github_url: github.trim() || null,
        website_url: website.trim() || null,
      };
      // Photo, email and phone are only sent while the matching permission is given.
      if (can("photo")) {
        if (photo.file) uploaded.push(await uploadPhoto(session.user.id, "avatars", photo.file));
        proposed.photo_path = uploaded[0] ?? photo.path;
      }
      if (can("email")) proposed.contact_email = email.trim() || null;
      if (can("phone")) proposed.contact_phone = phone.trim() || null;

      if (change) await resubmitChange(change.id, proposed);
      else await submitChange({ target_type: "profile", action: creating ? "create" : "update", proposed_data: proposed });
    } catch (e) {
      await removeUploads(uploaded).catch(() => undefined);
      throw e;
    }
    navigate("/account", {
      state: { message: creating ? "Your request to be added was sent for review." : "Your profile changes were sent for review." },
    });
  }

  return (
    <form
      className="flex flex-col gap-6"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        void run(save);
      }}
    >
      {change?.reason && (
        <Notice>
          <strong>The reviewer asked:</strong> {change.reason}
        </Notice>
      )}

      <Fieldset legend="About you">
        <TextField label="Name" required value={name} onChange={setName} maxLength={120} autoComplete="name" />
        <TextField label="Headline" value={headline} onChange={setHeadline} maxLength={200}
          hint="One line, e.g. Software Engineering, Class of 2027 · Interested in robotics." />
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField label="Major" value={major} onChange={setMajor} maxLength={100} />
          <TextField label="Class year" type="number" value={classYear} onChange={setClassYear} min={1950} max={2100}
            inputMode="numeric" hint="Four digits, e.g. 2027." />
        </div>
        <TextArea label="Background" value={background} onChange={setBackground} maxLength={5000} rows={6}
          hint="A short paragraph: your interests, what you like to build, what you're looking for. Leave a blank line between paragraphs." />
        <TextField label="Skills" value={skills} onChange={setSkills}
          hint="Separated by commas, e.g. Python, CAD, Figma. Up to 30. People can search for these." />
        <TextArea label="Clubs and roles" value={clubs} onChange={setClubs} rows={3}
          hint="One per line, e.g. ACM, treasurer. Up to 20." />
      </Fieldset>

      <Fieldset legend="Links" description="Public profiles only. Each must start with https://">
        <TextField label="LinkedIn" type="url" value={linkedin} onChange={setLinkedin} pattern="https://.*"
          placeholder="https://www.linkedin.com/in/…" />
        <TextField label="GitHub" type="url" value={github} onChange={setGithub} pattern="https://.*"
          placeholder="https://github.com/…" />
        <TextField label="Personal website" type="url" value={website} onChange={setWebsite} pattern="https://.*" />
      </Fieldset>

      <Fieldset legend="Photo and contact details" description="Each needs the matching permission above.">
        {can("photo") ? (
          <PhotoField label="Profile photo" value={photo} onChange={setPhoto} previewAlt={`Your new photo, ${name}`} round
            hint="A clear photo of your face. It's resized before upload, and location data is removed." />
        ) : (
          <p className="text-sm text-muted">Tick “Show my photo” above to add a photo.</p>
        )}
        {can("email") ? (
          <TextField label="Contact email" type="email" value={email} onChange={setEmail} maxLength={254}
            hint="Shown on your profile. It can be your university address or another one." />
        ) : (
          <p className="text-sm text-muted">Tick “Show an email address” above to add one.</p>
        )}
        {can("phone") ? (
          <TextField label="Phone" type="tel" value={phone} onChange={setPhone} maxLength={25} inputMode="tel"
            pattern={"[0-9+\\(\\)\\. \\-]{7,25}"} hint="Shown on your profile. Digits, spaces and + ( ) . -" />
        ) : (
          <p className="text-sm text-muted">Tick “Show a phone number” above to add one.</p>
        )}
      </Fieldset>

      {blocked && <Notice>Tick “List me in the student directory” above before asking to be added.</Notice>}
      {error && <Notice tone="error">{error}</Notice>}
      <div className="flex flex-wrap items-center gap-4">
        <button type="submit" className={buttonClass} disabled={busy || blocked}>
          {busy ? "Sending…" : change ? "Send back for review" : creating ? "Ask to be added" : "Send changes for review"}
        </button>
        <span className="text-sm text-muted">A reviewer checks everything before it appears on the site.</span>
      </div>
    </form>
  );
}
