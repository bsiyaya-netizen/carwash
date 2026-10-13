import { Elements, PaymentElement, useElements, useStripe } from '@stripe/react-stripe-js';
import { loadStripe, type Stripe } from '@stripe/stripe-js';
import { useState } from 'react';
import type { PaymentSheet } from '../lib/types';

const stripeByKey = new Map<string, Promise<Stripe | null>>();
const getStripe = (key: string) => {
  if (!stripeByKey.has(key)) stripeByKey.set(key, loadStripe(key));
  return stripeByKey.get(key)!;
};

/**
 * Stripe Payment Element in a modal: cards, Apple Pay and Google Pay (where the browser supports them).
 * Card bookings are only authorized here; the charge happens when the wash is completed.
 */
export function PaymentModal({ payment, title, note, returnPath, onDone, onClose }: {
  payment: PaymentSheet; title: string; note?: string; returnPath: string;
  onDone: () => void; onClose: () => void;
}) {
  const dark = window.matchMedia?.('(prefers-color-scheme: dark)').matches;
  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label={title}>
      <div className="modal">
        <h2>{title}</h2>
        {note && <p className="muted small">{note}</p>}
        <Elements
          stripe={getStripe(payment.publishableKey)}
          options={{ clientSecret: payment.clientSecret, appearance: { theme: dark ? 'night' : 'stripe', variables: { colorPrimary: '#13c4c4', borderRadius: '10px' } } }}
        >
          <PayForm returnPath={returnPath} onDone={onDone} onClose={onClose} />
        </Elements>
      </div>
    </div>
  );
}

function PayForm({ returnPath, onDone, onClose }: { returnPath: string; onDone: () => void; onClose: () => void }) {
  const stripe = useStripe();
  const elements = useElements();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const pay = async () => {
    if (!stripe || !elements) return;
    setBusy(true);
    setError('');
    const { error } = await stripe.confirmPayment({
      elements,
      confirmParams: { return_url: window.location.origin + returnPath },
      redirect: 'if_required',
    });
    setBusy(false);
    if (error) setError(error.message ?? 'Payment failed');
    else onDone();
  };

  return (
    <>
      <PaymentElement />
      {error && <p className="error small" style={{ marginTop: 12 }}>{error}</p>}
      <div className="row" style={{ marginTop: 18 }}>
        <button className="btn ghost grow" onClick={onClose} disabled={busy}>Not now</button>
        <button className="btn grow" onClick={pay} disabled={!stripe || busy}>{busy ? 'Processing…' : 'Confirm'}</button>
      </div>
    </>
  );
}
