import '@/styles/global.css';

import ClerkRootProvider from '../../components/ClerkRootProvider';
import { NextIntlClientProvider, useMessages } from 'next-intl';
import { unstable_setRequestLocale } from 'next-intl/server';

import { DemoBadge } from '@/components/DemoBadge';

export default function RootLayout(props: {
  children: React.ReactNode;
  params: { locale: string };
}) {
  unstable_setRequestLocale(props.params.locale);
  const messages = useMessages();

  return (
    <html lang={props.params.locale} suppressHydrationWarning>
      <body className="bg-background text-foreground antialiased" suppressHydrationWarning>
        <ClerkRootProvider locale={props.params.locale}>
          <NextIntlClientProvider
            locale={props.params.locale}
            messages={messages}
          >
            {props.children}
            <DemoBadge />
          </NextIntlClientProvider>
        </ClerkRootProvider>
      </body>
    </html>
  );
}
