export function CorrectionsNote() {
  const configuredEmail = process.env.NEXT_PUBLIC_CONTACT_EMAIL?.trim();
  const email = configuredEmail && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(configuredEmail) ? configuredEmail : null;

  return email ? (
    <p>
      Something needs a correction? Write to <a className="sh-inline-link" href={`mailto:${email}`}>{email}</a>.
      {" "}For current prices, availability and arrangements, please contact the venue directly.
    </p>
  ) : (
    <p>
      For current venue facts, please contact the venue directly. Our launch team is establishing a dedicated corrections channel.
    </p>
  );
}