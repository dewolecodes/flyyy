'use client';

export default function AuthLayout(props: {
  children: React.ReactNode;
  params: { locale: string };
}) {
  // ClerkProvider is provided at the app root by ClerkRootProvider (client-side).
  // This layout only needs to render children.
  return <>{props.children}</>;
}
