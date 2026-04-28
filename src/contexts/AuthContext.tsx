import { createContext, useContext, useState, useCallback, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import axiosInstance from "../api/axios";
import { getUrlBlobContainerImage } from "@/lib/image-utils";

export interface ModulePermission {
  moduleId: number;
  moduleName: string;
  isManage: boolean;
  isDelete: boolean;
}

export interface AuthUser {
  email: string;
  name: string;
  firstName: string;
  lastName: string;
  username: string;
  profileImage: string;
  pictureFileName: string;
  requireApproval: boolean;
  hideProfile: boolean;
  notifyFollowInvestments: boolean;
  notifyGroupInvestments: boolean;
  unsubscribeNotifications: boolean;
  anonymousDonations: boolean;
  displayPhoto: boolean;
  twoFactorEnabled: boolean;
  token: string;
  role: string;
  hasInvestments: boolean;
  isSuperAdmin: boolean;
  permissions: ModulePermission[];
}

interface AuthContextType {
  user: AuthUser | null;
  isLoggedIn: boolean;
  token: string | null;
  role: string | null;
  isLoadingUser: boolean;
  loginWithToken: (token: string, role?: string) => void;
  login: (token?: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  updateUser: (data: any) => void;
  patchUser: (partial: Partial<AuthUser>) => void;
  hasActionPermission: (moduleName: string, action: "manage" | "delete" | "view") => boolean;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  isLoggedIn: false,
  token: null,
  role: null,
  isLoadingUser: false,
  loginWithToken: () => { },
  login: async () => { },
  logout: async () => { },
  refreshUser: async () => { },
  updateUser: () => { },
  patchUser: () => { },
  hasActionPermission: () => false,
});

function buildProfileImageUrl(data: any): string {
  if (data.pictureFile && data.pictureFile.startsWith("http")) {
    return data.pictureFile;
  }
  if (data.pictureFileName) {
    return getUrlBlobContainerImage(data.pictureFileName);
  }
  if (data.pictureFile && data.pictureFile.startsWith("data:")) {
    return data.pictureFile;
  }
  if (data.profileImage) {
    return data.profileImage;
  }
  return "";
}

function mapApiUser(data: any, token: string): AuthUser {
  return {
    email: data.email || "",
    name: data.firstName ? `${data.firstName} ${data.lastName || ""}`.trim() : data.userName || (data.email || "").split("@")[0],
    firstName: data.firstName || data.first_name || "",
    lastName: data.lastName || data.last_name || "",
    username: data.userName || data.username || (data.email || "").split("@")[0],
    profileImage: buildProfileImageUrl(data),
    pictureFileName: data.pictureFileName || "",
    requireApproval: data.isApprouveRequired ?? data.requireApproval ?? true,
    hideProfile: data.isUserHidden ?? data.hideProfile ?? false,
    notifyFollowInvestments: data.emailFromUsersOn ?? data.notifyFollowInvestments ?? false,
    notifyGroupInvestments: data.emailFromGroupsOn ?? data.notifyGroupInvestments ?? false,
    unsubscribeNotifications: data.optOutEmailNotifications ?? data.unsubscribeNotifications ?? false,
    anonymousDonations: data.isAnonymousInvestment ?? data.anonymousDonations ?? false,
    displayPhoto: data.consentToShowAvatar ?? data.displayPhoto ?? true,
    twoFactorEnabled: data.twoFactorEnabled ?? data.two_factor_enabled ?? false,
    token,
    role: data.roleName || data.role || "User",
    hasInvestments: data.hasInvestments ?? false,
    isSuperAdmin: data.isSuperAdmin ?? false,
    permissions: data.permissions || [],
  };
}

function decodeJwtRole(token: string): string {
  try {
    const payload = token.split(".")[1];
    if (!payload) return "User";
    const decoded = JSON.parse(atob(payload));
    return decoded.role || "User";
  } catch {
    return "User";
  }
}

function persistToLocalStorage(token: string, role: string) {
  try {
    localStorage.setItem("persist:root", JSON.stringify({
      role: JSON.stringify({ role }),
      token: JSON.stringify({ token }),
      _persist: JSON.stringify({ version: -1, rehydrated: true }),
    }));
  } catch { }
}

function clearPersistedStorage() {
  try {
    localStorage.clear();
  } catch { }
}

function rehydrateFromLocalStorage(): { token: string; role: string } | null {
  try {
    const raw = localStorage.getItem("persist:root");
    if (!raw) return null;
    const parsed = JSON.parse(raw);

    let token = "";
    let role = "User";

    if (parsed.token) {
      const tokenData = JSON.parse(parsed.token);
      if (tokenData.token) {
        token = tokenData.token;
      }
    }

    if (parsed.role) {
      const roleData = JSON.parse(parsed.role);
      if (roleData.role) {
        role = roleData.role;
      }
    }

    if (!token) return null;
    return { token, role };
  } catch { }
  return null;
}

async function fetchUserWithToken(token: string): Promise<AuthUser | null | "expired"> {
  try {
    const res = await axiosInstance.get(`/api/admin/user/by-token`, {
      params: { token }
    });
    return mapApiUser(res.data, token);
  } catch (error: any) {
    if (error.response?.status === 401) {
      return "expired";
    }
    return null;
  }
}

function PreviousRouteTracker() {
  const [location] = useLocation();
  const prevRef = useRef(location);

  useEffect(() => {
    localStorage.setItem("previousRoute", prevRef.current);
    prevRef.current = location;
  }, [location]);

  return null;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [isLoadingUser, setIsLoadingUser] = useState(true);
  const [user, setUser] = useState<AuthUser | null>(() => {
    const stored = rehydrateFromLocalStorage();
    if (stored) {
      return {
        email: "", name: "", firstName: "", lastName: "", username: "",
        profileImage: "", pictureFileName: "",
        requireApproval: true, hideProfile: false,
        notifyFollowInvestments: false, notifyGroupInvestments: false,
        unsubscribeNotifications: false, anonymousDonations: false, hasInvestments: false,
        displayPhoto: true,
        twoFactorEnabled: false,
        token: stored.token,
        role: stored.role,
        isSuperAdmin: false,
        permissions: [],
      };
    }
    return null;
  });

  useEffect(() => {
    let cancelled = false;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;

    const stored = rehydrateFromLocalStorage();
    if (stored) {
      const maxRetries = 3;
      const retryDelays = [1000, 2000, 4000];

      const attemptFetch = (attempt: number) => {
        fetchUserWithToken(stored.token).then((result) => {
          if (cancelled) return;
          if (result === "expired") {
            setUser(null);
            clearPersistedStorage();
            setIsLoadingUser(false);
          } else if (result) {
            result.token = stored.token;
            result.role = stored.role;
            setUser(result);
            setIsLoadingUser(false);
          } else if (attempt < maxRetries) {
            retryTimer = setTimeout(() => attemptFetch(attempt + 1), retryDelays[attempt]);
          } else {
            setUser(null);
            clearPersistedStorage();
            setIsLoadingUser(false);
          }
        }).catch(() => {
          if (cancelled) return;
          if (attempt < maxRetries) {
            retryTimer = setTimeout(() => attemptFetch(attempt + 1), retryDelays[attempt]);
          } else {
            setUser(null);
            clearPersistedStorage();
            setIsLoadingUser(false);
          }
        });
      };

      attemptFetch(0);
    } else {
      setIsLoadingUser(false);
    }

    return () => {
      cancelled = true;
      if (retryTimer) clearTimeout(retryTimer);
    };
  }, []);

  const loginWithToken = useCallback((token: string, role?: string) => {
    const resolvedRole = role || decodeJwtRole(token);
    persistToLocalStorage(token, resolvedRole);
    setUser({
      email: "", name: "", firstName: "", lastName: "", username: "",
      profileImage: "", pictureFileName: "",
      requireApproval: true, hideProfile: false,
      notifyFollowInvestments: false, notifyGroupInvestments: false,
      unsubscribeNotifications: false, anonymousDonations: false, hasInvestments: false,
      displayPhoto: true,
      twoFactorEnabled: false,
      token,
      role: resolvedRole,
      isSuperAdmin: false,
      permissions: [],
    });
  }, []);

  const login = useCallback(async (token?: string) => {
    setIsLoadingUser(true);
    if (token) {
      const resolvedRole = decodeJwtRole(token);
      persistToLocalStorage(token, resolvedRole);
      const result = await fetchUserWithToken(token);
      if (result === "expired") {
        setUser(null);
        clearPersistedStorage();
      } else if (result) {
        setUser(result);
      } else {
        setUser({
          email: "", name: "", firstName: "", lastName: "", username: "",
          profileImage: "", pictureFileName: "",
          requireApproval: true, hideProfile: false,
          notifyFollowInvestments: false, notifyGroupInvestments: false,
          unsubscribeNotifications: false, anonymousDonations: false, hasInvestments: false,
          displayPhoto: true,
          twoFactorEnabled: false,
          token,
          role: resolvedRole,
          isSuperAdmin: false,
          permissions: [],
        });
      }
    }
    setIsLoadingUser(false);
  }, []);

  const logout = useCallback(async () => {
    setUser(null);
    clearPersistedStorage();
  }, []);

  const updateUser = useCallback((data: any) => {
    const currentToken = user?.token || rehydrateFromLocalStorage()?.token || "";
    const currentRole = user?.role || rehydrateFromLocalStorage()?.role || "User";
    const mapped = mapApiUser(data, data.token || currentToken);
    mapped.role = currentRole;
    setUser(mapped);
  }, [user]);

  const patchUser = useCallback((partial: Partial<AuthUser>) => {
    setUser((prev) => (prev ? { ...prev, ...partial } : prev));
  }, []);

  const refreshUser = useCallback(async () => {
    setIsLoadingUser(true);
    const stored = rehydrateFromLocalStorage();
    if (stored) {
      const result = await fetchUserWithToken(stored.token);
      if (result === "expired") {
        setUser(null);
        clearPersistedStorage();
      } else if (result) {
        result.token = stored.token;
        result.role = stored.role;
        setUser(result);
      }
    }
    setIsLoadingUser(false);
  }, []);

  const isLoggedIn = !!user && !!user.token;
  const token = user?.token || null;
  const role = user?.role || null;

  const hasActionPermission = useCallback((moduleName: string, action: "manage" | "delete" | "view") => {
    if (!user) return false;
    if (user.isSuperAdmin) return true;
    if (!user.permissions?.length) return false;

    return user.permissions.some(p => {
      const pName = p.moduleName?.toLowerCase() || "";
      const mName = moduleName.toLowerCase();

      const isMatch =
        (pName === mName) ||
        (pName.replace(/-/g, ' ') === mName.replace(/-/g, ' ')) ||
        (pName + 's' === mName || pName === mName + 's');

      if (isMatch) {
        if (action === "view") return true;
        return action === "manage" ? p.isManage : p.isDelete;
      }
      return false;
    });
  }, [user]);

  if (!localStorage.getItem("previousRoute")) {
    localStorage.setItem("previousRoute", "/");
  }

  return (
    <AuthContext.Provider value={{ user, isLoggedIn, token, role, isLoadingUser, loginWithToken, login, logout, refreshUser, updateUser, patchUser, hasActionPermission }}>
      <PreviousRouteTracker />
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
