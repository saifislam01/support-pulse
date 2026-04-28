import { createFileRoute } from "@tanstack/react-router";
import { useState, useRef } from "react";
import { AppShell } from "@/components/AppShell";
import { RequireAuth } from "@/components/RequireAuth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { Copy, Download, Eraser, FileText, Sparkles } from "lucide-react";

export const Route = createFileRoute("/sumup")({
  component: SumUpPage,
});

type Fields = {
  ticketsAssigned: string;
  ticketsUnassigned: string;
  liveChats: string;
  githubIssues: string;
  facebookReplies: string;
  issuesAssigned: string;
  newDocs: string;
  updatedDocs: string;
  kbArticles: string;
  rdTopics: string;
  qaTopics: string;
  meetings: string;
  collaborations: string;
  learning: string;
  otfTasks: string;
  notes: string;
};

const empty: Fields = {
  ticketsAssigned: "",
  ticketsUnassigned: "",
  liveChats: "",
  githubIssues: "",
  facebookReplies: "",
  issuesAssigned: "",
  newDocs: "",
  updatedDocs: "",
  kbArticles: "",
  rdTopics: "",
  qaTopics: "",
  meetings: "",
  collaborations: "",
  learning: "",
  otfTasks: "",
  notes: "",
};

function SumUpPage() {
  const [f, setF] = useState<Fields>(empty);
  const previewRef = useRef<HTMLDivElement>(null);

  const today = new Date().toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const update = (key: keyof Fields) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setF((prev) => ({ ...prev, [key]: e.target.value }));
  };

  // Slack-flavored output: *bold* (single asterisk), • bullets, backtick code
  const buildSlack = () => {
    const lines: string[] = [];
    lines.push(`*Summary of Activities:* ${today}`);
    lines.push("");

    const hasTickets = f.ticketsAssigned || f.ticketsUnassigned;
    if (hasTickets) {
      lines.push(`📥 *Tickets:*`);
      const total =
        (parseInt(f.ticketsAssigned || "0") || 0) +
        (parseInt(f.ticketsUnassigned || "0") || 0);
      if (total > 0) lines.push(`• Replied to \`${String(total).padStart(2, "0")}\` tickets`);
      if (f.ticketsAssigned) lines.push(`    ◦ Assigned - \`${String(f.ticketsAssigned).padStart(2, "0")}\``);
      if (f.ticketsUnassigned) lines.push(`    ◦ Unassigned - \`${String(f.ticketsUnassigned).padStart(2, "0")}\``);
      lines.push("");
    }

    if (f.liveChats) {
      lines.push(`💬 *Live chats:*`);
      lines.push(`• Reviewed \`${String(f.liveChats).padStart(2, "0")}\` live chats`);
      lines.push("");
    }

    if (f.githubIssues || f.facebookReplies || f.issuesAssigned) {
      lines.push(`🌐 *Community & Platform Contributions:*`);
      if (f.githubIssues) lines.push(`• Created/Replied \`${f.githubIssues}\` GitHub issues`);
      if (f.facebookReplies) lines.push(`• Replied to \`${f.facebookReplies}\` Facebook posts/comments`);
      if (f.issuesAssigned) lines.push(`• Assigned \`${f.issuesAssigned}\` issues`);
      lines.push("");
    }

    if (f.newDocs || f.updatedDocs || f.kbArticles) {
      lines.push(`📚 *Documentation:*`);
      if (f.newDocs) lines.push(`• New documentation articles: \`${f.newDocs}\``);
      if (f.updatedDocs) lines.push(`• Updated documentation articles: \`${f.updatedDocs}\``);
      if (f.kbArticles) lines.push(`• Knowledgebase articles published: \`${f.kbArticles}\``);
      lines.push("");
    }

    if (f.rdTopics || f.qaTopics) {
      lines.push(`🔬 *Research & Development:*`);
      if (f.rdTopics) lines.push(`• R&D topics documented: \`${f.rdTopics}\``);
      if (f.qaTopics) lines.push(`• QA topics: \`${f.qaTopics}\``);
      lines.push("");
    }

    if (f.meetings) {
      lines.push(`📹 *Meeting:*`);
      lines.push(`• Attended \`${f.meetings}\` meetings`);
      lines.push("");
    }

    if (f.collaborations) {
      lines.push(`🤝 *Collaboration:*`);
      lines.push(`• \`${f.collaborations}\` collaborations`);
      lines.push("");
    }

    if (f.learning || f.otfTasks) {
      lines.push(`📖 *Learning & Additional Tasks:*`);
      if (f.learning) lines.push(`• Learning: ${f.learning}`);
      if (f.otfTasks) lines.push(`• OTF / Additional Tasks: \`${f.otfTasks}\``);
      lines.push("");
    }

    if (f.notes) {
      lines.push(`📝 *Notes:*`);
      lines.push(f.notes);
      lines.push("");
    }

    lines.push(`*On the next working day, I have plans to:*`);
    lines.push(`Reply to assigned & unassigned tickets, review live chats, follow up on unresolved issues, respond to community posts, update documentation, and continue scheduled learning.`);

    return lines.join("\n");
  };

  // Markdown (GitHub-style) for file download
  const buildMarkdown = () => buildSlack().replace(/^\*([^*\n]+)\*/gm, "**$1**").replace(/^• /gm, "- ").replace(/^    ◦ /gm, "  - ");

  const handleCopy = async () => {
    const text = buildSlack();
    await navigator.clipboard.writeText(text);
    toast.success("Copied! Paste directly into Slack.");
  };

  const handleDownload = () => {
    const md = buildMarkdown();
    const blob = new Blob([md], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `daily-sumup-${new Date().toISOString().split("T")[0]}.md`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Markdown downloaded!");
  };

  const handleClear = () => {
    setF(empty);
    toast.info("Cleared all fields");
  };

  const Chip = ({ children }: { children: React.ReactNode }) => (
    <span className="inline-flex items-center px-1.5 py-0.5 mx-0.5 rounded-md border border-rose-300/60 bg-rose-50 text-rose-700 font-mono text-[0.85em] dark:bg-rose-500/10 dark:border-rose-400/30 dark:text-rose-300">
      {children}
    </span>
  );

  const Heading = ({ children }: { children: React.ReactNode }) => (
    <span className="inline-flex items-center px-2 py-0.5 rounded-md border border-rose-300/60 bg-rose-50 text-rose-700 font-mono text-sm font-semibold dark:bg-rose-500/10 dark:border-rose-400/30 dark:text-rose-300">
      {children}
    </span>
  );

  const ticketsTotal =
    (parseInt(f.ticketsAssigned || "0") || 0) +
    (parseInt(f.ticketsUnassigned || "0") || 0);

  const showTickets = f.ticketsAssigned || f.ticketsUnassigned;
  const showLiveChats = !!f.liveChats;
  const showCommunity = f.githubIssues || f.facebookReplies || f.issuesAssigned;
  const showDocs = f.newDocs || f.updatedDocs || f.kbArticles;
  const showRD = f.rdTopics || f.qaTopics;
  const showMeeting = !!f.meetings;
  const showCollab = !!f.collaborations;
  const showLearning = f.learning || f.otfTasks;
  const showNotes = !!f.notes;

  return (
    <RequireAuth>
      <AppShell>
        <div className="space-y-6">
          <header className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <h1 className="text-2xl md:text-3xl font-display font-bold flex items-center gap-2">
                <FileText className="size-7 text-primary" />
                Sumup
              </h1>
              <p className="text-sm text-muted-foreground mt-1">
                Fill what you completed today — preview updates live, and copy is Slack-ready.
              </p>
            </div>
            <div className="flex gap-2 flex-wrap">
              <Button variant="outline" size="sm" onClick={handleClear}>
                <Eraser className="size-4 mr-1.5" /> Clear
              </Button>
              <Button variant="outline" size="sm" onClick={handleDownload}>
                <Download className="size-4 mr-1.5" /> Save as Markdown
              </Button>
              <Button size="sm" onClick={handleCopy}>
                <Copy className="size-4 mr-1.5" /> Copy
              </Button>
            </div>
          </header>

          <div className="grid lg:grid-cols-2 gap-6">
            {/* Form */}
            <Card className="p-5 space-y-5">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <Sparkles className="size-4 text-primary" /> What did you complete today?
              </div>

              <Section title="📥 Tickets & Live Chats">
                <Grid>
                  <Field label="Tickets Replied (Assigned)" value={f.ticketsAssigned} onChange={update("ticketsAssigned")} type="number" />
                  <Field label="Tickets Reviewed (Unassigned)" value={f.ticketsUnassigned} onChange={update("ticketsUnassigned")} type="number" />
                </Grid>
                <Field label="Live Chats Handled" value={f.liveChats} onChange={update("liveChats")} type="number" />
              </Section>

              <Section title="🌐 Community & Platform Contributions">
                <Field label="GitHub Issues Replied/Created" value={f.githubIssues} onChange={update("githubIssues")} />
                <Field label="Facebook Posts/Comments Replied" value={f.facebookReplies} onChange={update("facebookReplies")} />
                <Field label="Issues Assigned" value={f.issuesAssigned} onChange={update("issuesAssigned")} />
              </Section>

              <Section title="📚 Documentation">
                <Field label="New Documentation Articles" value={f.newDocs} onChange={update("newDocs")} />
                <Field label="Updated Documentation Articles" value={f.updatedDocs} onChange={update("updatedDocs")} />
                <Field label="Knowledgebase Articles Published" value={f.kbArticles} onChange={update("kbArticles")} />
              </Section>

              <Section title="🔬 Research & Development">
                <Field label="R&D Topics/Issues Documented" value={f.rdTopics} onChange={update("rdTopics")} />
                <Field label="QA Topics" value={f.qaTopics} onChange={update("qaTopics")} />
              </Section>

              <Section title="👥 Meetings & Collaboration">
                <Grid>
                  <Field label="Meetings Attended" value={f.meetings} onChange={update("meetings")} type="number" />
                  <Field label="Collaborations" value={f.collaborations} onChange={update("collaborations")} type="number" />
                </Grid>
              </Section>

              <Section title="📖 Learning & Additional Tasks">
                <Field label="Learning" value={f.learning} onChange={update("learning")} />
                <Field label="OTF / Additional Tasks" value={f.otfTasks} onChange={update("otfTasks")} type="number" />
              </Section>

              <Section title="📝 Additional Notes">
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Anything else worth mentioning</Label>
                  <Textarea rows={3} value={f.notes} onChange={update("notes")} placeholder="Optional details..." />
                </div>
              </Section>
            </Card>

            {/* Preview */}
            <Card className="p-5 lg:sticky lg:top-4 self-start">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-semibold text-sm">Live Preview</h2>
                <span className="text-xs text-muted-foreground">Formatted output</span>
              </div>
              <Separator className="mb-4" />
              <div
                ref={previewRef}
                className="space-y-3 text-[15px] leading-relaxed text-foreground/90 max-h-[70vh] overflow-y-auto pr-2"
              >
                <div className="flex items-center gap-2 flex-wrap">
                  <Heading>Summary of Activities:</Heading>
                  <Heading>{today}</Heading>
                </div>

                {showTickets && (
                  <div>
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className="text-lg">📥</span>
                      <Heading>Tickets:</Heading>
                    </div>
                    <ul className="ml-6 list-disc space-y-1">
                      {ticketsTotal > 0 && (
                        <li>
                          Replied to <Chip>{String(ticketsTotal).padStart(2, "0")}</Chip> tickets
                          <ul className="ml-5 list-[circle] mt-1 space-y-1">
                            {f.ticketsAssigned && (
                              <li>Assigned - <Chip>{String(f.ticketsAssigned).padStart(2, "0")}</Chip></li>
                            )}
                            {f.ticketsUnassigned && (
                              <li>Unassigned - <Chip>{String(f.ticketsUnassigned).padStart(2, "0")}</Chip></li>
                            )}
                          </ul>
                        </li>
                      )}
                    </ul>
                  </div>
                )}

                {showLiveChats && (
                  <div>
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className="text-lg">💬</span>
                      <Heading>Live chats:</Heading>
                    </div>
                    <ul className="ml-6 list-disc space-y-1">
                      <li>Reviewed <Chip>{String(f.liveChats).padStart(2, "0")}</Chip> live chats</li>
                    </ul>
                  </div>
                )}

                {showCommunity && (
                  <div>
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className="text-lg">🌐</span>
                      <Heading>Community & Platform Contributions:</Heading>
                    </div>
                    <ul className="ml-6 list-disc space-y-1">
                      {f.githubIssues && <li>Created/Replied <Chip>{f.githubIssues}</Chip> GitHub issues</li>}
                      {f.facebookReplies && <li>Replied to <Chip>{f.facebookReplies}</Chip> Facebook posts/comments</li>}
                      {f.issuesAssigned && <li>Assigned <Chip>{f.issuesAssigned}</Chip> issues</li>}
                    </ul>
                  </div>
                )}

                {showDocs && (
                  <div>
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className="text-lg">📚</span>
                      <Heading>Documentation:</Heading>
                    </div>
                    <ul className="ml-6 list-disc space-y-1">
                      {f.newDocs && <li>New documentation articles: <Chip>{f.newDocs}</Chip></li>}
                      {f.updatedDocs && <li>Updated documentation articles: <Chip>{f.updatedDocs}</Chip></li>}
                      {f.kbArticles && <li>Knowledgebase articles published: <Chip>{f.kbArticles}</Chip></li>}
                    </ul>
                  </div>
                )}

                {showRD && (
                  <div>
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className="text-lg">🔬</span>
                      <Heading>Research & Development:</Heading>
                    </div>
                    <ul className="ml-6 list-disc space-y-1">
                      {f.rdTopics && <li>R&D topics documented: <Chip>{f.rdTopics}</Chip></li>}
                      {f.qaTopics && <li>QA topics: <Chip>{f.qaTopics}</Chip></li>}
                    </ul>
                  </div>
                )}

                {showMeeting && (
                  <div>
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className="text-lg">📹</span>
                      <Heading>Meeting:</Heading>
                    </div>
                    <ul className="ml-6 list-disc space-y-1">
                      <li>Attended <Chip>{f.meetings}</Chip> meetings</li>
                    </ul>
                  </div>
                )}

                {showCollab && (
                  <div>
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className="text-lg">🤝</span>
                      <Heading>Collaboration:</Heading>
                    </div>
                    <ul className="ml-6 list-disc space-y-1">
                      <li><Chip>{f.collaborations}</Chip> collaborations</li>
                    </ul>
                  </div>
                )}

                {showLearning && (
                  <div>
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className="text-lg">📖</span>
                      <Heading>Learning & Additional Tasks:</Heading>
                    </div>
                    <ul className="ml-6 list-disc space-y-1">
                      {f.learning && <li>Learning: {f.learning}</li>}
                      {f.otfTasks && <li>OTF / Additional Tasks: <Chip>{f.otfTasks}</Chip></li>}
                    </ul>
                  </div>
                )}

                {showNotes && (
                  <div>
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className="text-lg">📝</span>
                      <Heading>Notes:</Heading>
                    </div>
                    <p className="ml-6 whitespace-pre-wrap">{f.notes}</p>
                  </div>
                )}

                {!showTickets && !showLiveChats && !showCommunity && !showDocs && !showRD && !showMeeting && !showCollab && !showLearning && !showNotes && (
                  <p className="text-sm text-muted-foreground italic">Start filling the form — your sum-up will appear here.</p>
                )}
              </div>
            </Card>
          </div>
        </div>
      </AppShell>
    </RequireAuth>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-foreground/80">{title}</h3>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

function Grid({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-2 gap-3">{children}</div>;
}

function Field({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  type?: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <Input type={type} value={value} onChange={onChange} placeholder={type === "number" ? "0" : ""} />
    </div>
  );
}
