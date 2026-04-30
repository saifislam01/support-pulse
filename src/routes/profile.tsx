import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { RequireAuth } from "@/components/RequireAuth";
import { AppShell } from "@/components/AppShell";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { toast } from "sonner";
import { Camera, Loader2 } from "lucide-react";

export const Route = createFileRoute("/profile")({
  component: ProfilePage,
});

function ProfilePage() {
  return (
    <RequireAuth>
      <AppShell>
        <ProfileEditor />
      </AppShell>
    </RequireAuth>
  );
}

function ProfileEditor() {
  const { user } = useAuth();
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingEmail, setSavingEmail] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!user) return;
    setEmail(user.email ?? "");
    void (async () => {
      const { data } = await supabase
        .from("profiles")
        .select("display_name, avatar_url")
        .eq("id", user.id)
        .maybeSingle();
      if (data) {
        setDisplayName(data.display_name ?? "");
        setAvatarUrl(data.avatar_url ?? null);
      }
      setLoading(false);
    })();
  }, [user]);

  const initials = (displayName || email || "U")
    .split(/[\s@]/)[0]
    .slice(0, 2)
    .toUpperCase();

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Image must be under 5 MB");
      return;
    }
    if (!file.type.startsWith("image/")) {
      toast.error("Please select an image file");
      return;
    }

    setUploading(true);
    try {
      const ext = file.name.split(".").pop() || "jpg";
      const path = `${user.id}/avatar-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("avatars")
        .upload(path, file, { upsert: true, cacheControl: "3600" });
      if (upErr) throw upErr;

      const { data: pub } = supabase.storage.from("avatars").getPublicUrl(path);
      const newUrl = pub.publicUrl;

      const { error: profErr } = await supabase
        .from("profiles")
        .update({ avatar_url: newUrl })
        .eq("id", user.id);
      if (profErr) throw profErr;

      setAvatarUrl(newUrl);
      toast.success("Profile picture updated");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Upload failed";
      toast.error(msg);
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const handleSaveName = async () => {
    if (!user) return;
    const trimmed = displayName.trim();
    if (!trimmed) {
      toast.error("Display name cannot be empty");
      return;
    }
    if (trimmed.length > 60) {
      toast.error("Display name must be 60 characters or less");
      return;
    }
    setSavingProfile(true);
    try {
      const { error } = await supabase
        .from("profiles")
        .update({ display_name: trimmed })
        .eq("id", user.id);
      if (error) throw error;
      // Also update auth metadata so the sidebar reflects it.
      await supabase.auth.updateUser({ data: { display_name: trimmed } });
      toast.success("Name updated");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to update name";
      toast.error(msg);
    } finally {
      setSavingProfile(false);
    }
  };

  const handleSaveEmail = async () => {
    const trimmed = email.trim();
    if (!trimmed || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      toast.error("Please enter a valid email");
      return;
    }
    if (trimmed === user?.email) {
      toast.info("That's already your email");
      return;
    }
    setSavingEmail(true);
    try {
      const { error } = await supabase.auth.updateUser({ email: trimmed });
      if (error) throw error;
      toast.success("Confirmation sent. Check both your old and new inboxes to confirm.");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to update email";
      toast.error(msg);
    } finally {
      setSavingEmail(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-display font-bold">Your Profile</h1>
        <p className="text-muted-foreground mt-1">Update your photo, name, and email.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Profile picture</CardTitle>
          <CardDescription>PNG or JPG, up to 5 MB.</CardDescription>
        </CardHeader>
        <CardContent className="flex items-center gap-6">
          <div className="relative">
            <Avatar className="size-24">
              {avatarUrl ? <AvatarImage src={avatarUrl} alt={displayName} /> : null}
              <AvatarFallback className="bg-primary/15 text-primary text-xl font-semibold">
                {initials}
              </AvatarFallback>
            </Avatar>
          </div>
          <div className="flex flex-col gap-2">
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleAvatarUpload}
            />
            <Button
              variant="outline"
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
            >
              {uploading ? (
                <Loader2 className="size-4 animate-spin mr-2" />
              ) : (
                <Camera className="size-4 mr-2" />
              )}
              {avatarUrl ? "Change photo" : "Upload photo"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Display name</CardTitle>
          <CardDescription>This is what teammates see in chat and the leaderboard.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-2">
            <Label htmlFor="display_name">Name</Label>
            <Input
              id="display_name"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              maxLength={60}
              placeholder="Your name"
            />
          </div>
          <Button onClick={handleSaveName} disabled={savingProfile}>
            {savingProfile && <Loader2 className="size-4 animate-spin mr-2" />}
            Save name
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Email address</CardTitle>
          <CardDescription>
            We'll send a confirmation link to your new address before the change takes effect.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              maxLength={255}
            />
          </div>
          <Button onClick={handleSaveEmail} disabled={savingEmail} variant="outline">
            {savingEmail && <Loader2 className="size-4 animate-spin mr-2" />}
            Update email
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
