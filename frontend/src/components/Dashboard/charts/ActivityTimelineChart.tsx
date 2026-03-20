"use client";

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { TimeSeriesPoint } from "@/types";

function formatMonth(period: string): string {
  const [year, month] = period.split("-");
  const months = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
  ];
  return `${months[parseInt(month, 10) - 1]} '${year.slice(2)}`;
}

export function ActivityTimelineChart({
  data,
  color = "#3b82f6",
}: {
  data: TimeSeriesPoint[];
  color?: string;
}) {
  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-[280px] text-gray-400 text-sm">
        No data yet
      </div>
    );
  }

  const chartData = data.map((d) => ({
    name: formatMonth(d.period),
    count: d.count,
  }));

  return (
    <ResponsiveContainer width="100%" height={280}>
      <AreaChart data={chartData} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
        <defs>
          <linearGradient id={`gradient-${color}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={color} stopOpacity={0.2} />
            <stop offset="95%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
        <XAxis
          dataKey="name"
          tick={{ fontSize: 12, fill: "#9ca3af" }}
          tickLine={false}
          axisLine={{ stroke: "#e5e7eb" }}
        />
        <YAxis
          tick={{ fontSize: 12, fill: "#9ca3af" }}
          tickLine={false}
          axisLine={false}
          allowDecimals={false}
        />
        <Tooltip
          contentStyle={{
            backgroundColor: "white",
            border: "1px solid #e5e7eb",
            borderRadius: "8px",
            fontSize: "13px",
            boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)",
          }}
        />
        <Area
          type="monotone"
          dataKey="count"
          stroke={color}
          strokeWidth={2.5}
          fill={`url(#gradient-${color})`}
          dot={{ fill: color, strokeWidth: 0, r: 3 }}
          activeDot={{ r: 5, fill: color }}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
