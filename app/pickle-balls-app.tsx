"use client";

import {
  Activity,
  AlertTriangle,
  ArrowRight,
  BarChart3,
  Bell,
  Check,
  CheckCircle2,
  ChevronRight,
  Clock3,
  Flame,
  History,
  ImagePlus,
  LayoutGrid,
  LockKeyhole,
  LogOut,
  Menu,
  MessageCircle,
  MoreHorizontal,
  Paperclip,
  Plus,
  ScanLine,
  ShieldCheck,
  Sparkles,
  Target,
  Upload,
  Users,
  X,
  Zap,
} from "lucide-react";
import Image from "next/image";
import { type FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { AvatarFallback, Avatar as UiAvatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { authClient } from "@/lib/auth-client";
import type {
  ScreenTimeExtraction,
  StoredScreenTimeReceipt,
} from "@/lib/screen-time";

type View = "today" | "squad" | "receipts";
type Signal = "Clear" | "Working" | "At risk";

type Commitment = {
  id: number;
  title: string;
  definition: string;
  due: string;
  done: boolean;
};

type Member = {
  name: string;
  initials: string;
  color: string;
  signal: Signal;
  progress: string;
  detail: string;
};

const starterCommitments: Commitment[] = [
  {
    id: 1,
    title: "Finish Common App activities list",
    definition: "All 10 entries drafted and proofread",
    due: "6:30 PM",
    done: false,
  },
  {
    id: 2,
    title: "Submit calculus problem set",
    definition: "Upload confirmation attached",
    due: "7:15 PM",
    done: true,
  },
  {
    id: 3,
    title: "Review two Codeforces editorials",
    definition: "Write the key idea for each problem",
    due: "8:30 PM",
    done: false,
  },
];

const members: Member[] = [
  {
    name: "Zayd",
    initials: "ZK",
    color: "lime",
    signal: "Working",
    progress: "1/3",
    detail: "Activities list is next",
  },
  {
    name: "David",
    initials: "DG",
    color: "orange",
    signal: "Clear",
    progress: "3/3",
    detail: "Proof posted 18m ago",
  },
  {
    name: "Eddie",
    initials: "ET",
    color: "blue",
    signal: "Working",
    progress: "2/3",
    detail: "Presentation due at 8:00",
  },
  {
    name: "Khalid",
    initials: "KJ",
    color: "pink",
    signal: "At risk",
    progress: "0/2",
    detail: "Asked for essay help",
  },
];

const pastReceipts = [
  {
    day: "SUN",
    date: "30",
    average: "3h 07m",
    social: "2h 26m",
    change: "−18%",
    clear: true,
  },
  {
    day: "SAT",
    date: "29",
    average: "5h 41m",
    social: "4h 02m",
    change: "+31%",
    clear: false,
  },
  {
    day: "FRI",
    date: "28",
    average: "2h 52m",
    social: "1h 11m",
    change: "−24%",
    clear: true,
  },
  {
    day: "THU",
    date: "27",
    average: "3h 18m",
    social: "1h 48m",
    change: "−9%",
    clear: true,
  },
];

const screenBarData = [
  { id: "sun", height: 38 },
  { id: "mon", height: 67 },
  { id: "tue", height: 45 },
  { id: "wed", height: 80 },
  { id: "thu", height: 42 },
  { id: "fri", height: 54 },
  { id: "sat", height: 76 },
];

const reliabilityBarData = [
  80, 100, 69, 100, 91, 35, 100, 74, 88, 100, 66, 100, 100, 46,
].map((height, index) => ({ id: `day-${index + 1}`, height }));

function MemberAvatar({
  member,
  small = false,
}: {
  member: Member;
  small?: boolean;
}) {
  return (
    <span
      className={`avatar avatar-${member.color}${small ? " avatar-small" : ""}`}
    >
      {member.initials}
    </span>
  );
}

function SignalDot({ signal }: { signal: Signal }) {
  return (
    <i
      className={`signal-dot signal-${signal.toLowerCase().replace(" ", "-")}`}
    />
  );
}

function minutesLabel(value: number | null) {
  if (value === null) return "—";
  const hours = Math.floor(value / 60);
  const minutes = value % 60;
  return hours > 0
    ? `${hours}h ${String(minutes).padStart(2, "0")}m`
    : `${minutes}m`;
}

export default function PickleBallsApp({
  currentUser,
  initialReceipt,
}: {
  currentUser: {
    name: string;
    email: string;
    initials: string;
    isAdmin: boolean;
  };
  initialReceipt: StoredScreenTimeReceipt | null;
}) {
  const [view, setView] = useState<View>("today");
  const [commitments, setCommitments] = useState(starterCommitments);
  const [signal, setSignal] = useState<Signal>("Working");
  const [menuOpen, setMenuOpen] = useState(false);
  const [commitmentModalOpen, setCommitmentModalOpen] = useState(false);
  const [receiptModalOpen, setReceiptModalOpen] = useState(false);
  const [signalMenuOpen, setSignalMenuOpen] = useState(false);
  const [receipt, setReceipt] = useState<StoredScreenTimeReceipt | null>(
    initialReceipt,
  );
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    if (!toast) return;
    const timeout = window.setTimeout(() => setToast(null), 2800);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  const done = commitments.filter((commitment) => commitment.done).length;
  const completion = Math.round((done / commitments.length) * 100);
  const currentMembers = useMemo(
    () =>
      [
        {
          name: currentUser.name,
          initials: currentUser.initials,
          color: "lime",
          signal,
          progress: `${done}/${commitments.length}`,
          detail:
            signal === "Clear"
              ? "All promises shipped"
              : `${commitments.length - done} promises left`,
        },
        ...members.filter((member) => member.name !== currentUser.name),
      ].slice(0, 4),
    [commitments.length, currentUser, done, signal],
  );

  async function signOut() {
    await authClient.signOut();
    window.location.assign("/sign-in");
  }

  function navigate(nextView: View) {
    setView(nextView);
    setMenuOpen(false);
  }

  function toggleCommitment(id: number) {
    const target = commitments.find((item) => item.id === id);
    setCommitments((current) =>
      current.map((item) =>
        item.id === id ? { ...item, done: !item.done } : item,
      ),
    );
    if (target && !target.done) setToast("Promise shipped. Receipt added.");
  }

  function addCommitment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const title = String(data.get("title") ?? "").trim();
    const definition = String(data.get("definition") ?? "").trim();
    const due = String(data.get("due") ?? "").trim();
    if (!title || !definition || !due) return;
    setCommitments((current) => [
      ...current,
      { id: Date.now(), title, definition, due, done: false },
    ]);
    setCommitmentModalOpen(false);
    setToast("Promise added. No pretending you forgot.");
  }

  return (
    <main className="app-shell">
      <aside className={`sidebar${menuOpen ? " sidebar-open" : ""}`}>
        <div className="wordmark">
          <span className="ball-mark">
            <i />
            <i />
          </span>
          <span>
            <strong>PICKLE</strong>
            <strong>BALLS</strong>
          </span>
        </div>
        <button
          type="button"
          className="sidebar-close"
          onClick={() => setMenuOpen(false)}
          aria-label="Close navigation"
        >
          <X size={19} />
        </button>

        <nav className="nav-list" aria-label="Primary navigation">
          <button
            type="button"
            className={view === "today" ? "active" : ""}
            onClick={() => navigate("today")}
          >
            <LayoutGrid size={19} />
            Today
          </button>
          <button
            type="button"
            className={view === "squad" ? "active" : ""}
            onClick={() => navigate("squad")}
          >
            <Users size={19} />
            Squad<span>4</span>
          </button>
          <button
            type="button"
            className={view === "receipts" ? "active" : ""}
            onClick={() => navigate("receipts")}
          >
            <History size={19} />
            Receipts
          </button>
        </nav>

        <div className="court-note">
          <span>
            <Target size={19} />
          </span>
          <p>
            <b>The actual goal</b>Finish the work. Stop feeding the rectangle.
            Go play pickleball.
          </p>
        </div>

        <div className="profile-row">
          <UiAvatar>
            <AvatarFallback>{currentUser.initials}</AvatarFallback>
          </UiAvatar>
          <span>
            <b>{currentUser.name}</b>
            <small>Pickle Balls</small>
          </span>
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Open account menu"
                />
              }
            >
              <MoreHorizontal />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuGroup>
                <DropdownMenuLabel>
                  <span className="account-menu-name">{currentUser.name}</span>
                  <span className="account-menu-email">
                    {currentUser.email}
                  </span>
                </DropdownMenuLabel>
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
              <DropdownMenuGroup>
                {currentUser.isAdmin && (
                  <DropdownMenuItem
                    onClick={() => window.location.assign("/admin")}
                  >
                    <ShieldCheck />
                    Invite admin
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem variant="destructive" onClick={signOut}>
                  <LogOut />
                  Sign out
                </DropdownMenuItem>
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </aside>

      {menuOpen && (
        <button
          type="button"
          className="sidebar-scrim"
          aria-label="Close navigation"
          onClick={() => setMenuOpen(false)}
        />
      )}

      <section className="main-panel">
        <header className="topbar">
          <button
            type="button"
            className="menu-button"
            onClick={() => setMenuOpen(true)}
            aria-label="Open navigation"
          >
            <Menu size={20} />
          </button>
          <div className="top-date">
            <span>MONDAY</span>
            <b>AUGUST 31</b>
          </div>
          <div className="topbar-right">
            <div className="avatar-stack">
              {currentMembers.slice(0, 3).map((member) => (
                <MemberAvatar key={member.name} member={member} small />
              ))}
              <span className="avatar avatar-small avatar-extra">+1</span>
            </div>
            <button
              type="button"
              className="bell-button"
              aria-label="Notifications"
            >
              <Bell size={18} />
              <i />
            </button>
            <div className="signal-control">
              <button
                type="button"
                onClick={() => setSignalMenuOpen((open) => !open)}
              >
                <SignalDot signal={signal} />
                {signal}
                <ChevronRight size={15} />
              </button>
              {signalMenuOpen && (
                <div className="signal-menu">
                  {(["Clear", "Working", "At risk"] as Signal[]).map(
                    (option) => (
                      <button
                        type="button"
                        key={option}
                        onClick={() => {
                          setSignal(option);
                          setSignalMenuOpen(false);
                          setToast(`Status set to ${option}.`);
                        }}
                      >
                        <SignalDot signal={option} />
                        <span>{option}</span>
                        {signal === option && <Check size={15} />}
                      </button>
                    ),
                  )}
                </div>
              )}
            </div>
          </div>
        </header>

        <div className="page-wrap">
          {view === "today" && (
            <TodayView
              commitments={commitments}
              members={currentMembers}
              done={done}
              completion={completion}
              receipt={receipt}
              onToggle={toggleCommitment}
              onAdd={() => setCommitmentModalOpen(true)}
              onUpload={() => setReceiptModalOpen(true)}
              onSquad={() => setView("squad")}
            />
          )}
          {view === "squad" && <SquadView members={currentMembers} />}
          {view === "receipts" && (
            <ReceiptsView
              receipt={receipt}
              onUpload={() => setReceiptModalOpen(true)}
            />
          )}
        </div>
      </section>

      {commitmentModalOpen && (
        <CommitmentModal
          onClose={() => setCommitmentModalOpen(false)}
          onSubmit={addCommitment}
        />
      )}
      {receiptModalOpen && (
        <ReceiptModal
          onClose={() => setReceiptModalOpen(false)}
          onConfirm={(result) => {
            setReceipt(result);
            setReceiptModalOpen(false);
            setToast("Receipt confirmed. The rectangle has been exposed.");
          }}
        />
      )}
      {toast && (
        <div className="toast">
          <CheckCircle2 size={18} />
          {toast}
        </div>
      )}
    </main>
  );
}

function TodayView({
  commitments,
  members,
  done,
  completion,
  receipt,
  onToggle,
  onAdd,
  onUpload,
  onSquad,
}: {
  commitments: Commitment[];
  members: Member[];
  done: number;
  completion: number;
  receipt: ScreenTimeExtraction | null;
  onToggle: (id: number) => void;
  onAdd: () => void;
  onUpload: () => void;
  onSquad: () => void;
}) {
  return (
    <>
      <section className="hero-row">
        <div>
          <span className="eyebrow">
            <Zap size={14} /> TODAY’S DEAL
          </span>
          <h1>
            Do the work.
            <br />
            <em>Earn the day back.</em>
          </h1>
        </div>
        <p>
          We know ur gonna do some bullshit today. Make three promises, post the
          evidence, and give the group permission to call it out.
        </p>
      </section>

      <section className="score-strip">
        <div>
          <span>SQUAD CHECK-IN</span>
          <b>
            3 <small>/ 4</small>
          </b>
          <p>one friend needs help</p>
        </div>
        <div>
          <span>PROMISES SHIPPED</span>
          <b>
            6 <small>/ 11</small>
          </b>
          <p>across the squad</p>
        </div>
        <div>
          <span>CLEAR-DAY STREAK</span>
          <b>
            4 <small>days</small>
          </b>
          <p>personal best: 8</p>
        </div>
        <div className="consequence-score">
          <span>WINGSTOP DEBT</span>
          <b>$0</b>
          <p>keep it that way</p>
        </div>
      </section>

      <section className="dashboard-grid">
        <article className="panel promise-panel">
          <header className="panel-heading">
            <div>
              <span className="panel-kicker">
                YOUR PUBLIC PROMISES · OPEN UNTIL 4 PM
              </span>
              <h2>What the fuck are you actually finishing?</h2>
            </div>
            <div
              className="completion-ring"
              style={
                {
                  "--progress": `${completion * 3.6}deg`,
                } as React.CSSProperties
              }
            >
              <span>{completion}%</span>
            </div>
          </header>
          <div className="commitment-list">
            {commitments.map((commitment, index) => (
              <button
                type="button"
                className={`commitment-row${commitment.done ? " done" : ""}`}
                key={commitment.id}
                onClick={() => onToggle(commitment.id)}
              >
                <span className="commitment-number">0{index + 1}</span>
                <span className="commitment-check">
                  {commitment.done && <Check size={16} />}
                </span>
                <span className="commitment-copy">
                  <b>{commitment.title}</b>
                  <small>{commitment.definition}</small>
                </span>
                <span className="commitment-time">
                  <Clock3 size={13} />
                  {commitment.due}
                </span>
              </button>
            ))}
          </div>
          <footer className="promise-footer">
            <button
              type="button"
              onClick={onAdd}
              disabled={commitments.length >= 3}
            >
              <Plus size={16} />
              {commitments.length >= 3
                ? "Three is enough. Do them."
                : "Add promise"}
            </button>
            <span>
              <b>
                {done}/{commitments.length}
              </b>{" "}
              shipped
            </span>
          </footer>
        </article>

        <article
          className={`panel screen-panel${receipt ? " has-receipt" : ""}`}
        >
          <div className="receipt-top">
            <span className="panel-kicker">DAILY SCREEN TIME RECEIPT</span>
            <span className={receipt ? "receipt-posted" : "receipt-due"}>
              <i />
              {receipt ? "POSTED" : "DUE 10 PM"}
            </span>
          </div>
          {receipt ? (
            <>
              <div className="screen-stat">
                <small>DAILY AVERAGE</small>
                <strong>{minutesLabel(receipt.dailyAverageMinutes)}</strong>
                <span>
                  {receipt.comparisonPercent === null
                    ? "No comparison visible"
                    : `${receipt.comparisonPercent > 0 ? "+" : ""}${receipt.comparisonPercent}% vs. last week`}
                </span>
              </div>
              <div className="screen-bars">
                {screenBarData.map(({ id, height }) => (
                  <i key={id} style={{ height: `${height}%` }} />
                ))}
              </div>
              <p className="ai-read">
                <Sparkles size={15} />
                <span>
                  <b>AI read</b>
                  {receipt.summary}
                </span>
              </p>
              <button
                type="button"
                className="screen-action"
                onClick={onUpload}
              >
                Replace receipt
                <ArrowRight size={16} />
              </button>
            </>
          ) : (
            <>
              <div className="scan-visual">
                <ScanLine size={31} />
                <span>
                  <i />
                  <i />
                  <i />
                </span>
              </div>
              <h2>Post the screenshot you wish looked better.</h2>
              <p>
                The AI extracts totals and top apps. You review every value
                before anyone else sees it.
              </p>
              <button
                type="button"
                className="screen-action"
                onClick={onUpload}
              >
                <ImagePlus size={17} />
                Upload Screen Time
                <ArrowRight size={16} />
              </button>
            </>
          )}
        </article>

        <article className="panel squad-panel">
          <header className="panel-heading compact">
            <div>
              <span className="panel-kicker">SQUAD PULSE</span>
              <h2>Who is currently full of shit?</h2>
            </div>
            <button type="button" onClick={onSquad} aria-label="Open squad">
              <ArrowRight size={17} />
            </button>
          </header>
          <div className="member-list">
            {members.map((member) => (
              <div className="member-row" key={member.name}>
                <MemberAvatar member={member} />
                <span>
                  <b>{member.name}</b>
                  <small>{member.detail}</small>
                </span>
                <strong>{member.progress}</strong>
                <em
                  className={`signal-label signal-label-${member.signal.toLowerCase().replace(" ", "-")}`}
                >
                  <SignalDot signal={member.signal} />
                  {member.signal}
                </em>
              </div>
            ))}
          </div>
        </article>

        <article className="panel feed-panel">
          <header className="panel-heading compact">
            <div>
              <span className="panel-kicker">RECEIPTS, NOT STORIES</span>
              <h2>What just happened</h2>
            </div>
            <Activity size={20} />
          </header>
          <div className="activity-list">
            <div>
              <MemberAvatar member={members[1]} small />
              <p>
                <b>David cleared the day</b>
                <span>
                  <Paperclip size={12} />
                  Physics corrections verified
                </span>
              </p>
              <time>18m</time>
            </div>
            <div>
              <MemberAvatar member={members[3]} small />
              <p>
                <b>Khalid raised a blocker</b>
                <span>
                  <MessageCircle size={12} />
                  David offered essay help
                </span>
              </p>
              <time>41m</time>
            </div>
            <div>
              <MemberAvatar member={members[2]} small />
              <p>
                <b>Eddie changed one promise</b>
                <span>
                  <LockKeyhole size={12} />
                  Changed before the 4 PM lock
                </span>
              </p>
              <time>1h</time>
            </div>
          </div>
        </article>
      </section>

      <section className="rule-strip">
        <span>
          <b>01</b>Max three promises
        </span>
        <span>
          <b>02</b>Define what “done” means
        </span>
        <span>
          <b>03</b>Ask for help before the deadline
        </span>
        <span>
          <b>04</b>Proof beats whatever story you cooked up
        </span>
      </section>
    </>
  );
}

function SquadView({ members }: { members: Member[] }) {
  return (
    <>
      <section className="hero-row secondary-hero">
        <div>
          <span className="eyebrow">
            <Users size={14} /> FOUR PEOPLE, ONE MEMORY
          </span>
          <h1>
            Accountability
            <br />
            <em>without the theater.</em>
          </h1>
        </div>
        <p>
          No fake hustle. No productivity cosplay. The group sees what you
          promised, what happened, and whether you asked for help before the
          whole thing went to shit.
        </p>
      </section>
      <section className="member-grid">
        {members.map((member, index) => (
          <article className="member-card" key={member.name}>
            <header>
              <MemberAvatar member={member} />
              <em
                className={`signal-label signal-label-${member.signal.toLowerCase().replace(" ", "-")}`}
              >
                <SignalDot signal={member.signal} />
                {member.signal}
              </em>
            </header>
            <h2>
              {member.name}
              {index === 0 && <small>YOU</small>}
            </h2>
            <p>{member.detail}</p>
            <div className="member-progress">
              <i
                style={{
                  width:
                    member.progress === "3/3"
                      ? "100%"
                      : member.progress === "2/3"
                        ? "66%"
                        : member.progress === "1/3"
                          ? "33%"
                          : "8%",
                }}
              />
            </div>
            <dl>
              <div>
                <dt>TODAY</dt>
                <dd>{member.progress}</dd>
              </div>
              <div>
                <dt>14-DAY RELIABILITY</dt>
                <dd>{[86, 91, 78, 63][index]}%</dd>
              </div>
            </dl>
            <button type="button">
              {member.signal === "At risk" ? "Offer help" : "View promises"}
              <ChevronRight size={16} />
            </button>
          </article>
        ))}
      </section>
      <article className="group-pact">
        <span>
          <ShieldCheck size={28} />
        </span>
        <div>
          <small>THE GROUP PACT</small>
          <h2>If you miss without warning, you buy Wingstop.</h2>
          <p>
            Dumb enough to be funny. Annoying enough to matter. Decided before
            anyone fails.
          </p>
        </div>
        <button type="button">
          Read all four rules
          <ArrowRight size={16} />
        </button>
      </article>
    </>
  );
}

function ReceiptsView({
  receipt,
  onUpload,
}: {
  receipt: ScreenTimeExtraction | null;
  onUpload: () => void;
}) {
  return (
    <>
      <section className="hero-row secondary-hero">
        <div>
          <span className="eyebrow">
            <BarChart3 size={14} /> THE HONEST RECORD
          </span>
          <h1>
            Your word has
            <br />
            <em>a track record.</em>
          </h1>
        </div>
        <p>
          Screen Time is evidence, not the score. The score is whether you did
          the damn thing you said you would do.
        </p>
      </section>
      <section className="receipts-layout">
        <article className="reliability-card">
          <span className="panel-kicker">PROMISE RELIABILITY</span>
          <div>
            <strong>86</strong>
            <span>
              / 100
              <br />
              SOLID
            </span>
          </div>
          <div className="history-bars">
            {reliabilityBarData.map(({ id, height }) => (
              <i
                key={id}
                className={height < 50 ? "missed" : ""}
                style={{ height: `${height}%` }}
              />
            ))}
          </div>
          <p>
            <Flame size={16} />
            Four clear days in a row
          </p>
        </article>
        <article className="panel receipt-history">
          <header className="panel-heading compact">
            <div>
              <span className="panel-kicker">SCREEN TIME RECEIPTS</span>
              <h2>Evidence, day by day</h2>
            </div>
            <button type="button" onClick={onUpload}>
              <Upload size={16} />
              Post today
            </button>
          </header>
          <div className="receipt-list">
            {receipt && (
              <ReceiptRow
                day="MON"
                date="31"
                average={minutesLabel(receipt.dailyAverageMinutes)}
                social={minutesLabel(receipt.socialMinutes)}
                change={
                  receipt.comparisonPercent === null
                    ? "—"
                    : `${receipt.comparisonPercent}%`
                }
                clear
              />
            )}
            {pastReceipts.map((item) => (
              <ReceiptRow key={item.date} {...item} />
            ))}
          </div>
        </article>
      </section>
    </>
  );
}

function ReceiptRow({
  day,
  date,
  average,
  social,
  change,
  clear,
}: {
  day: string;
  date: string;
  average: string;
  social: string;
  change: string;
  clear: boolean;
}) {
  return (
    <div className="receipt-row">
      <span className="receipt-date">
        <small>{day}</small>
        <b>{date}</b>
      </span>
      <span className={`receipt-result${clear ? " clear" : ""}`}>
        {clear ? <Check size={16} /> : <X size={16} />}
      </span>
      <span>
        <b>{average} average</b>
        <small>{social} social</small>
      </span>
      <span className={change.startsWith("+") ? "change-up" : ""}>
        {change}
      </span>
      <ChevronRight size={16} />
    </div>
  );
}

function CommitmentModal({
  onClose,
  onSubmit,
}: {
  onClose: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <div className="modal-backdrop">
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="commitment-title"
      >
        <button
          type="button"
          className="modal-close"
          onClick={onClose}
          aria-label="Close"
        >
          <X size={18} />
        </button>
        <span className="modal-kicker">NEW PUBLIC PROMISE</span>
        <h2 id="commitment-title">What will actually be finished?</h2>
        <p>
          “Work on essay” is bullshit. “Finish the first draft” is testable.
        </p>
        <form onSubmit={onSubmit}>
          <label>
            Promise
            <input
              name="title"
              placeholder="Finish the first essay draft"
              required
            />
          </label>
          <label>
            Definition of done
            <input
              name="definition"
              placeholder="Draft shared with the group"
              required
            />
          </label>
          <label>
            Due tonight
            <input name="due" type="time" defaultValue="20:00" required />
          </label>
          <button type="submit" className="primary-button">
            Make it public
            <ArrowRight size={17} />
          </button>
        </form>
      </div>
    </div>
  );
}

function ReceiptModal({
  onClose,
  onConfirm,
}: {
  onClose: () => void;
  onConfirm: (receipt: StoredScreenTimeReceipt) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [result, setResult] = useState<ScreenTimeExtraction | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(
    () => () => {
      if (preview) URL.revokeObjectURL(preview);
    },
    [preview],
  );

  function chooseFile(nextFile: File | null) {
    if (!nextFile) return;
    if (preview) URL.revokeObjectURL(preview);
    setFile(nextFile);
    setPreview(URL.createObjectURL(nextFile));
    setResult(null);
    setError(null);
  }

  async function analyze() {
    if (!file) return;
    setLoading(true);
    setError(null);
    const body = new FormData();
    body.append("image", file);
    try {
      const response = await fetch("/api/screen-time/analyze", {
        method: "POST",
        body,
      });
      const payload = await response.json();
      if (!response.ok)
        throw new Error(payload.error ?? "Could not analyze this screenshot.");
      setResult(payload.extraction);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Could not analyze this screenshot.",
      );
    } finally {
      setLoading(false);
    }
  }

  function useManualEntry() {
    setResult({
      reportDate: new Date().toISOString().slice(0, 10),
      view: "day",
      dailyAverageMinutes: 0,
      totalScreenTimeMinutes: null,
      socialMinutes: 0,
      pickups: null,
      comparisonPercent: null,
      topApps: [],
      summary: "Manual receipt — add the visible values before confirming.",
      confidence: 1,
      warnings: ["Entered manually"],
    });
  }

  async function confirmReceipt() {
    if (!result) return;
    setSaving(true);
    setError(null);
    const body = new FormData();
    body.append("extraction", JSON.stringify(result));
    if (file) body.append("image", file);

    try {
      const response = await fetch("/api/screen-time/receipts", {
        method: "POST",
        body,
      });
      const payload = (await response.json()) as {
        error?: string;
        receipt?: StoredScreenTimeReceipt;
      };
      if (!response.ok || !payload.receipt) {
        throw new Error(payload.error ?? "Could not save this receipt.");
      }
      onConfirm(payload.receipt);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Could not save this receipt.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-backdrop receipt-backdrop">
      <div
        className="receipt-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="receipt-title"
      >
        <button
          type="button"
          className="modal-close"
          onClick={onClose}
          aria-label="Close"
        >
          <X size={18} />
        </button>
        <div className="receipt-modal-head">
          <span className="modal-kicker">DAILY SCREEN TIME RECEIPT</span>
          <h2 id="receipt-title">Show the numbers. Skip the confession.</h2>
          <p>
            Upload Apple’s Day or Week view. The model extracts only visible
            facts, and you approve them.
          </p>
        </div>
        <div className="receipt-workspace">
          <button
            type="button"
            className={`upload-zone${preview ? " has-preview" : ""}`}
            onClick={() => inputRef.current?.click()}
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault();
              chooseFile(event.dataTransfer.files[0] ?? null);
            }}
          >
            {preview ? (
              <Image
                src={preview}
                alt="Screen Time screenshot preview"
                width={800}
                height={1200}
                unoptimized
              />
            ) : (
              <>
                <span>
                  <ImagePlus size={27} />
                </span>
                <b>Drop the screenshot here</b>
                <small>PNG, JPEG, or WebP · max 4 MB</small>
              </>
            )}
            <input
              ref={inputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              hidden
              onChange={(event) => chooseFile(event.target.files?.[0] ?? null)}
            />
          </button>
          <div className="extraction-pane">
            {result ? (
              <ExtractionEditor result={result} onChange={setResult} />
            ) : (
              <div className="extraction-empty">
                <ScanLine size={25} />
                <b>Waiting for a screenshot</b>
                <p>
                  We’ll extract the view, totals, social time, top apps, and
                  comparison.
                </p>
              </div>
            )}
          </div>
        </div>
        {error && (
          <p className="upload-error">
            <AlertTriangle size={15} />
            {error}
          </p>
        )}
        <footer className="receipt-modal-actions">
          <button
            type="button"
            className="manual-button"
            onClick={useManualEntry}
          >
            Enter manually
          </button>
          {result ? (
            <button
              type="button"
              className="primary-button"
              disabled={saving}
              onClick={confirmReceipt}
            >
              {saving ? (
                <>
                  <span className="spinner" />
                  Saving receipt…
                </>
              ) : (
                <>
                  Confirm receipt
                  <Check size={16} />
                </>
              )}
            </button>
          ) : (
            <button
              type="button"
              className="primary-button"
              disabled={!file || loading}
              onClick={analyze}
            >
              {loading ? (
                <>
                  <span className="spinner" />
                  Reading screenshot…
                </>
              ) : (
                <>
                  <Sparkles size={16} />
                  Extract with AI
                </>
              )}
            </button>
          )}
        </footer>
      </div>
    </div>
  );
}

function ExtractionEditor({
  result,
  onChange,
}: {
  result: ScreenTimeExtraction;
  onChange: (next: ScreenTimeExtraction) => void;
}) {
  function updateNumber(
    key: "dailyAverageMinutes" | "totalScreenTimeMinutes" | "socialMinutes",
    value: string,
  ) {
    onChange({ ...result, [key]: value === "" ? null : Number(value) });
  }
  return (
    <div className="extraction-result">
      <div className="extraction-status">
        <span>
          <Sparkles size={14} />
          AI EXTRACTION
        </span>
        <b>{Math.round(result.confidence * 100)}% confident</b>
      </div>
      <label>
        Daily average{" "}
        <span>
          <input
            type="number"
            min="0"
            value={result.dailyAverageMinutes ?? ""}
            onChange={(event) =>
              updateNumber("dailyAverageMinutes", event.target.value)
            }
          />{" "}
          min
        </span>
      </label>
      <label>
        Total visible{" "}
        <span>
          <input
            type="number"
            min="0"
            value={result.totalScreenTimeMinutes ?? ""}
            onChange={(event) =>
              updateNumber("totalScreenTimeMinutes", event.target.value)
            }
          />{" "}
          min
        </span>
      </label>
      <label>
        Social{" "}
        <span>
          <input
            type="number"
            min="0"
            value={result.socialMinutes ?? ""}
            onChange={(event) =>
              updateNumber("socialMinutes", event.target.value)
            }
          />{" "}
          min
        </span>
      </label>
      <div className="top-apps">
        <small>TOP APPS</small>
        {result.topApps.length ? (
          result.topApps.slice(0, 3).map((app) => (
            <span key={app.name}>
              <b>{app.name}</b>
              {minutesLabel(app.minutes)}
            </span>
          ))
        ) : (
          <p>No app rows extracted.</p>
        )}
      </div>
      {result.warnings.length > 0 && (
        <p className="extraction-warning">
          <AlertTriangle size={13} />
          {result.warnings[0]}
        </p>
      )}
    </div>
  );
}
