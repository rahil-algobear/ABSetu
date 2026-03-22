"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { formatDate, DATE_FORMATS } from "@/utils/date";
import { isToday, parseISO } from "date-fns";
import { Clock } from "lucide-react";

interface DateTimeInputProps {
  /** ISO date or datetime string (yyyy-MM-dd or yyyy-MM-ddTHH:mm:ss) */
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  min?: string;
  max?: string;
  className?: string;
  disabled?: boolean;
}

/**
 * Date input with an optional time toggle.
 * Defaults to date-only. Clicking the clock icon reveals a time picker.
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
}: DateTimeInputProps) {
  // Detect if the current value already has a time component
  const hasTimeInValue = value.includes("T");
  const [showTime, setShowTime] = useState(hasTimeInValue);

  // Split value into date and time parts
  const datePart = value ? value.split("T")[0] : "";
  const timePart = hasTimeInValue ? value.split("T")[1]?.substring(0, 5) : "";

  const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newDate = e.target.value;
    if (!newDate) {
      onChange("");
      return;
    }
    if (showTime && timePart) {
      onChange(`${newDate}T${timePart}:00`);
    } else {
      onChange(newDate);
    }
  };

  const handleTimeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newTime = e.target.value;
    if (!datePart) return;
    if (newTime) {
      onChange(`${datePart}T${newTime}:00`);
    } else {
      // Time cleared — revert to date-only
      onChange(datePart);
    }
  };

  const toggleTime = () => {
    if (showTime) {
      // Remove time, revert to date-only
      setShowTime(false);
      if (datePart) {
        onChange(datePart);
      }
    } else {
      setShowTime(true);
    }
  };

  const todayLabel =
    datePart && isToday(parseISO(datePart)) ? " (Today)" : "";

  // Extract date-only min/max for the date input
  const minDate = min ? min.split("T")[0] : undefined;
  const maxDate = max ? max.split("T")[0] : undefined;

  return (
    <div>
      <div className="flex gap-2 items-center">
        <Input
          type="date"
          value={datePart}
          onChange={handleDateChange}
          required={required}
          min={minDate}
          max={maxDate}
          className={className}
          disabled={disabled}
        />
        {showTime && (
          <Input
            type="time"
            value={timePart}
            onChange={handleTimeChange}
            className="w-32"
            disabled={disabled}
          />
        )}
        <button
          type="button"
          onClick={toggleTime}
          disabled={disabled}
          className={`p-1.5 rounded-md transition-colors shrink-0 ${
            showTime
              ? "text-purple-600 bg-purple-50 hover:bg-purple-100"
              : "text-gray-400 hover:text-gray-600 hover:bg-gray-100"
          }`}
          title={showTime ? "Remove time" : "Add time"}
        >
          <Clock className="h-4 w-4" />
        </button>
      </div>
      {datePart && (
        <p className="text-xs text-gray-500 mt-1">
          {showTime && timePart
            ? formatDate(value, DATE_FORMATS.DATETIME)
            : formatDate(datePart, DATE_FORMATS.DISPLAY)}
          {todayLabel}
        </p>
      )}
    </div>
  );
}
