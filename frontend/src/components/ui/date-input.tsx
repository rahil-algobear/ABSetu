"use client";

import { Input } from "@/components/ui/input";
import { formatDate, DATE_FORMATS } from "@/utils/date";
import { isToday, parseISO } from "date-fns";

interface DateInputProps {
  /** ISO date string (yyyy-MM-dd) */
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  /** Format for the readable hint below the input */
  displayFormat?: string;
  /** Label shown after the formatted date, e.g. "(Start)" */
  hint?: string;
  required?: boolean;
  min?: string;
  max?: string;
  className?: string;
  disabled?: boolean;
}

/**
 * Native date input with a human-readable formatted date shown below.
 * Keeps ISO (yyyy-MM-dd) value for the API while showing e.g. "20 Mar, 2026 (Today)".
 */
export function DateInput({
  value,
  onChange,
  displayFormat = DATE_FORMATS.DISPLAY,
  hint,
  required,
  min,
  max,
  className,
  disabled,
}: DateInputProps) {
  const todayLabel =
    value && isToday(parseISO(value)) ? " (Today)" : "";

  return (
    <div>
      <Input
        type="date"
        value={value}
        onChange={onChange}
        required={required}
        min={min}
        max={max}
        className={className}
        disabled={disabled}
      />
      {value && (
        <p className="text-xs text-gray-500 mt-1">
          {formatDate(value, displayFormat)}
          {todayLabel}
          {hint ? ` ${hint}` : ""}
        </p>
      )}
    </div>
  );
}
