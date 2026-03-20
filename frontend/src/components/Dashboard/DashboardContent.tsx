"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/services/auth";
import { dashboardApi } from "@/services/api";
import { DashboardFilters } from "@/types";
import { PageContent } from "@/components/ui/page-content";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Users,
  Activity,
  UserCheck,
  ClipboardList,
  TrendingUp,
  Layers,
  BarChart3,
} from "lucide-react";
import { DashboardFiltersBar } from "./DashboardFilters";
import { ActivityTimelineChart } from "./charts/ActivityTimelineChart";
import { EntitiesByTypeChart } from "./charts/EntitiesByTypeChart";
import { ActivitiesByTypeChart } from "./charts/ActivitiesByTypeChart";
import { EnrollmentStatusChart } from "./charts/EnrollmentStatusChart";
import { DimensionBreakdownChart } from "./charts/DimensionBreakdownChart";
import { RecentActivitiesTable } from "./RecentActivitiesTable";

export default function DashboardContent() {
  const { isAuthenticated } = useAuth();
  const [filters, setFilters] = useState<DashboardFilters>({});

  const { data: stats, isLoading } = useQuery({
    queryKey: ["dashboard-stats", filters],
    queryFn: () => dashboardApi.getStats(filters),
    staleTime: 2 * 60 * 1000,
    enabled: isAuthenticated,
  });

  if (!isAuthenticated) {
    return null;
  }

  const hasFilters =
    (filters.dimension_value_ids?.length ?? 0) > 0 ||
    !!filters.activity_type_id;

  const dimensionEntries = Object.entries(stats?.activities_by_dimension ?? {});

  return (
    <PageContent>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="mt-1 text-sm text-gray-500">
          Overview of your organization&apos;s data
        </p>
      </div>

      {/* Filters */}
      <DashboardFiltersBar filters={filters} onChange={setFilters} />

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard
          title={`Total $Entities`}
          value={stats?.total_entities}
          icon={<Users className="h-5 w-5 text-blue-600" />}
          color="blue"
          loading={isLoading}
        />
        <StatCard
          title={`${hasFilters ? "Filtered" : "Total"} $Activities`}
          value={stats?.total_activities}
          icon={<Activity className="h-5 w-5 text-emerald-600" />}
          color="emerald"
          loading={isLoading}
        />
        <StatCard
          title={`Active $Enrollments`}
          value={stats?.active_enrollments}
          subtitle={stats ? `${stats.total_enrollments} total` : undefined}
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
                Activities Over Time
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
                Enrollment Status
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

      {/* Charts Row 2: By Type */}
      <div className="grid grid-cols-1 gap-4 mb-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-gray-500" />
              Activities by Activity Type
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <ChartSkeleton height={280} />
            ) : (
              <ActivitiesByTypeChart
                data={stats?.activities_by_type ?? []}
              />
            )}
          </CardContent>
        </Card>
      </div>

      {/* Dimension Breakdowns */}
      {dimensionEntries.length > 0 && (
        <div
          className={`grid grid-cols-1 ${
            dimensionEntries.length > 1 ? "lg:grid-cols-2" : ""
          } gap-4 mb-4`}
        >
          {dimensionEntries.map(([dimName, items], idx) => (
            <Card key={dimName}>
              <CardHeader>
                <CardTitle className="text-base font-semibold flex items-center gap-2">
                  <Layers className="h-4 w-4 text-gray-500" />
                  Activities by {dimName}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <ChartSkeleton height={240} />
                ) : (
                  <DimensionBreakdownChart
                    dimensionName={dimName}
                    data={items}
                    colorIndex={idx}
                  />
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Entities by Type + Enrollments Over Time */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <Users className="h-4 w-4 text-gray-500" />
              Entities by Type
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
        {(stats?.enrollments_over_time?.length ?? 0) > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-gray-500" />
                Enrollments Over Time
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ActivityTimelineChart
                data={stats?.enrollments_over_time ?? []}
                color="#8b5cf6"
              />
            </CardContent>
          </Card>
        )}
      </div>

      {/* Recent Activities */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <Activity className="h-4 w-4 text-gray-500" />
            Recent Activities
            {hasFilters && (
              <span className="text-xs font-normal text-gray-400 ml-1">
                (filtered)
              </span>
            )}
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
