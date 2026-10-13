import { StripeProvider, useStripe } from '@stripe/stripe-react-native';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { api } from './api';

export interface PaymentSheetParams { clientSecret: string; customerId: string; ephemeralKey: string; publishableKey: string }
interface ClientConfig { paymentsMode: 'stripe' | 'mock'; stripePublishableKey: string; pointValueCents: number }

const ConfigContext = createContext<ClientConfig>({ paymentsMode: 'mock', stripePublishableKey: '', pointValueCents: 10 });
export const useClientConfig = () => useContext(ConfigContext);

/** Loads /config and, when the API runs live Stripe, wraps the app in StripeProvider. */
export function PaymentsProvider({ children }: { children: ReactNode }) {
  const [config, setConfig] = useState<ClientConfig>({ paymentsMode: 'mock', stripePublishableKey: '', pointValueCents: 10 });
  useEffect(() => { api<ClientConfig>('/config').then(setConfig).catch(() => {}); }, []);
  const inner = <ConfigContext.Provider value={config}>{children}</ConfigContext.Provider>;
  if (!config.stripePublishableKey) return inner;
  return (
    <StripeProvider publishableKey={config.stripePublishableKey} merchantIdentifier="merchant.com.example.carwash" urlScheme="carwash-customer">
      {inner}
    </StripeProvider>
  );
}

/**
 * Shows Stripe's PaymentSheet (cards, Apple Pay, Google Pay). Resolves true when the customer completed it,
 * false when they closed it. With no params (mock mode or nothing to pay) it resolves true immediately.
 */
export function usePaymentSheet() {
  const { initPaymentSheet, presentPaymentSheet } = useStripe();
  return async (params: PaymentSheetParams | null, label = 'Sparkle Wash'): Promise<boolean> => {
    if (!params) return true;
    const init = await initPaymentSheet({
      merchantDisplayName: 'Sparkle Wash',
      customerId: params.customerId,
      customerEphemeralKeySecret: params.ephemeralKey,
      paymentIntentClientSecret: params.clientSecret,
      allowsDelayedPaymentMethods: false,
      returnURL: 'carwash-customer://stripe-redirect',
      applePay: { merchantCountryCode: 'ZA' },
      googlePay: { merchantCountryCode: 'ZA', testEnv: params.publishableKey.startsWith('pk_test'), label },
    });
    if (init.error) throw new Error(init.error.message);
    const { error } = await presentPaymentSheet();
    if (error) {
      if (error.code === 'Canceled') return false;
      throw new Error(error.message);
    }
    return true;
  };
}
