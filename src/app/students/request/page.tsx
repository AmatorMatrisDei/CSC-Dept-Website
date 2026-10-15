export const metadata = { title: "Request to be added" };

// Placeholder. The real form needs consent wording (FERPA opt-in) and a place to send it,
// both still to be decided with the back end and requirements teams.
export default function RequestPage() {
  return (
    <div className="flex max-w-2xl flex-col gap-4">
      <h1 className="text-3xl font-semibold">Request to be added</h1>
      <p>
        Students are listed only if they opt in. A request form will go here once the consent
        wording and the review step are settled.
      </p>
    </div>
  );
}
