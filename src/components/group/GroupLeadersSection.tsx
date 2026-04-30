import { useState, useRef, useCallback } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import {
    Plus,
    Pencil,
    User,
    Crown,
    Search,
    Loader2,
    Check,
    Trash2,
} from "lucide-react";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { searchLeadersAndChampions, saveLeaderOrChampion, deleteLeaderOrChampion, GroupLeadersSectionProps, GroupLeader } from "@/api/group/groupApi";
import { getUrlBlobContainerImage } from "@/lib/image-utils";

export function GroupLeadersSection({ apiGroupId, leaders, setLeaders, cardClassName }: GroupLeadersSectionProps) {
    const { toast } = useToast();
    const [showLeaderDialog, setShowLeaderDialog] = useState(false);
    const [editingLeaderId, setEditingLeaderId] = useState<string | null>(null);
    const [leaderForm, setLeaderForm] = useState({ name: "", role: "", description: "", linkedinUrl: "" });
    const [leaderSearchQuery, setLeaderSearchQuery] = useState("");
    const [leaderSearchResults, setLeaderSearchResults] = useState<Array<{ id: string; fullName: string; pictureFileName: string | null }>>([]);
    const [leaderSearchLoading, setLeaderSearchLoading] = useState(false);
    const [selectedLeaderUser, setSelectedLeaderUser] = useState<{ id: string; fullName: string; pictureFileName: string | null } | null>(null);
    const [savingLeader, setSavingLeader] = useState(false);
    const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const searchLeaders = useCallback(async (query: string) => {
        if (query.length < 3 || !apiGroupId) { setLeaderSearchResults([]); return; }
        setLeaderSearchLoading(true);
        try {
            const data = await searchLeadersAndChampions(apiGroupId, query, "leaders");
            setLeaderSearchResults(data);
        } catch {
            setLeaderSearchResults([]);
        } finally {
            setLeaderSearchLoading(false);
        }
    }, [apiGroupId]);

    const handleLeaderSearchChange = useCallback((value: string) => {
        setLeaderSearchQuery(value);
        setSelectedLeaderUser(null);
        if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
        if (value.length >= 3) {
            searchTimerRef.current = setTimeout(() => searchLeaders(value), 400);
        } else {
            setLeaderSearchResults([]);
        }
    }, [searchLeaders]);

    const openAddLeaderDialog = () => {
        setEditingLeaderId(null);
        setLeaderForm({ name: "", role: "", description: "", linkedinUrl: "" });
        setLeaderSearchQuery("");
        setLeaderSearchResults([]);
        setSelectedLeaderUser(null);
        setShowLeaderDialog(true);
    };

    const openEditLeaderDialog = (leader: GroupLeader) => {
        setEditingLeaderId(leader.id);
        setLeaderForm({ name: leader.name, role: leader.role, description: leader.description, linkedinUrl: leader.linkedinUrl });
        setLeaderSearchQuery(leader.name);
        setLeaderSearchResults([]);
        setSelectedLeaderUser({ id: leader.id, fullName: leader.name, pictureFileName: leader.pictureFileName || null });
        setShowLeaderDialog(true);
    };

    const handleSaveLeader = async () => {
        if (!editingLeaderId && !selectedLeaderUser) {
            toast({ title: "No user selected", description: "Please search and select a user from the dropdown.", variant: "destructive" });
            return;
        }
        if (!leaderForm.role.trim() || !leaderForm.description.trim()) {
            toast({ title: "Missing fields", description: "Please fill in all required fields.", variant: "destructive" });
            return;
        }
        setSavingLeader(true);
        let updated: GroupLeader[];
        if (editingLeaderId) {
            updated = leaders.map((l) =>
                l.id === editingLeaderId
                    ? { ...l, ...leaderForm, id: selectedLeaderUser?.id || l.id, name: selectedLeaderUser?.fullName || leaderForm.name, pictureFileName: selectedLeaderUser?.pictureFileName || l.pictureFileName }
                    : l
            );
        } else {
            updated = [...leaders, {
                id: selectedLeaderUser!.id,
                name: selectedLeaderUser!.fullName,
                role: leaderForm.role,
                description: leaderForm.description,
                linkedinUrl: leaderForm.linkedinUrl,
                pictureFileName: selectedLeaderUser!.pictureFileName,
            }];
        }

        if (apiGroupId) {
            try {
                const leaderId = editingLeaderId ? (selectedLeaderUser?.id || editingLeaderId) : selectedLeaderUser!.id;
                await saveLeaderOrChampion(apiGroupId, "leaders", {
                    UserId: leaderId,
                    RoleAndTitle: leaderForm.role || null,
                    Description: leaderForm.description || null,
                    LinkedInUrl: leaderForm.linkedinUrl || null
                });
                toast({ title: editingLeaderId ? "Leader updated" : "Leader added" });
            } catch (error: any) {
                toast({
                    title: "Failed to save leader",
                    description: error.response?.data?.details || "Could not save leader.",
                    variant: "destructive"
                });
                setSavingLeader(false);
                return;
            }
        } else {
            toast({ title: editingLeaderId ? "Leader updated" : "Leader added" });
        }

        setLeaders(updated);
        setSavingLeader(false);
        setShowLeaderDialog(false);
    };

    const handleDeleteLeader = async (leaderId: string) => {
        try {
            if (apiGroupId) {
                await deleteLeaderOrChampion(apiGroupId, leaderId, "leaders");
            }
            setLeaders(leaders.filter(l => l.id !== leaderId));
            toast({ title: "Leader removed" });
        } catch (error: any) {
            toast({
                title: "Failed to remove leader",
                description: error.response?.data?.details || "An error occurred.",
                variant: "destructive"
            });
        }
    };

    return (
        <>
            <Card className={cardClassName}>
                <CardContent className="p-5 sm:p-6">
                    <div className="flex items-start justify-between gap-4 mb-4">
                        <div>
                            <h5 className="text-base font-semibold" data-testid="text-leaders-heading">Group Leaders</h5>
                        </div>
                        <Button
                            variant="outline"
                            size="sm"
                            className="border-[#405189] text-[#405189] uppercase tracking-wider text-xs font-semibold shrink-0"
                            onClick={openAddLeaderDialog}
                            data-testid="button-add-leader"
                        >
                            <Plus className="w-3.5 h-3.5 mr-1" />
                            Add Leader
                        </Button>
                    </div>

                    {leaders.length > 0 ? (
                        <div className="space-y-3">
                            {leaders.map((leader) => (
                                <div
                                    key={leader.id}
                                    className="flex items-center justify-between gap-4 p-4 rounded-md border border-border hover:bg-muted/20 transition-colors"
                                    data-testid={`row-leader-${leader.id}`}
                                >
                                    <div className="flex items-center gap-3 min-w-0">
                                        <Avatar className="h-12 w-12 flex-shrink-0">
                                            {leader.pictureFileName && (
                                                <AvatarImage src={getUrlBlobContainerImage(leader.pictureFileName)} alt={leader.name} />
                                            )}
                                            <AvatarFallback className="bg-[#405189]/10 text-[#405189] text-xs">
                                                <User className="w-5 h-5" />
                                            </AvatarFallback>
                                        </Avatar>
                                        <div className="min-w-0">
                                            <p className="font-medium text-sm" data-testid={`text-leader-name-${leader.id}`}>{leader.name}</p>
                                            {leader.email && (
                                                <p className="text-xs text-muted-foreground truncate" data-testid={`text-leader-email-${leader.id}`}>{leader.email}</p>
                                            )}
                                            <p className="text-xs text-muted-foreground">{leader.role || (leader.isOwner ? "Owner" : "")}</p>
                                        </div>
                                    </div>
                                    <div className="flex gap-1">
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            onClick={() => openEditLeaderDialog(leader)}
                                            data-testid={`button-edit-leader-${leader.id}`}
                                        >
                                            <Pencil className="w-4 h-4 text-[#405189]" />
                                        </Button>
                                        <AlertDialog>
                                            <AlertDialogTrigger asChild>
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    className="text-destructive hover:text-destructive hover:bg-destructive/10"
                                                    data-testid={`button-delete-leader-${leader.id}`}
                                                >
                                                    <Trash2 className="w-4 h-4" />
                                                </Button>
                                            </AlertDialogTrigger>
                                            <AlertDialogContent>
                                                <AlertDialogHeader>
                                                    <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                                                    <AlertDialogDescription>
                                                        This action cannot be undone. This will permanently remove the leader from this group.
                                                    </AlertDialogDescription>
                                                </AlertDialogHeader>
                                                <AlertDialogFooter>
                                                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                                                    <AlertDialogAction
                                                        onClick={() => handleDeleteLeader(leader.id)}
                                                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                                    >
                                                        Delete
                                                    </AlertDialogAction>
                                                </AlertDialogFooter>
                                            </AlertDialogContent>
                                        </AlertDialog>
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="text-center py-10 text-muted-foreground">
                            <Crown className="w-8 h-8 mx-auto mb-2 opacity-30" />
                            <p className="text-sm">No group leaders added yet.</p>
                        </div>
                    )}
                </CardContent>
            </Card>

            <Dialog open={showLeaderDialog} onOpenChange={(open) => {
                if (!open && searchTimerRef.current) clearTimeout(searchTimerRef.current);
                setShowLeaderDialog(open);
            }}>
                <DialogContent className="sm:max-w-lg" data-testid="dialog-add-leader">
                    <DialogHeader>
                        <DialogTitle>{editingLeaderId ? "Edit Leader" : "Add Leader"}</DialogTitle>
                    </DialogHeader>

                    <div className="flex justify-center mb-2">
                        <Avatar className="h-14 w-14">
                            {selectedLeaderUser?.pictureFileName ? (
                                <AvatarImage src={getUrlBlobContainerImage(selectedLeaderUser.pictureFileName)} alt={selectedLeaderUser.fullName} />
                            ) : null}
                            <AvatarFallback className="bg-[#405189]/10 text-[#405189]">
                                <User className="w-6 h-6" />
                            </AvatarFallback>
                        </Avatar>
                    </div>

                    <div className="space-y-4">
                        <div className="relative">
                            <Label className="text-sm font-medium mb-1.5 block">Search User by Name <span className="text-destructive">*</span></Label>
                            <div className="relative">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                                <Input
                                    placeholder="Type a name (min 3 letters)..."
                                    value={leaderSearchQuery}
                                    onChange={(e) => handleLeaderSearchChange(e.target.value)}
                                    className="pl-9"
                                    data-testid="input-leader-search"
                                />
                                {leaderSearchLoading && (
                                    <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-muted-foreground" />
                                )}
                            </div>
                            {selectedLeaderUser && (
                                <div className="mt-2 flex items-center gap-2 px-3 py-2 rounded-md bg-[#405189]/10 border border-[#405189]/20">
                                    <Check className="w-4 h-4 text-[#405189] flex-shrink-0" />
                                    <span className="text-sm font-medium text-[#405189]">{selectedLeaderUser.fullName}</span>
                                </div>
                            )}
                            {leaderSearchResults.length > 0 && !selectedLeaderUser && (
                                <div className="absolute z-50 w-full mt-1 bg-popover border border-border rounded-md shadow-lg max-h-48 overflow-y-auto" data-testid="dropdown-leader-search">
                                    {leaderSearchResults.map((u) => (
                                        <button
                                            key={u.id}
                                            type="button"
                                            className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-muted transition-colors text-left"
                                            onClick={() => { setSelectedLeaderUser(u); setLeaderSearchQuery(u.fullName); setLeaderForm((f) => ({ ...f, name: u.fullName })); setLeaderSearchResults([]); }}
                                            data-testid={`option-leader-${u.id}`}
                                        >
                                            <Avatar className="h-7 w-7 flex-shrink-0">
                                                {u.pictureFileName ? <AvatarImage src={getUrlBlobContainerImage(u.pictureFileName)} /> : null}
                                                <AvatarFallback className="text-xs">{u.fullName.slice(0, 2).toUpperCase()}</AvatarFallback>
                                            </Avatar>
                                            <span className="text-sm">{u.fullName}</span>
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>

                        <div className="space-y-1.5">
                            <Label className="text-sm font-medium">Role / Title <span className="text-destructive">*</span></Label>
                            <Input
                                placeholder="e.g. Founder & Lead Curator"
                                value={leaderForm.role}
                                onChange={(e) => setLeaderForm((f) => ({ ...f, role: e.target.value }))}
                                data-testid="input-leader-role"
                            />
                        </div>

                        <div className="space-y-1.5">
                            <Label className="text-sm font-medium">Description <span className="text-destructive">*</span></Label>
                            <div className="relative">
                                <Textarea
                                    placeholder="Describe this leader's role and background..."
                                    value={leaderForm.description}
                                    onChange={(e) => { if (e.target.value.length <= 1000) setLeaderForm((f) => ({ ...f, description: e.target.value })); }}
                                    rows={3}
                                    className="resize-none"
                                    data-testid="input-leader-description"
                                />
                                <span className="absolute bottom-2 right-3 text-xs text-muted-foreground">{leaderForm.description.length}/1000</span>
                            </div>
                        </div>

                        <div className="space-y-1.5">
                            <Label className="text-sm font-medium">LinkedIn URL</Label>
                            <Input
                                placeholder="https://www.linkedin.com/in/example"
                                value={leaderForm.linkedinUrl}
                                onChange={(e) => setLeaderForm((f) => ({ ...f, linkedinUrl: e.target.value }))}
                                data-testid="input-leader-linkedin"
                            />
                        </div>
                    </div>

                    <div className="flex justify-end gap-3 mt-4">
                        <Button variant="ghost" onClick={() => setShowLeaderDialog(false)} data-testid="button-cancel-leader">Cancel</Button>
                        <Button
                            className="bg-[#405189] hover:bg-[#405189]/90"
                            onClick={handleSaveLeader}
                            disabled={savingLeader}
                            data-testid="button-save-leader"
                        >
                            {savingLeader ? <><Loader2 className="w-4 h-4 animate-spin mr-2" />Saving...</> : "Save"}
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>
        </>
    );
}
