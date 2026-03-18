"use client";

import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/services/auth";
import { dashboardApi } from "@/services/api";
import { useVocabulary } from "@/hooks/useVocabulary";
import { PageContent } from "@/components/ui/page-content";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Users,
  Activity,
  UserCheck,
  ClipboardList,
  Calendar,
  TrendingUp,
} from "lucide-react";
import { ActivityTimelineChart } from "./charts/ActivityTimelineChart";
import { EntitiesByTypeChart } from "./charts/EntitiesByTypeChart";
import { ActivitiesByCategoryChart } from "./charts/ActivitiesByCategoryChart";
import { EnrollmentStatusChart } from "./charts/EnrollmentStatusChart";
import { RecentActivitiesTable } from "./RecentActivitiesTable";

export default function DashboardContent() {
  const { isAuthenticated } = useAuth();
  const { v, vPlural } = useVocabulary();

  const { data: stats, isLoading } = useQuery({
    queryKey: ["dashboard-stats"],
    queryFn: dashboardApi.getStats,
    staleTime: 2 * 60 * 1000,
    enabled: isAuthenticated,
  });

  if (!isAuthenticated) {
    return null;
  }

  return (
    <PageContent>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="mt-1 text-sm text-gray-500">
          Overview of your organization&apos;s data
        </p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard
          title={`Total ${vPlural("entity")}`}
          value={stats?.total_entities}
          icon={<Users className="h-5 w-5 text-blue-600" />}
          color="blue"
          loading={isLoading}
        />
        <StatCard
          title={`Total ${vPlural("activity")}`}
          value={stats?.total_activities}
          icon={<Activity className="h-5 w-5 text-emerald-600" />}
          color="emerald"
          loading={isLoading}
        />
        <StatCard
          title={`Active ${vPlural("enrollment")}`}
          value={stats?.active_enrollments}
          subtitle={
            stats
              ? `${stats.total_enrollments} total`
              : undefined
          }
          icon={<UserCheck className="h-5 w-5 text-violet-600" />}
          color="violet"
          loading={isLoading}
        />
        <StatCard
          title="Team Members"
          value={stats?.total_users}
          icon={<ClipboardList className="h-5 w-5 text-amber-600" />}
          color="amber"
          loading={isLoading}
        />
      </div>

      {/* Charts Row 1: Activity Timeline + Enrollment Status */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-gray-500" />
                {vPlural("activity")} Over Time
              </CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <ChartSkeleton height={280} />
              ) : (
                <ActivityTimelineChart
                  data={stats?.activities_over_time ?? []}
                />
              )}
            </CardContent>
          </Card>
        </div>
        <div>
          <Card className="h-full">
            <CardHeader>
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <UserCheck className="h-4 w-4 text-gray-500" />
                {v("enrollment")} Status
              </CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <ChartSkeleton height={280} />
              ) : (
                <EnrollmentStatusChart
                  active={stats?.active_enrollments ?? 0}
                  released={
                    (stats?.total_enrollments ?? 0) -
                    (stats?.active_enrollments ?? 0)
                  }
                />
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Charts Row 2: Entities by Type + Activities by Category */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <Users className="h-4 w-4 text-gray-500" />
              {vPlural("entity")} by Type
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <ChartSkeleton height={280} />
            ) : (
              <EntitiesByTypeChart data={stats?.entities_by_type ?? []} />
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <Calendar className="h-4 w-4 text-gray-500" />
              {vPlural("activity")} by Category
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <ChartSkeleton height={280} />
            ) : (
              <ActivitiesByCategoryChart
                data={stats?.activities_by_category ?? []}
              />
            )}
          </CardContent>
        </Card>
      </div>

      {/* Enrollments over time */}
      {(stats?.enrollments_over_time?.length ?? 0) > 0 && (
        <div className="mb-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-gray-500" />
                {vPlural("enrollment")} Over Time
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ActivityTimelineChart
                data={stats?.enrollments_over_time ?? []}
                color="#8b5cf6"
              />
            </CardContent>
          </Card>
        </div>
      )}

      {/* Recent Activities */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <Activity className="h-4 w-4 text-gray-500" />
            Recent {vPlural("activity")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <TableSkeleton />
          ) : (
            <RecentActivitiesTable
              activities={stats?.recent_activities ?? []}
            />
          )}
        </CardContent>
      </Card>
    </PageContent>
  );
}

// --- Stat Card ---

function StatCard({
  title,
  value,
  subtitle,
  icon,
  color,
  loading,
}: {
  title: string;
  value?: number;
  subtitle?: string;
  icon: React.ReactNode;
  color: string;
  loading: boolean;
}) {
  const bgMap: Record<string, string> = {
    blue: "bg-blue-50",
    emerald: "bg-emerald-50",
    violet: "bg-violet-50",
    amber: "bg-amber-50",
  };

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-3">
          <div
            className={`flex-shrink-0 rounded-lg p-2.5 ${bgMap[color] || "bg-gray-50"}`}
          >
            {icon}
          </div>
          <div className="min-w-0">
            <p className="text-xs font-medium text-gray-500 truncate">
              {title}
            </p>
            {loading ? (
              <div className="h-7 w-16 bg-gray-200 rounded animate-pulse mt-1" />
            ) : (
              <>
                <p className="text-2xl font-bold text-gray-900">
                  {value?.toLocaleString() ?? 0}
                </p>
                {subtitle && (
                  <p className="text-xs text-gray-400">{subtitle}</p>
                )}
              </>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// --- Skeletons ---

function ChartSkeleton({ height }: { height: number }) {
  return (
    <div
      className="bg-gray-100 rounded-lg animate-pulse"
      style={{ height }}
    />
  );
}

function TableSkeleton() {
  return (
    <div className="space-y-3">
      {[...Array(5)].map((_, i) => (
        <div key={i} className="h-10 bg-gray-100 rounded animate-pulse" />
      ))}
    </div>
  );
}
