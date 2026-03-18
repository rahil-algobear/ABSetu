"use client";

import { PieChart, Pie, Cell, ResponsiveContainer } from "recharts";

export function EnrollmentStatusChart({
  active,
  released,
}: {
  active: number;
  released: number;
}) {
  const total = active + released;

  if (total === 0) {
    return (
      <div className="flex items-center justify-center h-[280px] text-gray-400 text-sm">
        No data yet
      </div>
    );
  }

  const data = [
    { name: "Active", value: active },
    { name: "Released", value: released },
  ];
  const colors = ["#10b981", "#d1d5db"];

  return (
    <div className="flex flex-col items-center">
      <ResponsiveContainer width="100%" height={200}>
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            innerRadius={55}
            outerRadius={85}
            paddingAngle={3}
            dataKey="value"
            stroke="none"
            startAngle={90}
            endAngle={-270}
          >
            {data.map((_, index) => (
              <Cell key={`cell-${index}`} fill={colors[index]} />
            ))}
          </Pie>
        </PieChart>
      </ResponsiveContainer>
      {/* Center label */}
      <div className="-mt-[130px] mb-[50px] text-center">
        <p className="text-3xl font-bold text-gray-900">{active}</p>
        <p className="text-xs text-gray-500">Active</p>
      </div>
      {/* Legend */}
      <div className="flex items-center gap-6 mt-2">
        <div className="flex items-center gap-1.5">
          <div className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
          <span className="text-xs text-gray-600">
            Active ({active})
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-2.5 h-2.5 rounded-full bg-gray-300" />
          <span className="text-xs text-gray-600">
            Released ({released})
          </span>
        </div>
      </div>
    </div>
  );
}
