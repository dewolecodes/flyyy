import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

import { AppConfig } from './AppConfig';
import { NEXT_PUBLIC_APP_URL, VERCEL_ENV, VERCEL_PROJECT_PRODUCTION_URL, VERCEL_URL } from '@/libs/env';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const MILLISECONDS_IN_ONE_DAY = 86_400_000;

export const getBaseUrl = () => {
  if (NEXT_PUBLIC_APP_URL) return NEXT_PUBLIC_APP_URL;

  if (VERCEL_ENV === 'production' && VERCEL_PROJECT_PRODUCTION_URL) {
    return `https://${VERCEL_PROJECT_PRODUCTION_URL}`;
  }

  if (VERCEL_URL) return `https://${VERCEL_URL}`;

  return 'http://localhost:3000';
};

export const getI18nPath = (url: string, locale: string) => {
  if (locale === AppConfig.defaultLocale) {
    return url;
  }

  return `/${locale}${url}`;
};
