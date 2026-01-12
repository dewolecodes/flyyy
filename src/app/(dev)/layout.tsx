import { ReactNode } from 'react';
import { notFound } from 'next/navigation';
import { NODE_ENV } from '@/libs/env';

export default function DevLayout({ children }: { children: ReactNode }) {
  if (NODE_ENV !== 'development') {
    notFound();
  }
  return <>{children}</>;
}
