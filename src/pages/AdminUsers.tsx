import { useState, useEffect } from "react";
import { useToast } from "@/hooks/use-toast";
import dayjs from "dayjs";
import { AdminLayout } from "../components/AdminLayout";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Search, MoreVertical, ChevronLeft, ChevronRight, UserX, UserCheck, ShieldCheck, ShieldOff, Pencil } from "lucide-react";
import { useSort } from "../hooks/useSort";
import { useDebounce } from "../hooks/useDebounce";
import { SortHeader } from "../components/ui/table-sort";
import { Label } from "@/components/ui/label";
import { fetchAdminUsers, AdminUserEntry, updateUserSettings, assignRole, saveAdminUser, SaveAdminUserParams } from "../api/user/userApi";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { fetchRoles } from "../api/role/roleApi";
import { PaginationControls } from "../components/ui/pagination-controls";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";

type SortField = "fullName";

export default function AdminUsersPage() {
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState("");
  const debouncedSearch = useDebounce(searchQuery, 500);
  const effectiveSearch = debouncedSearch.length >= 3 || debouncedSearch.length === 0 ? debouncedSearch : "";
  const { sortField, sortDir, handleSort: originalHandleSort } = useSort<SortField>();

  const handleSort = (field: SortField) => {
    originalHandleSort(field);
    setCurrentPage(1);
  };
  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(100);
  const { toast } = useToast();

  // Role assignment state
  const [isRoleDialogOpen, setIsRoleDialogOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<AdminUserEntry | null>(null);
  const [selectedRoleId, setSelectedRoleId] = useState<string>("");

  // Add/Edit User state
  const [isUserDialogOpen, setIsUserDialogOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<AdminUserEntry | null>(null);
  const [userFormData, setUserFormData] = useState<SaveAdminUserParams>({
    email: "",
    firstName: "",
    lastName: "",
    userName: "",
    password: "",
    isActive: true,
    twoFactorEnabled: false,
    roleId: ""
  });
  const [formErrors, setFormErrors] = useState<Record<string, boolean>>({});

  const handleUserSettings = async (user: AdminUserEntry, settings: { isActive?: boolean; twoFactorEnabled?: boolean }) => {
    if (window.location.href.includes("qa") && user.userName === "admin1") {
      toast({
        title: "Safety Constraint",
        description: "Admin1 is used into old qa app, you cannot delete or change role.",
        variant: "destructive",
        duration: 5000
      });
      return;
    }

    try {
      await updateUserSettings(user.id, settings);
      toast({
        title: "User settings updated successfully.",
        duration: 4000
      });
      queryClient.invalidateQueries({ queryKey: ["admin-users"] });
    } catch (err) {
      console.error("Error updating user settings", err);
      toast({
        title: "Failed to update user settings.",
        variant: "destructive",
        duration: 4000
      });
    }
  };

  const { data: roles = [] } = useQuery({
    queryKey: ["roles"],
    queryFn: fetchRoles,
    staleTime: 5 * 60 * 1000, // 5 minutes cache
    gcTime: 10 * 60 * 1000
  });

  const assignRoleMutation = useMutation({
    mutationFn: ({ userId, roleId }: { userId: string; roleId: string }) => assignRole(userId, roleId),
    onSuccess: (data) => {
      if (data.success) {
        toast({
          title: "Role assigned successfully.",
          duration: 4000
        });
        setIsRoleDialogOpen(false);
        queryClient.invalidateQueries({ queryKey: ["admin-users"] });
      } else {
        toast({
          title: data.message || "Failed to assign role.",
          variant: "destructive",
          duration: 4000
        });
      }
    },
    onError: (err) => {
      console.error("Error assigning role", err);
      toast({
        title: "An unexpected error occurred while assigning role.",
        variant: "destructive",
        duration: 4000
      });
    }
  });

  const saveUserMutation = useMutation({
    mutationFn: (params: SaveAdminUserParams) => saveAdminUser(params),
    onSuccess: (data) => {
      if (data.success) {
        toast({
          title: `User ${editingUser ? "updated" : "created"} successfully.`,
          duration: 4000
        });
        setIsUserDialogOpen(false);
        queryClient.invalidateQueries({ queryKey: ["admin-users"] });
      } else {
        toast({
          title: data.message || `Failed to ${editingUser ? "update" : "create"} user.`,
          variant: "destructive",
          duration: 4000
        });
      }
    },
    onError: (err: any) => {
      console.error("Error saving user", err);
      toast({
        title: err?.response?.data?.message || "An unexpected error occurred while saving user.",
        variant: "destructive",
        duration: 4000
      });
    }
  });

  const handleOpenRoleDialog = (user: AdminUserEntry) => {
    if (window.location.href.includes("qa") && user.userName === "admin1") {
      toast({
        title: "Safety Constraint",
        description: "Admin1 is used into old qa app, you cannot delete or change role.",
        variant: "destructive",
        duration: 5000
      });
      return;
    }
    setSelectedUser(user);
    setSelectedRoleId(user.roleName || "");
    setIsRoleDialogOpen(true);
  };

  const handleAssignRole = () => {
    if (selectedUser && selectedRoleId) {
      assignRoleMutation.mutate({
        userId: selectedUser.id,
        roleId: selectedRoleId
      });
    }
  };

  const handleOpenUserDialog = (user?: AdminUserEntry) => {
    if (user) {
      if (window.location.href.includes("qa") && user.userName === "admin1") {
        toast({
          title: "Safety Constraint",
          description: "Admin1 is used into old qa app, you cannot delete or change role.",
          variant: "destructive",
          duration: 5000
        });
        return;
      }
      setEditingUser(user);
      setUserFormData({
        id: user.id,
        email: user.email || "",
        firstName: user.firstName || "",
        lastName: user.lastName || "",
        userName: user.userName || "",
        password: "", // Keep password empty by default on edit
        isActive: user.isActive ?? true,
        twoFactorEnabled: user.twoFactorEnabled ?? false,
        roleId: "" // Will be set in useEffect common logic
      });
    } else {
      setEditingUser(null);
      setUserFormData({
        email: "",
        firstName: "",
        lastName: "",
        userName: "",
        password: "",
        isActive: true,
        twoFactorEnabled: false,
        roleId: ""
      });
    }
    setIsUserDialogOpen(true);
    setFormErrors({});
  };

  const handleSaveUser = () => {
    // Basic validation
    const errors: Record<string, boolean> = {};
    if (!userFormData.email) errors.email = true;
    if (!userFormData.firstName) errors.firstName = true;
    if (!userFormData.lastName) errors.lastName = true;
    if (!userFormData.userName) errors.userName = true;
    if (!userFormData.roleId) errors.roleId = true;
    if (!editingUser && !userFormData.password) errors.password = true;

    if (Object.keys(errors).length > 0) {
      setFormErrors(errors);
      toast({
        title: "Please fill in all required fields.",
        variant: "destructive",
        duration: 4000
      });
      return;
    }
    saveUserMutation.mutate(userFormData);
  };

  useEffect(() => {
    if (isUserDialogOpen && roles.length > 0) {
      if (editingUser) {
        // Try to find the role ID by roleName if roleId is not present
        const currentRole = roles.find((r) => r.roleName === editingUser.roleName || r.roleId === editingUser.roleId);
        if (currentRole) {
          setUserFormData(prev => ({ ...prev, roleId: currentRole.roleId }));
        }
      }
    }
  }, [isUserDialogOpen, editingUser, roles]);

  useEffect(() => {
    if (isRoleDialogOpen && selectedUser && roles.length > 0) {
      const currentRole = roles.find((r) => r.roleName === selectedUser.roleName);
      if (currentRole) {
        setSelectedRoleId(currentRole.roleId);
      } else {
        setSelectedRoleId("");
      }
    }
  }, [isRoleDialogOpen, selectedUser, roles]);

  const {
    data: queryData,
    isLoading,
    error
  } = useQuery({
    queryKey: ["admin-users", currentPage, rowsPerPage, sortField, sortDir, effectiveSearch],
    queryFn: () =>
      fetchAdminUsers({
        currentPage,
        perPage: rowsPerPage,
        sortField: sortField ?? undefined,
        sortDirection: sortDir ?? undefined,
        searchValue: effectiveSearch.trim() || undefined
      }),
    staleTime: 0,
    gcTime: 0
  });

  const paginatedUsers = queryData?.items ?? [];
  const totalCount = queryData?.totalCount ?? 0;
  const totalPages = Math.ceil(totalCount / rowsPerPage);
  const startIdx = totalCount > 0 ? (currentPage - 1) * rowsPerPage + 1 : 0;
  const endIdx = Math.min(currentPage * rowsPerPage, totalCount);

  return (
    <AdminLayout>
      <div className="space-y-6">
        <h1 className="text-2xl font-semibold" data-testid="text-page-heading">
          Admin Users
        </h1>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-4 flex-wrap border-b px-6 py-4">
            <div className="relative w-full max-w-xs">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Name, Email, Username"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setCurrentPage(1);
                }}
                className="pl-9"
                autoComplete="off"
                name="admin-search"
                data-testid="input-search-admin-users"
              />
            </div>
            <Button onClick={() => handleOpenUserDialog()} className="bg-[#405189] hover:bg-[#405189]/90" data-testid="button-add-user">
              Add User
            </Button>
          </CardHeader>

          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full" data-testid="table-admin-users">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap">
                      Username
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap max-w-[150px]">Email</th>
                    <SortHeader field="fullName" sortField={sortField} sortDir={sortDir} handleSort={handleSort} className="whitespace-nowrap">
                      Full Name
                    </SortHeader>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap">
                      Role
                    </th>
                    <th className="px-4 py-3 text-center text-xs font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap">Status</th>
                    <th className="px-4 py-3 text-center text-xs font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap">2FA</th>
                    <th className="px-4 py-3 text-center text-xs font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap" style={{ width: "1%" }}>
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {isLoading && (
                    <tr>
                      <td colSpan={7} className="px-4 py-8 text-center text-sm text-muted-foreground">
                        Loading...
                      </td>
                    </tr>
                  )}
                  {!isLoading && error && (
                    <tr>
                      <td colSpan={7} className="px-4 py-8 text-center text-sm text-destructive">
                        {(error as Error)?.message || "Failed to load data"}
                      </td>
                    </tr>
                  )}
                  {!isLoading && !error && paginatedUsers.length === 0 && (
                    <tr>
                      <td colSpan={7} className="px-4 py-8 text-center text-sm text-muted-foreground">
                        No records found.
                      </td>
                    </tr>
                  )}
                  {!isLoading &&
                    !error &&
                    paginatedUsers.map((user: AdminUserEntry) => (
                      <tr key={user.id} className="border-b last:border-b-0 hover:bg-muted/20 transition-colors" data-testid={`row-admin-user-${user.id}`}>
                        <td className="px-4 py-3">
                          <span className="text-sm font-medium" data-testid={`text-username-${user.id}`}>
                            {user.userName || "-"}
                          </span>
                        </td>
                        <td className="px-4 py-3 max-w-[150px]">
                          <span className="text-sm truncate block" title={user.email || user.alternateEmail || ""} data-testid={`text-email-${user.id}`}>
                            {user.email || user.alternateEmail || "-"}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-sm" data-testid={`text-fullname-${user.id}`}>
                            {user.fullName || [user.firstName, user.lastName].filter(Boolean).join(" ") || "-"}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-sm" data-testid={`text-role-${user.id}`}>
                            {user.roleName || "-"}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${user.isActive === false ? "bg-red-100 text-red-800" : "bg-green-100 text-green-800"}`}
                            data-testid={`text-status-${user.id}`}
                          >
                            {user.isActive === false ? "Inactive" : "Active"}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${user.twoFactorEnabled ? "bg-green-100 text-green-800" : "bg-muted text-muted-foreground"}`}
                            data-testid={`text-two-factor-${user.id}`}
                          >
                            {user.twoFactorEnabled ? "Enabled" : "Disabled"}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end">
                            <div className="inline-flex rounded-md shadow-sm">
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    size="icon"
                                    variant="outline"
                                    className="h-8 w-8 rounded-r-none border-r-0 text-[#f7b84b] hover:text-[#f7b84b] hover:bg-muted/50"
                                    onClick={() => handleOpenUserDialog(user)}
                                    data-testid={`action-edit-user-${user.id}`}
                                  >
                                    <Pencil className="h-4 w-4" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>Edit User</TooltipContent>
                              </Tooltip>

                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    size="icon"
                                    variant="outline"
                                    className={`h-8 w-8 rounded-none border-r-0 ${user.isActive ? "text-[#f06548] hover:text-[#f06548]" : "text-[#45CB85] hover:text-[#45CB85]"} hover:bg-muted/50`}
                                    onClick={() => handleUserSettings(user, { isActive: !user.isActive })}
                                    data-testid={`action-toggle-active-${user.id}`}
                                  >
                                    {user.isActive ? <UserX className="h-4 w-4" /> : <UserCheck className="h-4 w-4" />}
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>{user.isActive ? "Deactivate User" : "Activate User"}</TooltipContent>
                              </Tooltip>

                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    size="icon"
                                    variant="outline"
                                    className={`h-8 w-8 rounded-none border-r-0 ${user.twoFactorEnabled ? "text-[#f06548] hover:text-[#f06548]" : "text-[#45CB85] hover:text-[#45CB85]"} hover:bg-muted/50`}
                                    onClick={() => handleUserSettings(user, { twoFactorEnabled: !user.twoFactorEnabled })}
                                    data-testid={`action-toggle-two-factor-${user.id}`}
                                  >
                                    {user.twoFactorEnabled ? <ShieldOff className="h-4 w-4" /> : <ShieldCheck className="h-4 w-4" />}
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>{user.twoFactorEnabled ? "Disable Two-Factor Authentication" : "Enable Two-Factor Authentication"}</TooltipContent>
                              </Tooltip>

                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    size="icon"
                                    variant="outline"
                                    className="h-8 w-8 rounded-l-none text-[#405189] hover:text-[#405189] hover:bg-muted/50"
                                    onClick={() => handleOpenRoleDialog(user)}
                                    data-testid={`action-assign-role-${user.id}`}
                                  >
                                    <ShieldCheck className="h-4 w-4" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>Assign Role</TooltipContent>
                              </Tooltip>
                            </div>
                          </div>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>

            <PaginationControls
              currentPage={currentPage}
              totalCount={totalCount}
              rowsPerPage={rowsPerPage}
              onPageChange={setCurrentPage}
              onRowsPerPageChange={(v) => {
                setRowsPerPage(v);
                setCurrentPage(1);
              }}
              dataTestId="pagination-admin-users"
            />
          </CardContent>
        </Card>
      </div>

      <Dialog
        open={isUserDialogOpen}
        onOpenChange={(isOpen) => {
          if (!saveUserMutation.isPending) setIsUserDialogOpen(isOpen);
        }}
      >
        <DialogContent className="sm:max-w-[500px]" data-testid="dialog-user-form">
          <DialogHeader>
            <DialogTitle>{editingUser ? "Edit User" : "Add User"}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-4 py-4">
            <div className="space-y-2 col-span-2">
              <Label htmlFor="email">Email <span className="text-destructive">*</span></Label>
              <Input
                id="email"
                type="email"
                value={userFormData.email}
                onChange={(e) => {
                  setUserFormData({ ...userFormData, email: e.target.value });
                  if (formErrors.email) setFormErrors({ ...formErrors, email: false });
                }}
                placeholder="Enter email"
                className={formErrors.email ? "border-destructive focus-visible:ring-destructive" : ""}
                data-testid="input-user-email"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="firstName">First Name <span className="text-destructive">*</span></Label>
              <Input
                id="firstName"
                value={userFormData.firstName}
                onChange={(e) => {
                  setUserFormData({ ...userFormData, firstName: e.target.value });
                  if (formErrors.firstName) setFormErrors({ ...formErrors, firstName: false });
                }}
                placeholder="First name"
                className={formErrors.firstName ? "border-destructive focus-visible:ring-destructive" : ""}
                data-testid="input-user-firstname"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="lastName">Last Name <span className="text-destructive">*</span></Label>
              <Input
                id="lastName"
                value={userFormData.lastName}
                onChange={(e) => {
                  setUserFormData({ ...userFormData, lastName: e.target.value });
                  if (formErrors.lastName) setFormErrors({ ...formErrors, lastName: false });
                }}
                placeholder="Last name"
                className={formErrors.lastName ? "border-destructive focus-visible:ring-destructive" : ""}
                data-testid="input-user-lastname"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="userName">Username <span className="text-destructive">*</span></Label>
              <Input
                id="userName"
                value={userFormData.userName}
                onChange={(e) => {
                  setUserFormData({ ...userFormData, userName: e.target.value });
                  if (formErrors.userName) setFormErrors({ ...formErrors, userName: false });
                }}
                placeholder="Username"
                className={formErrors.userName ? "border-destructive focus-visible:ring-destructive" : ""}
                data-testid="input-user-username"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password {!editingUser && <span className="text-destructive">*</span>}</Label>
              <Input
                id="password"
                type="password"
                value={userFormData.password}
                onChange={(e) => {
                  setUserFormData({ ...userFormData, password: e.target.value });
                  if (formErrors.password) setFormErrors({ ...formErrors, password: false });
                }}
                placeholder="Password"
                className={formErrors.password ? "border-destructive focus-visible:ring-destructive" : ""}
                data-testid="input-user-password"
              />
              {editingUser && <p className="text-[11px] text-muted-foreground leading-none">Leave blank to keep current</p>}
            </div>
            <div className="space-y-2 col-span-2">
              <Label className={formErrors.roleId ? "text-destructive" : ""}>Role <span className="text-destructive">*</span></Label>
              <Select
                value={userFormData.roleId}
                onValueChange={(v) => {
                  setUserFormData({ ...userFormData, roleId: v });
                  if (formErrors.roleId) setFormErrors({ ...formErrors, roleId: false });
                }}
              >
                <SelectTrigger className={formErrors.roleId ? "border-destructive focus:ring-destructive" : ""} data-testid="select-user-role">
                  <SelectValue placeholder="Select a role" />
                </SelectTrigger>
                <SelectContent>
                  {roles.map((role) => (
                    <SelectItem key={role.roleId} value={role.roleId}>
                      {role.roleName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center space-x-2 col-span-2 pt-2">
              <Checkbox
                id="isActive"
                checked={userFormData.isActive}
                onCheckedChange={(checked) => setUserFormData({ ...userFormData, isActive: checked === true })}
              />
              <Label htmlFor="isActive" className="text-sm font-medium leading-none cursor-pointer">
                Active
              </Label>
            </div>
            <div className="flex items-center space-x-2 col-span-2">
              <Checkbox
                id="twoFactorEnabled"
                checked={userFormData.twoFactorEnabled === true}
                onCheckedChange={(checked) => setUserFormData({ ...userFormData, twoFactorEnabled: checked === true })}
                data-testid="checkbox-user-two-factor"
              />
              <Label htmlFor="twoFactorEnabled" className="text-sm font-medium leading-none cursor-pointer">
                Two-Factor Authentication Enabled
              </Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsUserDialogOpen(false)} disabled={saveUserMutation.isPending} data-testid="button-user-cancel">
              CANCEL
            </Button>
            <Button onClick={handleSaveUser} disabled={saveUserMutation.isPending} className="bg-[#405189] hover:bg-[#405189]/90" data-testid="button-user-save">
              {saveUserMutation.isPending ? "SAVING..." : "SAVE"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={isRoleDialogOpen}
        onOpenChange={(isOpen) => {
          if (!assignRoleMutation.isPending) setIsRoleDialogOpen(isOpen);
        }}
      >
        <DialogContent className="sm:max-w-[420px]" data-testid="dialog-role-assignment">
          <DialogHeader>
            <DialogTitle>Assign Role</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <p className="text-sm">
              Select a role to assign to <strong>{selectedUser?.fullName}</strong>.
            </p>
            <div className="space-y-2">
              <Label>Role</Label>
              <Select value={selectedRoleId} onValueChange={setSelectedRoleId}>
                <SelectTrigger data-testid="select-role">
                  <SelectValue placeholder="Select a role" />
                </SelectTrigger>
                <SelectContent>
                  {roles.map((role) => (
                    <SelectItem key={role.roleId} value={role.roleId}>
                      {role.roleName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsRoleDialogOpen(false)} disabled={assignRoleMutation.isPending} data-testid="button-role-cancel">
              CANCEL
            </Button>
            <Button onClick={handleAssignRole} disabled={!selectedRoleId || assignRoleMutation.isPending} className="bg-[#405189] hover:bg-[#405189]/90" data-testid="button-role-save">
              {assignRoleMutation.isPending ? "SAVING..." : "SAVE"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}
