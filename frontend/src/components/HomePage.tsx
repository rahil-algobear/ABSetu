'use client';

import { useEffect } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { motion, type Variants } from 'framer-motion';
import {
  Users,
  Building2,
  CalendarCheck,
  SlidersHorizontal,
  ShieldCheck,
  BarChart3,
  ArrowRight,
  Smartphone,
  Check,
  Sparkles,
  MapPin,
} from 'lucide-react';
import { useAuth } from '../services/auth';

/* ── Animation helpers ── */

const fadeUp: Variants = {
  hidden: { opacity: 0, y: 24 },
  show: (i: number = 0) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.5, ease: [0.21, 0.47, 0.32, 0.98], delay: i * 0.08 },
  }),
};

function FadeIn({
  children,
  className,
  delay = 0,
}: {
  children: React.ReactNode;
  className?: string;
  delay?: number;
}) {
  return (
    <motion.div
      className={className}
      variants={fadeUp}
      custom={delay}
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, margin: '-80px' }}
    >
      {children}
    </motion.div>
  );
}

/* ── Content ── */

const FEATURES = [
  {
    icon: Users,
    title: 'Beneficiary records',
    body: 'Keep a living record of everyone you serve, with the exact fields your programmes need.',
    tint: 'bg-violet-50 text-violet-600',
  },
  {
    icon: Building2,
    title: 'Programmes across centers',
    body: 'Run interventions at multiple centers and manage them all from a single place.',
    tint: 'bg-indigo-50 text-indigo-600',
  },
  {
    icon: CalendarCheck,
    title: 'Sessions & attendance',
    body: 'Log sessions, assign facilitators, and mark attendance in seconds — right from the field.',
    tint: 'bg-emerald-50 text-emerald-600',
  },
  {
    icon: SlidersHorizontal,
    title: 'Fields your way',
    body: 'Define the data you capture with custom fields. No code, no rigid forms to fight.',
    tint: 'bg-amber-50 text-amber-600',
  },
  {
    icon: ShieldCheck,
    title: 'Roles & permissions',
    body: 'Give every team member exactly the access they need — and nothing they don’t.',
    tint: 'bg-rose-50 text-rose-600',
  },
  {
    icon: BarChart3,
    title: 'Reports & exports',
    body: 'Turn your data into clean reports and exports your funders and audits will love.',
    tint: 'bg-sky-50 text-sky-600',
  },
];

const STEPS = [
  {
    n: '01',
    title: 'Set up your organization',
    body: 'Add your centers, programmes, and the custom fields that matter to your work.',
  },
  {
    n: '02',
    title: 'Capture in the field',
    body: 'Your team logs sessions and marks attendance from any phone, wherever the work happens.',
  },
  {
    n: '03',
    title: 'See your impact',
    body: 'Track outcomes across programmes and export reports the moment you need them.',
  },
];

/* ── App preview mockup (hero visual) ── */

