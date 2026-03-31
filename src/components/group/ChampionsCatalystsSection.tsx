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
    Users,
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
import { searchLeadersAndChampions, saveLeaderOrChampion, deleteLeaderOrChampion, ChampionsCatalystsSectionProps, Champion } from "@/api/group/groupApi";
import { getUrlBlobContainerImage } from "@/lib/image-utils";


export function ChampionsCatalystsSection({ apiGroupId, champions, setChampions, cardClassName }: ChampionsCatalystsSectionProps) {
    const { toast } = useToast();
    const [showChampDialog, setShowChampDialog] = useState(false);
    const [editingChampId, setEditingChampId] = useState<string | null>(null);
    const [champForm, setChampForm] = useState({ name: "", role: "", description: "" });
    const [champSearchQuery, setChampSearchQuery] = useState("");
    const [champSearchResults, setChampSearchResults] = useState<Array<{ id: string; fullName: string; pictureFileName: string | null }>>([]);
    const [champSearchLoading, setChampSearchLoading] = useState(false);
    const [selectedChampUser, setSelectedChampUser] = useState<{ id: string; fullName: string; pictureFileName: string | null } | null>(null);
    const [savingChamp, setSavingChamp] = useState(false);
    const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const searchChampions = useCallback(async (query: string) => {
        if (query.length < 3 || !apiGroupId) { setChampSearchResults([]); return; }
        setChampSearchLoading(true);
        try {
            const data = await searchLeadersAndChampions(apiGroupId, query, "champions");
            setChampSearchResults(data);
        } catch {
            setChampSearchResults([]);
        } finally {
            setChampSearchLoading(false);
        }
    }, [apiGroupId]);

    const handleChampSearchChange = useCallback((value: string) => {
        setChampSearchQuery(value);
        setSelectedChampUser(null);
        if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
        if (value.length >= 3) {
            searchTimerRef.current = setTimeout(() => searchChampions(value), 400);
        } else {
            setChampSearchResults([]);
        }
    }, [searchChampions]);

    const openAddChampDialog = () => {
        setEditingChampId(null);
        setChampForm({ name: "", role: "", description: "" });
        setChampSearchQuery("");
        setChampSearchResults([]);
        setSelectedChampUser(null);
        setShowChampDialog(true);
    };

    const openEditChampDialog = (champ: Champion) => {
        setEditingChampId(champ.id);
        setChampForm({ name: champ.name, role: champ.role, description: champ.description || "" });
        setChampSearchQuery(champ.name);
        setChampSearchResults([]);
        setSelectedChampUser({ id: champ.id, fullName: champ.name, pictureFileName: champ.pictureFileName || null });
        setShowChampDialog(true);
    };

    const handleSaveChamp = async () => {
        if (!editingChampId && !selectedChampUser) {
            toast({ title: "No user selected", description: "Please search and select a user from the dropdown.", variant: "destructive" });
            return;
        }
        if (!champForm.role.trim() || !champForm.description.trim()) {
            toast({ title: "Missing fields", description: "Please fill in all required fields.", variant: "destructive" });
            return;
        }
        setSavingChamp(true);

        const champData = {
            id: selectedChampUser?.id || editingChampId!,
            name: selectedChampUser?.fullName || champForm.name,
            role: champForm.role,
            description: champForm.description,
            pictureFileName: selectedChampUser?.pictureFileName || (champions.find(c => c.id === editingChampId)?.pictureFileName)
        };

        let updated: Champion[];
        if (editingChampId) {
            updated = champions.map((c) => c.id === editingChampId ? champData : c);
        } else {
            updated = [...champions, champData];
        }

        if (apiGroupId) {
            try {
                const userId = selectedChampUser?.id || editingChampId!;
                await saveLeaderOrChampion(apiGroupId, "champions", {
                    UserId: userId,
                    RoleAndTitle: champForm.role || null,
                    Description: champForm.description || null
                });
                toast({ title: editingChampId ? "Champion updated" : "Champion added" });
            } catch (error: any) {
                toast({
                    title: "Failed to save champion",
                    description: error.response?.data?.details || "Could not save champion.",
                    variant: "destructive"
                });
                setSavingChamp(false);
                return;
            }
        } else {
            toast({ title: editingChampId ? "Champion updated" : "Champion added" });
        }

        setChampions(updated);
        setSavingChamp(false);
        setShowChampDialog(false);
    };

    const handleDeleteChamp = async (champId: string) => {
        try {
            if (apiGroupId) {
                await deleteLeaderOrChampion(apiGroupId, champId, "champions");
            }
            setChampions(champions.filter(c => c.id !== champId));
            toast({ title: "Champion removed" });
        } catch (error: any) {
            toast({
                title: "Failed to remove champion",
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
                            <h5 className="text-base font-semibold" data-testid="text-champions-heading">Champions &amp; Catalysts</h5>
                            <p className="text-xs text-muted-foreground mt-0.5">(These are allowed to include testimonials from any group member.)</p>
                        </div>
                        <Button
                            variant="outline"
                            size="sm"
                            className="border-[#405189] text-[#405189] uppercase tracking-wider text-xs font-semibold shrink-0"
                            onClick={openAddChampDialog}
                            data-testid="button-add-champion"
                        >
                            <Plus className="w-3.5 h-3.5 mr-1" />
                            Add Champion
                        </Button>
                    </div>

                    {champions.length > 0 ? (
                        <div className="space-y-3">
                            {champions.map((champ) => (
                                <div
                                    key={champ.id}
                                    className="flex items-center justify-between gap-4 p-4 rounded-md border border-border hover:bg-muted/20 transition-colors"
                                    data-testid={`row-champion-${champ.id}`}
                                >
                                    <div className="flex items-center gap-3 min-w-0">
                                        <Avatar className="h-10 w-10 flex-shrink-0">
                                            {champ.pictureFileName && (
                                                <AvatarImage src={getUrlBlobContainerImage(champ.pictureFileName)} alt={champ.name} />
                                            )}
                                            <AvatarFallback className="bg-[#405189]/10 text-[#405189] text-xs">
                                                <User className="w-4 h-4" />
                                            </AvatarFallback>
                                        </Avatar>
                                        <div className="min-w-0">
                                            <p className="font-medium text-sm">{champ.name}</p>
                                            <p className="text-xs text-muted-foreground">{champ.role}</p>
                                        </div>
                                    </div>
                                    <div className="flex gap-1">
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            onClick={() => openEditChampDialog(champ)}
                                            data-testid={`button-edit-champion-${champ.id}`}
                                        >
                                            <Pencil className="w-4 h-4 text-[#405189]" />
                                        </Button>
                                        <AlertDialog>
                                            <AlertDialogTrigger asChild>
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    className="text-destructive hover:text-destructive hover:bg-destructive/10"
                                                    data-testid={`button-delete-champion-${champ.id}`}
                                                >
                                                    <Trash2 className="w-4 h-4" />
                                                </Button>
                                            </AlertDialogTrigger>
                                            <AlertDialogContent>
                                                <AlertDialogHeader>
                                                    <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                                                    <AlertDialogDescription>
                                                        This action cannot be undone. This will permanently remove the champion from this group.
                                                    </AlertDialogDescription>
                                                </AlertDialogHeader>
                                                <AlertDialogFooter>
                                                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                                                    <AlertDialogAction
                                                        onClick={() => handleDeleteChamp(champ.id)}
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
                            <Users className="w-8 h-8 mx-auto mb-2 opacity-30" />
                            <p className="text-sm">No champions or catalysts added yet.</p>
                        </div>
                    )}
                </CardContent>
            </Card>

            <Dialog open={showChampDialog} onOpenChange={(open) => {
                if (!open && searchTimerRef.current) clearTimeout(searchTimerRef.current);
                setShowChampDialog(open);
            }}>
                <DialogContent className="sm:max-w-lg" data-testid="dialog-add-champion">
                    <DialogHeader>
                        <DialogTitle>{editingChampId ? "Edit Champion" : "Add Champion"}</DialogTitle>
                    </DialogHeader>

                    <div className="flex justify-center mb-2">
                        <Avatar className="h-14 w-14">
                            {selectedChampUser?.pictureFileName ? (
                                <AvatarImage src={getUrlBlobContainerImage(selectedChampUser.pictureFileName)} alt={selectedChampUser.fullName} />
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
                                    value={champSearchQuery}
                                    onChange={(e) => handleChampSearchChange(e.target.value)}
                                    className="pl-9"
                                    data-testid="input-champion-search"
                                />
                                {champSearchLoading && (
                                    <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-muted-foreground" />
                                )}
                            </div>
                            {selectedChampUser && (
                                <div className="mt-2 flex items-center gap-2 px-3 py-2 rounded-md bg-[#405189]/10 border border-[#405189]/20">
                                    <Check className="w-4 h-4 text-[#405189] flex-shrink-0" />
                                    <span className="text-sm font-medium text-[#405189]">{selectedChampUser.fullName}</span>
                                </div>
                            )}
                            {champSearchResults.length > 0 && !selectedChampUser && (
                                <div className="absolute z-50 w-full mt-1 bg-popover border border-border rounded-md shadow-lg max-h-48 overflow-y-auto" data-testid="dropdown-champion-search">
                                    {champSearchResults.map((u) => (
                                        <button
                                            key={u.id}
                                            type="button"
                                            className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-muted transition-colors text-left"
                                            onClick={() => { setSelectedChampUser(u); setChampSearchQuery(u.fullName); setChampForm((f) => ({ ...f, name: u.fullName })); setChampSearchResults([]); }}
                                            data-testid={`option-champion-${u.id}`}
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
                                placeholder="e.g. Impact Investor"
                                value={champForm.role}
                                onChange={(e) => setChampForm((f) => ({ ...f, role: e.target.value }))}
                                data-testid="input-champion-role"
                            />
                        </div>

                        <div className="space-y-1.5">
                            <Label className="text-sm font-medium">Description / Testimonial <span className="text-destructive">*</span></Label>
                            <div className="relative">
                                <Textarea
                                    placeholder="Write a brief description or testimonial..."
                                    value={champForm.description}
                                    onChange={(e) => { if (e.target.value.length <= 1000) setChampForm((f) => ({ ...f, description: e.target.value })); }}
                                    rows={3}
                                    className="resize-none"
                                    data-testid="input-champion-description"
                                />
                                <span className="absolute bottom-2 right-3 text-xs text-muted-foreground">{champForm.description.length}/1000</span>
                            </div>
                        </div>
                    </div>

                    <div className="flex justify-end gap-3 mt-4">
                        <Button variant="ghost" onClick={() => setShowChampDialog(false)} data-testid="button-cancel-champion">Cancel</Button>
                        <Button
                            className="bg-[#405189] hover:bg-[#405189]/90"
                            onClick={handleSaveChamp}
                            disabled={savingChamp}
                            data-testid="button-save-champion"
                        >
                            {savingChamp ? <><Loader2 className="w-4 h-4 animate-spin mr-2" />Saving...</> : "Save"}
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>
        </>
    );
}
