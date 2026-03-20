"use client";

import { RecentActivity } from "@/types";
import { Calendar, Users } from "lucide-react";

export function RecentActivitiesTable({
  activities,
}: {
  activities: RecentActivity[];
}) {
  if (activities.length === 0) {
    return (
      <div className="text-center py-8 text-gray-400 text-sm">
        No activities recorded yet
      </div>
    );
  }

  return (
    <div className="overflow-x-auto -mx-4">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-100">
            <th className="text-left py-2.5 px-4 text-xs font-medium text-gray-500 uppercase tracking-wider">
              Date
            </th>
            <th className="text-left py-2.5 px-4 text-xs font-medium text-gray-500 uppercase tracking-wider">
              Title
            </th>
            <th className="text-left py-2.5 px-4 text-xs font-medium text-gray-500 uppercase tracking-wider">
              Type
            </th>
            <th className="text-right py-2.5 px-4 text-xs font-medium text-gray-500 uppercase tracking-wider">
              Participants
            </th>
          </tr>
        </thead>
        <tbody>
          {activities.map((activity) => (
            <tr
              key={activity.id}
              className="border-b border-gray-50 hover:bg-gray-50 transition-colors"
            >
              <td className="py-2.5 px-4">
                <div className="flex items-center gap-1.5 text-gray-700">
                  <Calendar className="h-3.5 w-3.5 text-gray-400" />
                  {formatDate(activity.date)}
                </div>
              </td>
              <td className="py-2.5 px-4">
                <span className="text-gray-900">
                  {activity.title || "—"}
                </span>
              </td>
              <td className="py-2.5 px-4">
                <span className="font-medium text-gray-900">
                  {activity.type_name || "—"}
                </span>
              </td>
              <td className="py-2.5 px-4 text-right">
                <div className="inline-flex items-center gap-1 text-gray-600">
                  <Users className="h-3.5 w-3.5" />
                  {activity.participant_count}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
