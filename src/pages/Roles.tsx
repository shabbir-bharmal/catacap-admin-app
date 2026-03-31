import { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AdminLayout } from "../components/AdminLayout";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Edit2, Plus, Trash2, Loader2, Search, ChevronDown, ChevronRight } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from "@/components/ui/dialog";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/contexts/AuthContext";
import { useDebounce } from "@/hooks/useDebounce";

import { fetchRoles, createRole, updateRole, deleteRole, type Role, type RolePermission, fetchModules, ModuleItem } from "@/api/role/roleApi";

const formatModuleName = (name: string) => {
    return name
        .replace(/-/g, " ")
        .split(" ")
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(" ");
};

export default function Roles() {
    const { toast } = useToast();
    const queryClient = useQueryClient();
    const { hasActionPermission } = useAuth();
    const [searchTerm, setSearchTerm] = useState("");
    const debouncedSearch = useDebounce(searchTerm, 500);
    const effectiveSearch = debouncedSearch.length >= 3 || debouncedSearch.length === 0 ? debouncedSearch : "";

    const [isAddOpen, setIsAddOpen] = useState(false);
    const [isEditOpen, setIsEditOpen] = useState(false);
    const [isDeleteOpen, setIsDeleteOpen] = useState(false);

    const [roleName, setRoleName] = useState("");
    const [isSuperAdminRole, setIsSuperAdminRole] = useState(false);
    const [selectedRole, setSelectedRole] = useState<Role | null>(null);
    const [rolePermissions, setRolePermissions] = useState<Record<number, { isManage: boolean; isDelete: boolean }>>({});
    const [expandedModules, setExpandedModules] = useState<Record<number, boolean>>({});

    const toggleModuleExpand = (moduleId: number) => {
        setExpandedModules(prev => ({
            ...prev,
            [moduleId]: prev[moduleId] === undefined ? false : !prev[moduleId]
        }));
    };

    const { data: roles = [], isLoading: isLoadingRoles } = useQuery<Role[]>({
        queryKey: ["roles"],
        queryFn: fetchRoles,
        staleTime: 0,
        gcTime: 0,
    });

    const { data: modules = [], isLoading: isLoadingModules } = useQuery<ModuleItem[]>({
        queryKey: ["modules"],
        queryFn: fetchModules,
        staleTime: 0,
        gcTime: 0,
    });

    const groupedModules = useMemo(() => {
        const groups: Record<string, ModuleItem[]> = {};
        modules.forEach(m => {
            if (!groups[m.category]) groups[m.category] = [];
            groups[m.category].push(m);
        });

        // Sort modules within each category
        Object.keys(groups).forEach(cat => {
            groups[cat].sort((a, b) => a.sortOrder - b.sortOrder);
        });

        // Sort categories by their minimum module sortOrder
        return Object.keys(groups)
            .sort((a, b) => {
                const minA = Math.min(...groups[a].map(m => m.sortOrder));
                const minB = Math.min(...groups[b].map(m => m.sortOrder));
                return minA - minB;
            })
            .map(category => ({
                category,
                modules: groups[category]
            }));
    }, [modules]);

    const createMutation = useMutation({
        mutationFn: createRole,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["roles"] });
            toast({ title: "Success", description: "Role created successfully." });
            setIsAddOpen(false);
            resetForm();
        },
        onError: () => {
            toast({
                title: "Error",
                description: "Failed to create role",
                variant: "destructive",
            });
        },
    });

    const updateMutation = useMutation({
        mutationFn: updateRole,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["roles"] });
            toast({ title: "Success", description: "Role updated successfully." });
            setIsEditOpen(false);
            resetForm();
        },
        onError: () => {
            toast({
                title: "Error",
                description: "Failed to update role",
                variant: "destructive",
            });
        },
    });

    const deleteMutation = useMutation({
        mutationFn: deleteRole,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["roles"] });
            toast({ title: "Success", description: "Role deleted successfully." });
            setIsDeleteOpen(false);
            setSelectedRole(null);
        },
        onError: () => {
            toast({
                title: "Error",
                description: "Failed to delete role",
                variant: "destructive",
            });
        },
    });

    const filteredRoles = roles.filter(role =>
        role.roleName.toLowerCase().includes(effectiveSearch.toLowerCase())
    );

    const resetForm = () => {
        setRoleName("");
        setIsSuperAdminRole(false);
        setSelectedRole(null);
        setRolePermissions({});
        setExpandedModules({});
    };

    const openAdd = () => {
        resetForm();
        setIsAddOpen(true);
    };

    const openEdit = (role: Role) => {
        resetForm();
        setSelectedRole(role);
        setRoleName(role.roleName);
        setIsSuperAdminRole(!!role.isSuperAdmin);

        const perms: Record<number, { isManage: boolean; isDelete: boolean }> = {};
        if (role.permissions) {
            role.permissions.forEach(p => {
                perms[p.moduleId] = { isManage: p.isManage, isDelete: p.isDelete };
            });
        }
        setRolePermissions(perms);

        setIsEditOpen(true);
    };

    const openDelete = (role: Role) => {
        setSelectedRole(role);
        setIsDeleteOpen(true);
    };

    const handlePermissionChange = (moduleId: number, field: "isManage" | "isDelete", checked: boolean) => {
        setRolePermissions(prev => {
            const current = (prev[moduleId] || { isManage: false, isDelete: false });
            let nextManage = current.isManage;
            let nextDelete = current.isDelete;

            if (field === "isManage") {
                nextManage = checked;
                if (!checked) nextDelete = false;
            } else if (field === "isDelete") {
                nextDelete = checked;
                if (checked) nextManage = true;
            }

            return {
                ...prev,
                [moduleId]: { isManage: nextManage, isDelete: nextDelete }
            };
        });
    };

    const handleSave = () => {
        if (!roleName.trim()) {
            toast({ title: "Validation Error", description: "Role name is required", variant: "destructive" });
            return;
        }

        const permissionsPayload: RolePermission[] = Object.entries(rolePermissions)
            // Filter out items where both are false if you don't want to send empty permissions
            .filter(([_, perms]) => perms.isManage || perms.isDelete)
            .map(([moduleId, perms]) => {
                const module = modules.find(m => m.id === Number(moduleId));
                return {
                    moduleId: Number(moduleId),
                    moduleName: module?.name || "",
                    isManage: perms.isManage,
                    isDelete: perms.isDelete,
                };
            });

        if (isEditOpen && selectedRole) {
            updateMutation.mutate({
                roleId: selectedRole.roleId,
                roleName: roleName.trim(),
                isSuperAdmin: isSuperAdminRole,
                permissions: permissionsPayload
            });
        } else {
            createMutation.mutate({
                roleName: roleName.trim(),
                isSuperAdmin: isSuperAdminRole,
                permissions: permissionsPayload
            });
        }
    };

    const isSubmitting = createMutation.isPending || updateMutation.isPending;

    return (
        <AdminLayout>
            <div className="space-y-6">
                <h1 className="text-2xl font-semibold">Roles and permissions</h1>

                <Card>
                    <CardHeader className="flex flex-row items-end justify-between gap-4 flex-wrap border-b px-6 py-4">
                        <div className="flex items-end gap-3 flex-wrap flex-1">
                            <div className="flex flex-col gap-0.5">
                                <Label className="text-[10px] text-muted-foreground uppercase tracking-wider">Search</Label>
                                <div className="relative w-[320px]">
                                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                    <Input
                                        placeholder="Search roles..."
                                        value={searchTerm}
                                        onChange={(e) => setSearchTerm(e.target.value)}
                                        className="pl-9"
                                    />
                                </div>
                            </div>
                        </div>
                        <Button onClick={openAdd} className="bg-[#405189] hover:bg-[#405189]/90">
                            <Plus className="mr-2 h-4 w-4" /> Add Role
                        </Button>
                    </CardHeader>

                    <CardContent className="p-0">

                        {isLoadingRoles ? (
                            <div className="flex justify-center items-center p-8">
                                <Loader2 className="h-8 w-8 animate-spin text-[#405189]" />
                            </div>
                        ) : (
                            <Table>
                                <TableHeader>
                                    <TableRow className="bg-muted/30">
                                        <TableHead className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap">Role Name</TableHead>
                                        <TableHead className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap">Super Admin</TableHead>
                                        <TableHead className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap w-[100px]">Actions</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {filteredRoles.length === 0 ? (
                                        <TableRow>
                                            <TableCell colSpan={2} className="text-center py-8 text-muted-foreground">
                                                No roles found.
                                            </TableCell>
                                        </TableRow>
                                    ) : (
                                        filteredRoles.map((role) => (
                                            <TableRow
                                                key={role.roleId}
                                                className="hover-elevate odd:bg-card even:bg-muted/30"
                                            >
                                                <TableCell className="font-medium">{role.roleName}</TableCell>
                                                <TableCell>
                                                    {role.isSuperAdmin ? (
                                                        <span className="inline-flex items-center rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300">Yes</span>
                                                    ) : (
                                                        <span className="inline-flex items-center rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-semibold text-red-800 dark:bg-red-900/30 dark:text-red-300">No</span>
                                                    )}
                                                </TableCell>
                                                <TableCell className="text-right">
                                                    <div className="flex justify-end">
                                                        <div className="inline-flex rounded-md shadow-sm">
                                                            {role.roleName !== "User" && (
                                                                <Tooltip>
                                                                    <TooltipTrigger asChild>
                                                                        <Button
                                                                            variant="outline"
                                                                            size="icon"
                                                                            onClick={() => openEdit(role)}
                                                                            className={cn(
                                                                                "h-8 w-8 text-[#405189] hover:text-[#405189] hover:bg-[#405189]/5",
                                                                                (role.roleName !== "Super Admin") ? "rounded-r-none border-r-0" : ""
                                                                            )}
                                                                        >
                                                                            <Edit2 className="h-4 w-4" />
                                                                        </Button>
                                                                    </TooltipTrigger>
                                                                    <TooltipContent>Edit Role</TooltipContent>
                                                                </Tooltip>
                                                            )}
                                                            {role.roleName !== "User" && role.roleName !== "Super Admin" && (
                                                                <Tooltip>
                                                                    <TooltipTrigger asChild>
                                                                        <Button
                                                                            variant="outline"
                                                                            size="icon"
                                                                            onClick={() => openDelete(role)}
                                                                            className="h-8 w-8 rounded-l-none text-[#f06548] hover:text-[#f06548] hover:bg-[#f06548]/5"
                                                                        >
                                                                            <Trash2 className="h-4 w-4" />
                                                                        </Button>
                                                                    </TooltipTrigger>
                                                                    <TooltipContent>Delete Role</TooltipContent>
                                                                </Tooltip>
                                                            )}
                                                        </div>
                                                    </div>
                                                </TableCell>
                                            </TableRow>
                                        ))
                                    )}
                                </TableBody>
                            </Table>
                        )}
                    </CardContent>
                </Card>

                {/* Add/Edit Dialog */}
                <Dialog open={isAddOpen || isEditOpen} onOpenChange={(open) => {
                    if (!open) {
                        setIsAddOpen(false);
                        setIsEditOpen(false);
                    }
                }}>
                    <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col p-0 gap-0 overflow-hidden">
                        <DialogHeader className="px-6 pt-6 pb-4 border-b">
                            <DialogTitle>{isEditOpen ? "Edit Role" : "Add Role"}</DialogTitle>
                        </DialogHeader>
                        <div className="px-6 py-6 space-y-6 overflow-y-auto flex-1">
                            <div className="space-y-2 max-w-sm">
                                <Label htmlFor="roleName" className="font-semibold text-sm">
                                    Role Name <span className="text-red-500">*</span>
                                </Label>
                                <Input
                                    id="roleName"
                                    value={roleName}
                                    onChange={(e) => setRoleName(e.target.value)}
                                    placeholder="Enter role name"
                                />
                            </div>

                            <div className="flex items-center space-x-2.5">
                                <Checkbox
                                    id="isSuperAdmin"
                                    checked={isSuperAdminRole}
                                    onCheckedChange={(checked) => setIsSuperAdminRole(checked as boolean)}
                                />
                                <Label
                                    htmlFor="isSuperAdmin"
                                    className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer text-slate-700 dark:text-slate-300 select-none"
                                >
                                    Is Super Admin?
                                </Label>
                            </div>

                            {!isSuperAdminRole && (
                                <div className="space-y-3">
                                    <Label className="font-semibold text-sm">Module Permissions</Label>
                                    {isLoadingModules ? (
                                        <div className="flex justify-center p-4">
                                            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                                        </div>
                                    ) : (
                                        <div className="border rounded-md px-4 py-3 bg-muted/20 h-[480px] overflow-y-auto">
                                            <div className="space-y-1">
                                                {groupedModules.length === 0 ? (
                                                    <div className="text-center py-4 text-muted-foreground text-sm">
                                                        No modules available.
                                                    </div>
                                                ) : (
                                                    groupedModules.map(({ category, modules: catModules }) => {
                                                        return (
                                                            <div key={category} className="space-y-1 mt-2 first:mt-0">
                                                                {/* Category Row */}
                                                                <div className="flex items-center gap-2 py-2 px-2 rounded bg-muted/50 group select-none">
                                                                    <div className="flex items-center gap-2 flex-1">
                                                                        <Label className="font-bold flex-1 text-slate-900 dark:text-slate-100 uppercase tracking-tight text-xs">
                                                                            {formatModuleName(category)}
                                                                        </Label>
                                                                    </div>
                                                                </div>

                                                                <div className="ml-4 pl-2 border-l border-slate-200 dark:border-slate-800 space-y-1 py-1">
                                                                    {catModules.map((module) => {
                                                                        const pManager = rolePermissions[module.id]?.isManage || false;
                                                                        const pDelete = rolePermissions[module.id]?.isDelete || false;
                                                                        const isAllChecked = pManager && pDelete;
                                                                        const isIndeterminate = (pManager || pDelete) && !isAllChecked;
                                                                        const isExpanded = expandedModules[module.id] !== false;

                                                                        return (
                                                                            <div key={module.id} className="text-sm">
                                                                                {/* Module Row */}
                                                                                <div className="flex items-center gap-2 py-1.5 hover:bg-muted/30 dark:hover:bg-slate-800 rounded px-2 relative group select-none">
                                                                                    <div
                                                                                        className="text-muted-foreground w-4 h-4 flex items-center justify-center cursor-pointer"
                                                                                        onClick={() => toggleModuleExpand(module.id)}
                                                                                    >
                                                                                        {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                                                                                    </div>
                                                                                    <div className="flex items-center gap-2 flex-1">
                                                                                        <Checkbox
                                                                                            id={`master-${module.id}`}
                                                                                            checked={isAllChecked}
                                                                                            onCheckedChange={(checked) => {
                                                                                                handlePermissionChange(module.id, "isManage", !!checked);
                                                                                                handlePermissionChange(module.id, "isDelete", !!checked);
                                                                                            }}
                                                                                            className={isIndeterminate ? "bg-primary/50 border-primary/50 text-primary-foreground" : ""}
                                                                                        />
                                                                                        <Label htmlFor={`master-${module.id}`} className="font-semibold cursor-pointer flex-1 text-slate-800 dark:text-slate-200">
                                                                                            {formatModuleName(module.name)}
                                                                                        </Label>
                                                                                    </div>
                                                                                </div>

                                                                                {/* Children rows (Permissions) */}
                                                                                {isExpanded && (
                                                                                    <div className="ml-6 pl-2 border-l border-dotted border-slate-300 dark:border-slate-700 space-y-1 py-1">
                                                                                        <div className="flex items-center gap-2 py-1.5 hover:bg-muted/30 dark:hover:bg-slate-800 rounded px-2 relative group select-none">
                                                                                            <div className="absolute left-[-9px] top-1/2 w-2 border-t border-dotted border-slate-300 dark:border-slate-700"></div>
                                                                                            <Checkbox
                                                                                                id={`manage-${module.id}`}
                                                                                                checked={pManager}
                                                                                                onCheckedChange={(checked) => handlePermissionChange(module.id, "isManage", checked as boolean)}
                                                                                            />
                                                                                            <Label htmlFor={`manage-${module.id}`} className="cursor-pointer flex-1 text-slate-600 dark:text-slate-400">
                                                                                                Can Manage
                                                                                            </Label>
                                                                                        </div>
                                                                                        <div className={`flex items-center gap-2 py-1.5 hover:bg-muted/30 dark:hover:bg-slate-800 rounded px-2 relative group select-none ${!pManager ? "opacity-50" : ""}`}>
                                                                                            <div className="absolute left-[-9px] top-1/2 w-2 border-t border-dotted border-slate-300 dark:border-slate-700"></div>
                                                                                            <Checkbox
                                                                                                id={`delete-${module.id}`}
                                                                                                checked={pDelete}
                                                                                                onCheckedChange={(checked) => handlePermissionChange(module.id, "isDelete", checked as boolean)}
                                                                                                disabled={!pManager}
                                                                                            />
                                                                                            <Label
                                                                                                htmlFor={`delete-${module.id}`}
                                                                                                className={`cursor-pointer flex-1 text-slate-600 dark:text-slate-400 ${!pManager ? "cursor-not-allowed" : ""}`}
                                                                                            >
                                                                                                Can Delete
                                                                                            </Label>
                                                                                        </div>
                                                                                    </div>
                                                                                )}
                                                                            </div>
                                                                        );
                                                                    })}
                                                                </div>
                                                            </div>
                                                        );
                                                    })
                                                )}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                        <DialogFooter className="px-6 py-4 border-t bg-muted/20">
                            <Button
                                variant="outline"
                                onClick={() => {
                                    setIsAddOpen(false);
                                    setIsEditOpen(false);
                                }}
                                disabled={isSubmitting}
                            >
                                Cancel
                            </Button>
                            <Button
                                onClick={handleSave}
                                disabled={isSubmitting}
                                className="bg-[#405189] hover:bg-[#405189]/90"
                            >
                                {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                Save Role
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>

                {/* Delete Confirmation Dialog */}
                <AlertDialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
                    <AlertDialogContent>
                        <AlertDialogHeader>
                            <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                            <AlertDialogDescription>
                                This will permanently delete the role "{selectedRole?.roleName}" and all of its associated permissions.
                            </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                            <AlertDialogCancel disabled={deleteMutation.isPending}>Cancel</AlertDialogCancel>
                            <AlertDialogAction
                                onClick={(e) => {
                                    e.preventDefault();
                                    if (selectedRole) {
                                        deleteMutation.mutate(selectedRole.roleId);
                                    }
                                }}
                                disabled={deleteMutation.isPending}
                                className="bg-red-500 hover:bg-red-600 focus:ring-red-500"
                            >
                                {deleteMutation.isPending ? (
                                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                                ) : (
                                    <Trash2 className="h-4 w-4 mr-2" />
                                )}
                                Delete Role
                            </AlertDialogAction>
                        </AlertDialogFooter>
                    </AlertDialogContent>
                </AlertDialog>
            </div>
        </AdminLayout>
    );
}
