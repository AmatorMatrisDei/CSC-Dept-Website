import { useEffect, useState } from "react";
import { friendlyError } from "./account";

// Runs an async loader (a function from content.ts) and returns its result, or undefined while
// it loads. Pass the loader and its arguments; it reloads when the arguments change.
export function useAsync<A extends unknown[], T>(load: (...args: A) => Promise<T>, ...args: A): T | undefined {
  const key = JSON.stringify(args);
  const [state, setState] = useState<{ key: string; value: T }>();

  useEffect(() => {
    let current = true;
    load(...(JSON.parse(key) as A)).then(
      (value) => {
        if (current) setState({ key, value });
      },
      (error) => {
        // Rethrow during render so the error boundary in App shows a message.
        if (current) setState(() => { throw error; });
      },
    );
    return () => {
      current = false;
    };
  }, [load, key]);

  return state?.key === key ? state.value : undefined;
}

// Sets the browser tab title for a page.
export function useTitle(title: string | undefined) {
  useEffect(() => {
    document.title = title ? `${title} | Engineering & Computing` : "Engineering & Computing";
  }, [title]);
}

// Runs a form action, tracking whether it is busy and turning failures into a readable message.
export function useAction() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusy(false);
    }
  }
  return { busy, error, run, setError };
}
