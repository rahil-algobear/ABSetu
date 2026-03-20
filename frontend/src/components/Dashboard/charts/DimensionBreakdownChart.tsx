"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import { CountByItem } from "@/types";

const PALETTES: Record<number, string[]> = {
  0: ["#3b82f6", "#60a5fa", "#93c5fd", "#bfdbfe", "#2563eb", "#1d4ed8"],
  1: ["#10b981", "#34d399", "#6ee7b7", "#a7f3d0", "#059669", "#047857"],
  2: ["#f59e0b", "#fbbf24", "#fcd34d", "#fde68a", "#d97706", "#b45309"],
  3: ["#8b5cf6", "#a78bfa", "#c4b5fd", "#ddd6fe", "#7c3aed", "#6d28d9"],
  4: ["#ef4444", "#f87171", "#fca5a5", "#fecaca", "#dc2626", "#b91c1c"],
  5: ["#ec4899", "#f472b6", "#f9a8d4", "#fbcfe8", "#db2777", "#be185d"],
};

export function DimensionBreakdownChart({
  dimensionName,
  data,
  colorIndex = 0,
}: {
  dimensionName: string;
  data: CountByItem[];
  colorIndex?: number;
}) {
  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-[240px] text-gray-400 text-sm">
        No data for {dimensionName}
      </div>
    );
  }

  const palette = PALETTES[colorIndex % Object.keys(PALETTES).length];
  const chartData = data.map((d) => ({ name: d.label, count: d.count }));

  return (
    <ResponsiveContainer width="100%" height={Math.max(240, data.length * 36 + 40)}>
      <BarChart
        data={chartData}
        layout="vertical"
        margin={{ top: 5, right: 20, left: 0, bottom: 5 }}
      >
        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" horizontal={false} />
        <XAxis
          type="number"
          tick={{ fontSize: 12, fill: "#9ca3af" }}
          tickLine={false}
          axisLine={{ stroke: "#e5e7eb" }}
          allowDecimals={false}
        />
        <YAxis
          type="category"
          dataKey="name"
          tick={{ fontSize: 12, fill: "#6b7280" }}
          tickLine={false}
          axisLine={false}
          width={120}
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
        <Bar dataKey="count" radius={[0, 6, 6, 0]} barSize={22}>
          {chartData.map((_, index) => (
            <Cell
              key={`cell-${index}`}
              fill={palette[index % palette.length]}
            />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
