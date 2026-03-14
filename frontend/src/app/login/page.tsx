import type { Metadata } from 'next';
import { createPageMetadata } from '@/utils/metadata';
import LoginClient from './LoginClient';

export const metadata: Metadata = createPageMetadata('Login', 'Sign in to your account');

export default function LoginPage() {
  return <LoginClient />;
}
