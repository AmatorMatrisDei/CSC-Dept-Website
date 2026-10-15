import { type FormEvent, useEffect, useState } from "react";
import { Link } from "react-router";
import { Consent, Field, Honeypot, SubmitNotice } from "@/components/FormParts";
import {
  type ConsentScope,
  type MyProfile,
  getMyConsents,
  getMyProfile,
  grantConsents,
  submitChange,
  uploadAvatar,
} from "@/lib/account";
import { useAuth } from "@/lib/auth";
import { HONEYPOT, inputClass } from "@/lib/form";
import { useTitle } from "@/lib/hooks";
import { splitList } from "@/lib/list";

// Profile request (FR-3.1). Needs a signed-in student. It adds a row to the review queue; nothing
// goes live until a reviewer approves it. The consent wording is a placeholder until the registrar
// settles what counts as directory information.

export default function StudentRequest() {
  useTitle("Request to be added");
  const { ready, userId } = useAuth();
  const [profile, setProfile] = useState<MyProfile | null | undefined>(undefined);
  const [granted, setGranted] = useState<ConsentScope[]>([]);
  const [photo, setPhoto] = useState(false);
  const [email, setEmail] = useState(false);
  const [phone, setPhone] = useState(false);
  const [directory, setDirectory] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  useEffect(() => {
    if (!userId) return;
    let live = true;
    Promise.all([getMyProfile(userId), getMyConsents(userId)])
      .then(([p, c]) => {
        if (!live) return;
        setProfile(p);
        setGranted(c);
        setDirectory(c.includes("directory"));
        setPhoto(c.includes("photo"));
        setEmail(c.includes("email"));
        setPhone(c.includes("phone"));
      })
      .catch(() => live && setProfile(null));
    return () => {
      live = false;
    };
  }, [userId]);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!userId) return;
    const form = e.currentTarget;
    const data = new FormData(form);
    // A filled-in trap field means a bot; pretend it worked and send nothing.
    if (data.get(HONEYPOT)) {
      setSent(true);
      return;
    }
    setBusy(true);
    setError(null);

    const scopes: ConsentScope[] = ["directory"];
    if (photo) scopes.push("photo");
    if (email) scopes.push("email");
    if (phone) scopes.push("phone");
    const consentError = await grantConsents(userId, scopes);
    if (consentError) return fail(consentError);

    const text = (name: string) => String(data.get(name) ?? "").trim();
    const proposed: Record<string, unknown> = {
      name: text("name"),
      headline: text("headline"),
      background: text("background"),
      major: text("major") || null,
      class_year: text("class_year") ? Number(text("class_year")) : null,
      skills: splitList(text("skills")),
      clubs_roles: splitList(text("clubs")),
      linkedin_url: text("link") || null,
    };
    if (email) proposed.contact_email = text("contact_email") || null;
    if (phone) proposed.contact_phone = text("contact_phone") || null;

    const file = data.get("photo");
    if (photo && file instanceof File && file.size > 0) {
      if (file.size > 5 * 1024 * 1024) return fail("That photo is over 5 MB. Please choose a smaller one.");
      const uploaded = await uploadAvatar(userId, file);
      if (uploaded.error) return fail(uploaded.error);
      proposed.photo_path = uploaded.path;
    }

    const message = await submitChange("profile", profile?.visible ? "update" : "create", proposed);
    if (message) return fail(message);
    setBusy(false);
    setSent(true);

    function fail(text: string) {
      setBusy(false);
      setError(text);
    }
  }

  if (!ready || (userId && profile === undefined)) return <p className="text-muted">Loading…</p>;

  if (!userId) {
    return (
      <div className="flex max-w-2xl flex-col gap-4">
        <h1 className="text-3xl font-semibold">Request to be added</h1>
        <p>
          Sign in with your Franciscan account first, so we know the request is from you.{" "}
          <Link to="/account" className="underline">
            Sign in or create an account
          </Link>
        </p>
      </div>
    );
  }

  if (sent) {
    return (
      <div className="flex max-w-2xl flex-col gap-4">
        <h1 className="text-3xl font-semibold">Request sent</h1>
        <SubmitNotice>
          Thank you. A reviewer will look at it soon. You can follow it on{" "}
          <Link to="/account" className="underline">
            your account page
          </Link>
          .
        </SubmitNotice>
      </div>
    );
  }

  const listed = Boolean(profile?.visible);

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-semibold">{listed ? "Request changes to my profile" : "Request to be added"}</h1>
        <p className="text-muted">
          The student directory lists only students who choose to be in it. A faculty or staff
          reviewer approves each request before your page goes live, and you can ask to be removed
          at any time.
        </p>
      </div>

      <form onSubmit={submit} className="relative flex flex-col gap-8">
        <Honeypot name={HONEYPOT} />
        <fieldset className="flex flex-col gap-4">
          <legend className="mb-1 text-xl font-semibold">About you</legend>
          <Field label="Name" htmlFor="name">
            <input id="name" name="name" required maxLength={120} autoComplete="name" defaultValue={profile?.name ?? ""} className={inputClass} />
          </Field>
          <Field label="Headline" htmlFor="headline" hint="One line, such as “Computer science junior interested in robotics”.">
            <input id="headline" name="headline" maxLength={200} defaultValue={profile?.headline ?? ""} aria-describedby="headline-hint" className={inputClass} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Major" htmlFor="major">
              <input id="major" name="major" maxLength={100} defaultValue={profile?.major ?? ""} className={inputClass} />
            </Field>
            <Field label="Class year" htmlFor="class_year" hint="Year you graduate or graduated.">
              <input
                id="class_year"
                name="class_year"
                type="number"
                inputMode="numeric"
                min={1950}
                max={2100}
                defaultValue={profile?.class_year ?? ""}
                aria-describedby="class_year-hint"
                className={inputClass}
              />
            </Field>
          </div>
          <Field label="Background" htmlFor="background" hint="A short paragraph about your interests and work.">
            <textarea
              id="background"
              name="background"
              rows={5}
              maxLength={5000}
              defaultValue={profile?.background ?? ""}
              aria-describedby="background-hint"
              className={inputClass}
            />
          </Field>
          <Field label="Skills" htmlFor="skills" hint="Separate with commas, such as Python, React, SQL.">
            <input id="skills" name="skills" defaultValue={profile?.skills.join(", ") ?? ""} aria-describedby="skills-hint" className={inputClass} />
          </Field>
          <Field label="Clubs and roles" htmlFor="clubs" hint="Such as “ACM, treasurer”. Separate with commas.">
            <input id="clubs" name="clubs" defaultValue={profile?.clubs_roles.join(", ") ?? ""} aria-describedby="clubs-hint" className={inputClass} />
          </Field>
          <Field label="LinkedIn or personal site" htmlFor="link" hint="Must start with https://">
            <input
              id="link"
              name="link"
              type="url"
              pattern="https://.*"
              placeholder="https://"
              defaultValue={profile?.linkedin_url ?? ""}
              aria-describedby="link-hint"
              className={inputClass}
            />
          </Field>
        </fieldset>

        <fieldset className="flex flex-col gap-3">
          <legend className="mb-1 text-xl font-semibold">What you agree to share</legend>
          <p className="text-sm text-muted">
            Your name, headline, major, class year and the projects you are on are shown if you
            agree below. Anything else is shown only if you tick it. You can withdraw any of these
            later, and the item disappears from the site right away.
          </p>
          <Consent
            id="consent-directory"
            required
            checked={directory}
            onChange={setDirectory}
            title="List me in the student directory"
            text="Shows my name, headline, major, class year, background and skills on the public site."
          />
          <Consent
            id="consent-photo"
            checked={photo}
            onChange={setPhoto}
            title="Show my photo"
            text="Shown next to my name. Without it, the site shows my initials."
          />
          <Consent
            id="consent-email"
            checked={email}
            onChange={setEmail}
            title="Show an email address"
            text="Anyone visiting the site can see it. You can use a personal address instead of your Franciscan one."
          />
          <Consent
            id="consent-phone"
            checked={phone}
            onChange={setPhone}
            title="Show my phone number"
            text="Anyone visiting the site can see it."
          />

          {(photo || email || phone) && (
            <div className="flex flex-col gap-4 rounded-lg border border-border bg-surface p-4">
              {photo && (
                <Field label="Photo" htmlFor="photo" hint="JPEG, PNG or WebP, up to 5 MB.">
                  <input
                    id="photo"
                    name="photo"
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    aria-describedby="photo-hint"
                    className={inputClass}
                  />
                </Field>
              )}
              {email && (
                <Field label="Email to show" htmlFor="contact_email">
                  <input id="contact_email" name="contact_email" type="email" autoComplete="email" defaultValue={profile?.contact_email ?? ""} className={inputClass} />
                </Field>
              )}
              {phone && (
                <Field label="Phone to show" htmlFor="contact_phone">
                  <input id="contact_phone" name="contact_phone" type="tel" autoComplete="tel" defaultValue={profile?.contact_phone ?? ""} className={inputClass} />
                </Field>
              )}
            </div>
          )}
          {granted.length > 0 && !directory && (
            <p className="text-sm text-muted">You can withdraw a choice by asking a reviewer; it is removed from the site right away.</p>
          )}
        </fieldset>

        <div className="flex flex-col gap-3">
          <button
            type="submit"
            disabled={busy}
            className="min-h-11 self-start rounded bg-accent px-5 py-2 font-medium text-accent-foreground hover:opacity-90 disabled:opacity-60"
          >
            {busy ? "Sending…" : "Submit request"}
          </button>
          {error && (
            <p role="alert" className="rounded-lg border border-border bg-surface p-3">
              {error}
            </p>
          )}
        </div>
      </form>
    </div>
  );
}
