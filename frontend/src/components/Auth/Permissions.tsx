"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  ReactNode,
} from "react";
import { authApi } from "@/services/api";
import { useAuth } from "@/services/auth";

interface PermissionsContextType {
  permissions: string[];
  loading: boolean;
  can: (permission: string) => boolean;
  canAll: (permissions: string[]) => boolean;
  canAny: (permissions: string[]) => boolean;
}

const PermissionsContext = createContext<PermissionsContextType>({
  permissions: [],
  loading: true,
  can: () => false,
  canAll: () => false,
  canAny: () => false,
});

export function PermissionsProvider({ children }: { children: ReactNode }) {
  const { isAuthenticated } = useAuth();
  const [permissions, setPermissions] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isAuthenticated) {
      setPermissions([]);
      setLoading(false);
      return;
    }

    authApi
      .getProfile()
      .then((profile) => {
        setPermissions(profile.permissions || []);
      })
      .catch(() => {
        setPermissions([]);
      })
      .finally(() => {
        setLoading(false);
      });
  }, [isAuthenticated]);

  const can = (permission: string) => permissions.includes(permission);
  const canAll = (perms: string[]) => perms.every((p) => permissions.includes(p));
  const canAny = (perms: string[]) => perms.some((p) => permissions.includes(p));

  return (
    <PermissionsContext.Provider
      value={{ permissions, loading, can, canAll, canAny }}
    >
      {children}
    </PermissionsContext.Provider>
  );
}

export function usePermissions() {
  return useContext(PermissionsContext);
}

/**
 * Conditionally renders children based on permission check.
 *
 * Usage:
 *   <Can permission="beneficiary:create">
 *     <Button>Add Beneficiary</Button>
 *   </Can>
 *
 *   <Can permissions={["reports:view", "reports:export"]}>
 *     <Button>Export</Button>
 *   </Can>
 */
export function Can({
  permission,
  permissions: requiredPermissions,
  children,
  fallback = null,
}: {
  permission?: string;
  permissions?: string[];
  children: ReactNode;
  fallback?: ReactNode;
}) {
  const { can, canAll } = usePermissions();

  if (permission) {
    return can(permission) ? <>{children}</> : <>{fallback}</>;
  }

  if (requiredPermissions && requiredPermissions.length > 0) {
    return canAll(requiredPermissions) ? <>{children}</> : <>{fallback}</>;
  }

  return <>{children}</>;
}
