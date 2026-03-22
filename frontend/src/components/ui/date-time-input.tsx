"use client";

import { useState, forwardRef } from "react";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import { parseISO, format, isToday } from "date-fns";
import { Clock, Calendar } from "lucide-react";
import { cn } from "@/utils/cn";

interface DateTimeInputProps {
  /** ISO date or datetime string (yyyy-MM-dd or yyyy-MM-ddTHH:mm:ss) */
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  min?: string;
  max?: string;
  className?: string;
  disabled?: boolean;
  /** Show the time toggle. Defaults to true. Set false for date-only fields. */
  allowTime?: boolean;
}

/** Parse an ISO date/datetime string to a Date, or null if empty/invalid. */
function parseValue(value: string): Date | null {
  if (!value) return null;
  try {
    const d = parseISO(value);
    return isNaN(d.getTime()) ? null : d;
  } catch {
    return null;
  }
}

/** Custom input that looks like the existing Input component. */
const CustomInput = forwardRef<
  HTMLButtonElement,
  { value?: string; onClick?: () => void; placeholder?: string; disabled?: boolean; showTime: boolean }
>(({ value, onClick, placeholder, disabled, showTime }, ref) => (
  <button
    type="button"
    ref={ref}
    onClick={onClick}
    disabled={disabled}
    className={cn(
      "flex items-center gap-2 rounded-md border border-input bg-background px-3 py-2 text-sm",
      "ring-offset-background placeholder:text-muted-foreground",
      "focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
      "disabled:cursor-not-allowed disabled:opacity-50",
      "text-left min-h-[38px]",
      !value && "text-muted-foreground"
    )}
  >
    <Calendar className="h-4 w-4 text-gray-400 shrink-0" />
    <span className="flex-1">{value || placeholder || "Select date..."}</span>
    {showTime && <Clock className="h-4 w-4 text-purple-500 shrink-0" />}
  </button>
));
CustomInput.displayName = "CustomInput";

/**
 * Date input with an optional time toggle.
 * Uses react-datepicker for a reliable, cross-browser experience.
 * Value is always an ISO string — date-only or with time.
 */
export function DateTimeInput({
  value,
  onChange,
  required,
  min,
  max,
  className,
  disabled,
  allowTime = true,
}: DateTimeInputProps) {
  // Treat T00:00:00 (midnight) as date-only — backend may return this for dates without time,
  // possibly with a timezone suffix (e.g. T00:00:00+00:00 or T00:00:00Z).
  const hasTimeInValue =
    allowTime && value.includes("T") && !/T00:00:00([Z+\-].*)?$/.test(value);
  const [showTime, setShowTime] = useState(hasTimeInValue);

  const selected = parseValue(value);
  const minDate = min ? parseValue(min.split("T")[0]) : undefined;
  const maxDate = max ? parseValue(max.split("T")[0]) : undefined;

  const handleChange = (date: Date | null) => {
    if (!date) {
      onChange("");
      return;
    }
    if (showTime) {
      onChange(format(date, "yyyy-MM-dd'T'HH:mm:ss"));
    } else {
      onChange(format(date, "yyyy-MM-dd"));
    }
  };

  const toggleTime = () => {
    const next = !showTime;
    setShowTime(next);
    if (selected) {
      if (next) {
        // Switching to datetime — keep current date, add current time component
        onChange(format(selected, "yyyy-MM-dd'T'HH:mm:ss"));
      } else {
        // Switching to date-only — strip time
        onChange(format(selected, "yyyy-MM-dd"));
      }
    }
  };

  const todayLabel = selected && isToday(selected) ? " (Today)" : "";

  return (
    <div className={className}>
      <div className="flex gap-2 items-center">
        <div>
          <DatePicker
            selected={selected}
            onChange={handleChange}
            showTimeSelect={showTime}
            timeIntervals={15}
            timeFormat="h:mm aa"
            dateFormat={showTime ? "dd-MMM-yyyy h:mm aa" : "dd-MMM-yyyy"}
            minDate={minDate ?? undefined}
            maxDate={maxDate ?? undefined}
            disabled={disabled}
            required={required}
            customInput={<CustomInput showTime={showTime} />}
            popperPlacement="bottom-start"
            showPopperArrow={false}
          />
        </div>
        {allowTime && (
          <button
            type="button"
            onClick={toggleTime}
            disabled={disabled}
            className={cn(
              "p-1.5 rounded-md transition-colors shrink-0",
              showTime
                ? "text-purple-600 bg-purple-50 hover:bg-purple-100"
                : "text-gray-400 hover:text-gray-600 hover:bg-gray-100"
            )}
            title={showTime ? "Remove time" : "Add time"}
          >
            <Clock className="h-4 w-4" />
          </button>
        )}
      </div>
      {selected && (
        <p className="text-xs text-gray-500 mt-1">
          {showTime
            ? format(selected, "dd-MMM-yyyy 'at' h:mm a")
            : format(selected, "dd-MMM-yyyy")}
          {todayLabel}
        </p>
      )}
    </div>
  );
}