function AppPreview() {
  const sessions = [
    { name: 'IT Classes', center: 'Andheri Center', pct: 94 },
    { name: 'Life Skills', center: 'Dharavi Center', pct: 88 },
    { name: "Women's Shelter", center: 'Kurla Center', pct: 100 },
  ];

  return (
    <div className="relative">
      {/* Floating accent — enrolled */}
      <motion.div
        initial={{ opacity: 0, scale: 0.8, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ delay: 0.6, duration: 0.5 }}
        className="absolute -top-5 left-6 z-20 hidden sm:flex items-center gap-2 rounded-2xl border border-gray-100 bg-white px-3.5 py-2.5 shadow-xl"
      >
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
          <Users size={16} />
        </span>
        <div className="leading-tight">
          <p className="text-sm font-bold text-gray-900">+128</p>
          <p className="text-[11px] text-gray-500">enrolled this month</p>
        </div>
      </motion.div>

      {/* Floating accent — attendance */}
      <motion.div
        initial={{ opacity: 0, scale: 0.8, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ delay: 0.8, duration: 0.5 }}
        className="absolute -bottom-5 right-6 z-20 hidden sm:flex items-center gap-2 rounded-2xl border border-gray-100 bg-white px-3.5 py-2.5 shadow-xl"
      >
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-violet-50 text-violet-600">
          <CalendarCheck size={16} />
        </span>
        <div className="leading-tight">
          <p className="text-sm font-bold text-gray-900">92%</p>
          <p className="text-[11px] text-gray-500">attendance</p>
        </div>
      </motion.div>

      {/* Main app card */}
      <motion.div
        initial={{ opacity: 0, y: 30, rotate: -1.5 }}
        animate={{ opacity: 1, y: 0, rotate: 0 }}
        transition={{ duration: 0.7, ease: [0.21, 0.47, 0.32, 0.98] }}
        className="relative z-10 w-full rounded-[28px] border border-gray-200/80 bg-white p-4 shadow-2xl sm:p-5"
      >
        {/* Window chrome */}
        <div className="mb-4 flex items-center gap-2">
          <Image src="/logo.png" alt="ABSetu" width={28} height={28} className="rounded-lg" />
          <span className="text-sm font-bold text-gray-900">ABSetu</span>
          <div className="ml-auto flex gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-gray-200" />
            <span className="h-2.5 w-2.5 rounded-full bg-gray-200" />
            <span className="h-2.5 w-2.5 rounded-full bg-gray-200" />
          </div>
        </div>

        <p className="text-xs font-medium text-gray-400">Good morning, Asha 👋</p>
        <p className="mb-4 text-lg font-bold text-gray-900">Your outreach today</p>

        {/* Stat tiles */}
        <div className="mb-4 grid grid-cols-3 gap-2.5">
          {[
            { label: 'Beneficiaries', value: '1,248', tint: 'from-violet-500 to-indigo-500' },
            { label: 'Sessions', value: '36', tint: 'from-emerald-500 to-teal-500' },
            { label: 'Centers', value: '12', tint: 'from-amber-500 to-orange-500' },
          ].map((s) => (
            <div key={s.label} className="rounded-2xl bg-gray-50 p-3">
              <div className={`mb-2 h-1.5 w-8 rounded-full bg-gradient-to-r ${s.tint}`} />
              <p className="text-lg font-extrabold leading-none text-gray-900">{s.value}</p>
              <p className="mt-1 text-[11px] text-gray-500">{s.label}</p>
            </div>
          ))}
        </div>

        {/* Session list */}
        <div className="rounded-2xl border border-gray-100 p-1.5">
          <p className="px-2.5 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
            Recent sessions
          </p>
          <div className="space-y-1">
            {sessions.map((s) => (
              <div
                key={s.name}
                className="flex items-center gap-3 rounded-xl px-2.5 py-2 transition-colors hover:bg-gray-50"
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-violet-50 text-violet-600">
                  <CalendarCheck size={15} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-gray-900">{s.name}</p>
                  <p className="flex items-center gap-1 truncate text-[11px] text-gray-500">
                    <MapPin size={10} /> {s.center}
                  </p>
                </div>
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold ${
                    s.pct >= 90
                      ? 'bg-emerald-50 text-emerald-600'
                      : 'bg-amber-50 text-amber-600'
                  }`}
                >
                  {s.pct}%
                </span>
              </div>
            ))}
          </div>
        </div>
      </motion.div>
    </div>
  );
}

/* ── Page ── */

export default function HomePage() {
  const { isAuthenticated } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (isAuthenticated) router.replace('/dashboard');
  }, [isAuthenticated, router]);

  const goToApp = (e: React.MouseEvent) => {
    e.preventDefault();
    router.push(isAuthenticated ? '/dashboard' : '/login?redirect=/dashboard');
  };

  return (
    <main className="overflow-hidden bg-white">
      {/* ── Hero ── */}
      <section className="relative">
        {/* Gradient blobs (echoing the login page) */}
        <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute -top-32 left-1/2 h-[460px] w-[760px] -translate-x-1/2 rounded-full bg-violet-200/45 blur-3xl" />
          <div className="absolute -right-32 top-10 h-[420px] w-[420px] rounded-full bg-indigo-200/40 blur-3xl" />
          <div className="absolute -left-32 top-40 h-[380px] w-[380px] rounded-full bg-emerald-200/30 blur-3xl" />
        </div>

        <div className="relative mx-auto grid max-w-6xl items-center gap-12 px-5 pb-20 pt-14 sm:px-6 lg:grid-cols-2 lg:gap-8 lg:pb-28 lg:pt-20">
          {/* Copy */}
          <div className="text-center lg:text-left">
            <FadeIn>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-violet-200 bg-violet-50 px-3.5 py-1.5 text-sm font-semibold text-violet-700">
                <Sparkles size={14} />
                Outreach management, built for NGOs
              </span>
            </FadeIn>

            <FadeIn delay={1}>
              <h1 className="mt-5 text-4xl font-extrabold leading-[1.1] tracking-tight text-gray-900 sm:text-5xl lg:text-6xl">
                Run your outreach.
                <br />
                <span className="bg-gradient-to-r from-violet-600 via-indigo-600 to-violet-600 bg-clip-text text-transparent">
                  Not your spreadsheets.
                </span>
              </h1>
            </FadeIn>

            <FadeIn delay={2}>
              <p className="mx-auto mt-5 max-w-xl text-lg leading-relaxed text-gray-600 lg:mx-0">
                ABSetu helps your team track beneficiaries, run programmes across centers, and
                record every session and attendance — from any phone in the field. Customizable to
                exactly how your NGO works.
              </p>
            </FadeIn>

            <FadeIn delay={3}>
              <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row lg:justify-start">
                <button
                  onClick={goToApp}
                  className="group inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 px-7 py-3.5 text-base font-semibold text-white shadow-lg shadow-violet-600/25 transition-all hover:shadow-xl hover:shadow-violet-600/30 hover:brightness-110 sm:w-auto"
                >
                  Get started
                  <ArrowRight size={18} className="transition-transform group-hover:translate-x-0.5" />
                </button>
                <a
                  href="#features"
                  className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-gray-300 bg-white px-7 py-3.5 text-base font-semibold text-gray-700 transition-colors hover:bg-gray-50 sm:w-auto"
                >
                  See how it works
                </a>
              </div>
            </FadeIn>

            <FadeIn delay={4}>
              <p className="mt-5 flex items-center justify-center gap-2 text-sm text-gray-500 lg:justify-start">
                <ShieldCheck size={15} className="text-emerald-500" />
                Sign in with your phone number — no passwords to remember.
              </p>
            </FadeIn>
          </div>

          {/* Visual */}
          <div className="relative">
            <AppPreview />
          </div>
        </div>

        {/* Value strip */}
        <div className="relative border-y border-gray-100 bg-white/60 backdrop-blur">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-center gap-x-8 gap-y-3 px-5 py-5 text-sm font-medium text-gray-500 sm:px-6">
            {['Replaces spreadsheets', 'Works on any phone', 'Custom fields, no code', 'Set up in minutes'].map(
              (item) => (
                <span key={item} className="inline-flex items-center gap-2">
                  <Check size={16} className="text-violet-500" />
                  {item}
                </span>
              ),
            )}
          </div>
        </div>
      </section>

      {/* ── Features ── */}
      <section id="features" className="scroll-mt-20 bg-gray-50/60">
        <div className="mx-auto max-w-6xl px-5 py-20 sm:px-6 lg:py-28">
          <FadeIn className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-extrabold tracking-tight text-gray-900 sm:text-4xl">
              Everything your outreach needs, in one place
            </h2>
            <p className="mt-4 text-lg text-gray-600">
              From the first intake to the funder report — ABSetu connects every part of your work.
            </p>
          </FadeIn>

          <div className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f, i) => {
              const Icon = f.icon;
              return (
                <FadeIn key={f.title} delay={i % 3}>
                  <div className="group h-full rounded-2xl border border-gray-200 bg-white p-6 shadow-sm transition-all hover:-translate-y-1 hover:border-violet-200 hover:shadow-lg">
                    <span
                      className={`mb-4 inline-flex h-12 w-12 items-center justify-center rounded-xl ${f.tint}`}
                    >
                      <Icon size={22} />
                    </span>
                    <h3 className="text-lg font-bold text-gray-900">{f.title}</h3>
                    <p className="mt-2 text-[15px] leading-relaxed text-gray-600">{f.body}</p>
                  </div>
                </FadeIn>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── How it works ── */}
      <section className="bg-white">
        <div className="mx-auto max-w-6xl px-5 py-20 sm:px-6 lg:py-28">
          <FadeIn className="mx-auto max-w-2xl text-center">
            <span className="text-sm font-bold uppercase tracking-wider text-violet-600">
              How it works
            </span>
            <h2 className="mt-3 text-3xl font-extrabold tracking-tight text-gray-900 sm:text-4xl">
              Up and running in three steps
            </h2>
          </FadeIn>

          <div className="relative mt-14 grid gap-8 md:grid-cols-3">
            {/* Connector line */}
            <div className="absolute left-0 right-0 top-7 hidden h-px bg-gradient-to-r from-transparent via-violet-200 to-transparent md:block" />
            {STEPS.map((s, i) => (
              <FadeIn key={s.n} delay={i} className="relative text-center">
                <div className="relative z-10 mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-600 to-indigo-600 text-lg font-extrabold text-white shadow-lg shadow-violet-600/25">
                  {s.n}
                </div>
                <h3 className="mt-5 text-xl font-bold text-gray-900">{s.title}</h3>
                <p className="mx-auto mt-2 max-w-xs text-[15px] leading-relaxed text-gray-600">
                  {s.body}
                </p>
              </FadeIn>
            ))}
          </div>
        </div>
      </section>

      {/* ── Mobile-first highlight ── */}
      <section className="bg-gray-50/60">
        <div className="mx-auto grid max-w-6xl items-center gap-12 px-5 py-20 sm:px-6 lg:grid-cols-2 lg:py-28">
          <FadeIn>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3.5 py-1.5 text-sm font-semibold text-emerald-700">
              <Smartphone size={14} />
              Built for the field
            </span>
            <h2 className="mt-5 text-3xl font-extrabold tracking-tight text-gray-900 sm:text-4xl">
              Made for the work, not the back office
            </h2>
            <p className="mt-4 text-lg leading-relaxed text-gray-600">
              Your team works on the ground, not at a desk. ABSetu is mobile-first, so logging a
              session or marking attendance takes seconds on the phone already in their pocket.
            </p>
            <ul className="mt-6 space-y-3">
              {[
                'Mark attendance with a tap',
                'Capture beneficiary details on the go',
                'Permissions keep each role focused',
              ].map((item) => (
                <li key={item} className="flex items-center gap-3 text-[15px] text-gray-700">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
                    <Check size={14} />
                  </span>
                  {item}
                </li>
              ))}
            </ul>
          </FadeIn>

          <FadeIn delay={1} className="flex justify-center">
            {/* Phone frame */}
            <div className="relative w-[260px] rounded-[2.5rem] border-[10px] border-gray-900 bg-gray-900 shadow-2xl">
              <div className="absolute left-1/2 top-2 h-5 w-24 -translate-x-1/2 rounded-full bg-gray-900" />
              <div className="overflow-hidden rounded-[1.8rem] bg-white">
                <div className="flex items-center gap-2 bg-gradient-to-r from-violet-600 to-indigo-600 px-4 pb-4 pt-7 text-white">
                  <Image src="/logo.png" alt="" width={26} height={26} className="rounded-lg" />
                  <span className="text-sm font-bold">ABSetu</span>
                </div>
                <div className="space-y-3 p-4">
                  <div className="rounded-xl bg-violet-50 p-3">
                    <p className="text-[11px] font-semibold text-violet-600">TODAY · ANDHERI</p>
                    <p className="text-sm font-bold text-gray-900">IT Classes</p>
                  </div>
                  {['Aarav S.', 'Diya M.', 'Kabir R.', 'Meera J.'].map((n, idx) => (
                    <div key={n} className="flex items-center gap-3">
                      <span className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-100 text-xs font-bold text-gray-600">
                        {n.split(' ')[0][0]}
                      </span>
                      <span className="flex-1 text-sm font-medium text-gray-700">{n}</span>
                      <span
                        className={`flex h-6 w-6 items-center justify-center rounded-full ${
                          idx === 2 ? 'bg-gray-100 text-gray-400' : 'bg-emerald-500 text-white'
                        }`}
                      >
                        <Check size={13} />
                      </span>
                    </div>
                  ))}
                  <div className="rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 py-2.5 text-center text-sm font-semibold text-white">
                    Save attendance
                  </div>
                </div>
              </div>
            </div>
          </FadeIn>
        </div>
      </section>

      {/* ── Final CTA ── */}
      <section className="bg-white">
        <div className="mx-auto max-w-6xl px-5 pb-24 pt-4 sm:px-6">
          <FadeIn>
            <div className="relative overflow-hidden rounded-[32px] bg-gradient-to-br from-violet-600 via-indigo-600 to-violet-700 px-6 py-16 text-center shadow-xl sm:px-12">
              {/* decorative glow */}
              <div aria-hidden className="pointer-events-none absolute inset-0">
                <div className="absolute -left-10 -top-10 h-56 w-56 rounded-full bg-white/10 blur-2xl" />
                <div className="absolute -bottom-12 right-0 h-64 w-64 rounded-full bg-white/10 blur-2xl" />
              </div>
              <div className="relative">
                <Image
                  src="/logo.png"
                  alt="ABSetu"
                  width={56}
                  height={56}
                  className="mx-auto mb-5 rounded-2xl shadow-lg"
                />
                <h2 className="text-3xl font-extrabold tracking-tight text-white sm:text-4xl">
                  Bring your outreach together
                </h2>
                <p className="mx-auto mt-4 max-w-xl text-lg text-violet-100">
                  <span className="font-semibold text-white">Setu</span> means &ldquo;bridge&rdquo; —
                  and that&rsquo;s what we build: a clear line from your mission to your impact.
                </p>
                <button
                  onClick={goToApp}
                  className="group mt-8 inline-flex items-center justify-center gap-2 rounded-xl bg-white px-8 py-3.5 text-base font-semibold text-violet-700 shadow-lg transition-all hover:shadow-xl hover:brightness-105"
                >
                  Get started
                  <ArrowRight size={18} className="transition-transform group-hover:translate-x-0.5" />
                </button>
              </div>
            </div>
          </FadeIn>
        </div>
      </section>
    </main>
  );
}
