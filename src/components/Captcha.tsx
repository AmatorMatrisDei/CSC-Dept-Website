import { useEffect, useRef, useState } from "react";
import { Notice } from "@/components/Form";
import { loadTurnstile, TURNSTILE_SITE_KEY } from "@/lib/turnstile";

// Cloudflare's "are you a person?" check, inside a form. It usually passes on its own; sometimes it
// asks for a click. Calls `onToken` with a token once it passes, and with null when the token
// expires or the check fails. Give it a new `key` for a fresh token (see useTurnstileToken).
// Renders nothing when the site has no Turnstile key.
export default function Captcha({ onToken }: { onToken: (token: string | null) => void }) {
  const box = useRef<HTMLDivElement>(null);
  const report = useRef(onToken);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    report.current = onToken;
  }, [onToken]);

  useEffect(() => {
    const element = box.current;
    if (!TURNSTILE_SITE_KEY || !element) return;
    let widget: string | undefined;
    let gone = false;
    loadTurnstile().then(
      (turnstile) => {
        if (gone) return;
        widget = turnstile.render(element, {
          sitekey: TURNSTILE_SITE_KEY,
          theme: document.documentElement.dataset.theme === "dark" ? "dark" : "light",
          size: "flexible",
          callback: (token: string) => report.current(token),
          "expired-callback": () => report.current(null),
          "error-callback": () => {
            report.current(null);
            setProblem("The check that you're a person didn't work. Reload the page and try again.");
          },
        });
      },
      (error: Error) => setProblem(error.message),
    );
    return () => {
      gone = true;
      if (widget) window.turnstile?.remove(widget);
    };
  }, []);

  if (!TURNSTILE_SITE_KEY) return null;
  return (
    <div className="flex flex-col gap-2">
      <div ref={box} className="min-h-[65px]" />
      {problem && <Notice tone="error">{problem}</Notice>}
    </div>
  );
}
