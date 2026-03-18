'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Alert } from '@/components/ui/alert';
import CountryCodeSelect from '@/components/Auth/CountryCodeSelect';
import RegisterForm from '@/components/Auth/RegisterForm';
import { ArrowLeft } from 'lucide-react';
import { useAuth } from '@/services/auth';
import { authApi } from '@/services/api';

type FlowStep = 'phone' | 'register' | 'otp';

function LoginContent() {
  const [countryCode, setCountryCode] = useState('+91');
  const [mobileNumber, setMobileNumber] = useState('');
  const [otp, setOtp] = useState('');
  const [currentStep, setCurrentStep] = useState<FlowStep>('phone');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const { login, isAuthenticated } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get('redirect') || '/';
  const maskedPhone = mobileNumber
    ? `${countryCode} ${mobileNumber.slice(0, 3)}${'•'.repeat(Math.max(0, mobileNumber.length - 5))}${mobileNumber.slice(-2)}`
    : countryCode;

  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      await authApi.login({
        country_code: countryCode,
        mobile_number: mobileNumber,
      });
      setCurrentStep('otp');
    } catch (error: any) {
      if (error?.detail === "User not found. Please register." || error?.message === "User not found. Please register.") {
        setCurrentStep('register');
      } else {
        setError('Failed to send OTP. Please try again.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      const data = await authApi.verifyOTP({
        country_code: countryCode,
        mobile_number: mobileNumber,
        otp_code: otp,
      });
      login(data.access_token, data.refresh_token, data.refresh_token_expires_in_days, redirectTo);
      // Navigate immediately — don't rely solely on the useEffect.
      // router.refresh() invalidates the Router Cache so server
      // components re-render with the new auth cookies.
      router.replace(redirectTo);
      router.refresh();
    } catch {
      setError('Invalid OTP. Please try again.');
      setIsLoading(false);
    }
  };

  const handleRegistrationSuccess = () => {
    setCurrentStep('otp');
  };

  const handleResend = async () => {
    setError('');
    setIsLoading(true);
    try {
      await authApi.login({
        country_code: countryCode,
        mobile_number: mobileNumber,
      });
    } catch {
      setError('Couldn\'t resend the code. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isAuthenticated) {
      router.replace(redirectTo);
    }
  }, [isAuthenticated, router, redirectTo]);

  const heading =
    currentStep === 'phone'
      ? { title: 'Welcome back', desc: 'Sign in with your phone number. We\'ll text you a one-time code.' }
      : currentStep === 'register'
        ? { title: 'Create your account', desc: 'Complete your profile to finish setting up access.' }
        : { title: 'Enter the code', desc: `We sent a 6-digit code to ${maskedPhone}.` };

  const renderStep = () => {
    switch (currentStep) {
      case 'phone':
        return (
          <form onSubmit={handleSendOtp} className="space-y-4">
            <div>
              <label htmlFor="phone" className="block text-sm font-medium text-gray-700 mb-1">
                Phone Number
              </label>
              <div className="flex gap-2">
                <div className="w-32">
                  <CountryCodeSelect
                    value={countryCode}
                    onChange={setCountryCode}
                  />
                </div>
                <Input
                  type="tel"
                  value={mobileNumber}
                  onChange={(e) => setMobileNumber(e.target.value.replace(/\D/g, '').slice(0, 15))}
                  placeholder="Enter mobile number"
                  className="flex-1"
                  required
                />
              </div>
              <p className="mt-1 text-sm text-gray-500">
                Enter your mobile number (6-15 digits)
              </p>
            </div>
            <Button
              type="submit"
              disabled={isLoading || mobileNumber.length < 6}
              className="w-full"
            >
              {isLoading ? 'Sending code...' : 'Continue'}
            </Button>
          </form>
        );

      case 'register':
        return (
          <RegisterForm
            countryCode={countryCode}
            mobileNumber={mobileNumber}
            onBack={() => setCurrentStep('phone')}
            onSuccess={handleRegistrationSuccess}
            hideHeader
          />
        );

      case 'otp':
        return (
          <form onSubmit={handleVerifyOtp} className="space-y-4">
            <div>
              <label htmlFor="otp" className="block text-sm font-medium text-gray-700 mb-1">
                One-time code
              </label>
              <Input
                type="text"
                id="otp"
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="Enter 6-digit code"
                className="w-full"
                required
              />
            </div>
            <Button
              type="submit"
              disabled={isLoading || otp.length !== 6}
              className="w-full"
            >
              {isLoading ? 'Verifying...' : 'Verify'}
            </Button>
            <div className="flex flex-col sm:flex-row gap-2">
              <Button type="button" variant="ghost" onClick={() => setCurrentStep('phone')} className="w-full">
                <span className="inline-flex items-center gap-2 text-blue-700">
                  <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                  Change number
                </span>
              </Button>
              <Button type="button" variant="ghost" onClick={handleResend} className="w-full">
                <span className="text-blue-700">Resend code</span>
              </Button>
            </div>
          </form>
        );
    }
  };

  return (
    <main className="min-h-[calc(100vh-64px)] bg-gradient-to-b from-slate-50 via-white to-white flex items-center justify-center p-4">
      <div aria-hidden="true" className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -top-24 left-1/2 h-[380px] w-[680px] -translate-x-1/2 rounded-full bg-blue-200/40 blur-3xl" />
        <div className="absolute -bottom-24 right-[-120px] h-[420px] w-[420px] rounded-full bg-violet-200/35 blur-3xl" />
        <div className="absolute top-[25%] left-[-120px] h-[360px] w-[360px] rounded-full bg-emerald-200/30 blur-3xl" />
      </div>

      <div className="relative w-full max-w-md">
        <div className="rounded-3xl border border-gray-200 bg-white/85 backdrop-blur p-8 shadow-lg">
          <h1 className="text-2xl font-semibold text-gray-900 text-center">{heading.title}</h1>
          <p className="mt-2 text-sm text-gray-600 text-center">{heading.desc}</p>

          {error && (
            <Alert variant="error" className="mt-5">
              {error}
            </Alert>
          )}

          <div className="mt-6">{renderStep()}</div>
        </div>
      </div>
    </main>
  );
}

export default function LoginClient() {
  return (
    <Suspense fallback={
      <main className="min-h-[calc(100vh-64px)] flex items-center justify-center p-4">
        <div className="w-full max-w-md rounded-3xl border border-gray-200 bg-white/85 p-8 shadow-lg animate-pulse">
          <div className="h-7 bg-gray-200 rounded w-2/3 mx-auto" />
          <div className="h-4 bg-gray-100 rounded w-4/5 mx-auto mt-3" />
          <div className="mt-6 space-y-4">
            <div className="h-10 bg-gray-100 rounded" />
            <div className="h-10 bg-gray-200 rounded" />
          </div>
        </div>
      </main>
    }>
      <LoginContent />
    </Suspense>
  );
}
