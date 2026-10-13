export function Legal({ kind }: { kind: 'terms' | 'privacy' }) {
  return (
    <div className="container page narrow">
      <h1>{kind === 'terms' ? 'Terms of service' : 'Privacy policy'}</h1>
      <p className="muted">
        Placeholder. Replace this page with your {kind === 'terms' ? 'terms of service' : 'privacy policy'} before launch.
        The App Store and Play Store both require a privacy policy URL.
      </p>
      {kind === 'privacy' && (
        <p>
          What we collect: your name, phone number and/or email, vehicle details, the locations you book washes at, and your
          washer's location while they travel to you. Payments are processed by Stripe; we never store card numbers.
          You can delete your account at any time from the Account page or the app.
        </p>
      )}
    </div>
  );
}
