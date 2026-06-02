"use client";

import Link from "next/link";
import { ChevronLeft } from "lucide-react";

interface BackLinkProps {
  href: string;
  label: string;
  className?: string;
}

export function BackLink({ href, label, className = "" }: BackLinkProps) {
  return (
    <Link
      href={href}
      className={`inline-flex items-center gap-0.5 -ml-1 text-sm text-gray-500 hover:text-gray-900 transition-colors ${className}`}
    >
      <ChevronLeft className="h-4 w-4" />
      <span className="truncate max-w-[60vw]">{label}</span>
    </Link>
  );
}
