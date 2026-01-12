'use client';
import React from 'react';
import { ClerkProvider } from '@clerk/nextjs';

export default function ClerkRootProvider({ children }: { children: React.ReactNode; locale?: string }) {
  // Thin client wrapper to provide Clerk context at the app root.
  return <ClerkProvider>{children}</ClerkProvider>;
}
