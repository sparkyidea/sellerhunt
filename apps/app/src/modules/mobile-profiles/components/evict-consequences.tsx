/**
 * What an evict actually does, spelled out in both evict dialogs. The order is
 * the order it happens in: cache cleared, fence bumped, next scan re-mints.
 */
export function EvictConsequences({ target }: { target: string }) {
  const steps = [
    `Clears the cached bearer on ${target}.`,
    "Bumps the revision, so a scan run holding the old bearer stops and reloads the profile.",
    "The next scan derives a fresh bearer from the stored credentials. Credentials are not touched.",
  ];

  return (
    <ol className="flex flex-col gap-2 rounded-lg bg-muted p-3 text-sm leading-relaxed">
      {steps.map((step, index) => (
        <li className="flex gap-2" key={step}>
          <span className="text-muted-foreground">{index + 1}.</span>
          <span>{step}</span>
        </li>
      ))}
    </ol>
  );
}
