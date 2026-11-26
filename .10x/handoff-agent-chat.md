# Handoff — Pillar C, agent chat

Branch `worktree-agent-a497a43730c3a58ea`. Flag read: `chat` (the coordinator gates on it; the components do not fetch flags themselves).

## Exports

### `components/AgentBubble.tsx`
`AgentBubble(props: AgentBubbleProps)`, plus `AGENT_BUBBLE_ID = "nh-agent-bubble"` and `AGENT_CHAT_ID = "nh-agent-chat"`.
```ts
{ open: boolean; onOpenChange(open: boolean): void;
  badge?: number;          // new homes found while closed (hook: chat.badge)
  running?: boolean;       // spinner ring (hook: chat.running)
  noClaim?: boolean;       // drawn outlined; still opens the chat ("Pick a claim first")
  disabled?: boolean;
  sheetSnap?: SheetSnap;   // phones: collapsed → bottom 68px, half → calc(50dvh+12px), expanded → hidden
  hidden?: boolean;        // phones with the property panel overlay open: not rendered
  className?: string }
```
Differs from the spec's props: `onToggle()` became `onOpenChange(open)`, `newCount` became `badge`. `position: absolute; z-20`; lg+: `right 12px; bottom 24px`.

### `components/AgentChat.tsx`
`AgentChat(props: AgentChatProps)`; re-exports `AgentStatus`, `ChatEntry`.
```ts
{ open: boolean; onClose(): void;
  claim: { id: string; name: string; frv: number | null } | null;
  selectedHome?: { id: string; name: string } | null;   // adds "More like this one"
  messages: ChatEntry[]; status: AgentStatus; canUndo: boolean;
  onSend(text: string, via: "typed" | "voice" | "chip"): void;
  onMoreLike?(home: { id: string; name: string }): void; // pass chat.moreLike (sends more_like for outside listings)
  onStop(): void; onUndo(): void; onRetry(): void; onOpenClaims(): void;
  onShowOnMap?(): void;   // phone sheet result card; default closes the sheet
  modal?: boolean;        // default: true under 1024px (Radix Sheet bottom, 88dvh), else anchored window
  speech?: SpeechControls; className?: string }
```
Esc closes only from inside the window and returns focus to the bubble (by id). Desktop window is not modal.

### `lib/use-agent-chat.ts`
`useAgentChat({ claimId, open, enabled?, onChanged? })` → `{ messages, status, running, summary, searchId, canUndo, badge, send(text), reject(listingId, name?), moreLike(home), undo(), stop(), retry() }`.
Sends `open` the first time the window is open for a claim; resets (aborts, clears) when `claimId` changes; 120 s timeout → error; `user` = `readReporterName()`; calls `onChanged(response)` after each `ok:true`, and again at 15 s / 45 s when `running:true`.

### `lib/use-speech.ts`
`useSpeech(onText)` → `{ supported, listening, blocked, start, stop, toggle }`. `supported` false without (webkit)SpeechRecognition, in an iframe without microphone permission, or after a refusal (remembered in sessionStorage for the session).

### `lib/agent-chat-ui.ts` (pure, unit-tested)
`COPY`, `MAX_CHARS`, `TIMEOUT_MS`, `suggestionsFor`, `formatElapsed`, `runningLine`, `runningPercent`, `summaryText`, `claimLine`, `cleanInput`, `joinSpeech`, `askBody`, `askLabel`, `errorCopy`, `chatReducer`, `initialChat`, `canUndo`, `latestResultId`, `isListingId`, types `Ask`, `ChatEntry`, `AgentStatus`, `ChatState`, `ChatAction`.

## Wiring for the coordinator (MapApp.tsx)
```tsx
const [chatOpen, setChatOpen] = useState(false);
const chat = useAgentChat({ claimId: features.chat ? claim?.id ?? null : null, open: chatOpen, enabled: features.chat,
  onChanged: () => refetchOutside() });
// inside the map's div.relative, after the map:
{features.chat && <>
  <AgentBubble open={chatOpen} onOpenChange={setChatOpen} badge={chat.badge} running={chat.running}
    noClaim={!claim} sheetSnap={sheetSnap} hidden={panelOverlayOpenOnPhone} />
  <AgentChat open={chatOpen} onClose={() => setChatOpen(false)}
    claim={claim ? { id: claim.id, name: claim.name, frv: claim.frv } : null}
    selectedHome={selected ? { id: selected.id, name: selected.name } : null}
    messages={chat.messages} status={chat.status} canUndo={chat.canUndo}
    onSend={(t) => chat.send(t)} onMoreLike={chat.moreLike} onStop={chat.stop} onUndo={chat.undo}
    onRetry={chat.retry} onOpenClaims={openClaimsDrawer} />
</>}
```
Also (not in this pillar): move Google's zoom control to RIGHT_TOP when `chat` is on; pass `avoid = { right: 384, bottom: 0 }` to MapCanvas while the window is open on lg+; narrow the floating MapKey (spec §5). `chat.reject(listingId, name)` is ready for a "Not this one" button in OutsidePanel/OutsideRow if wanted.

## Open / not done
- Undo history ("restores the previous search's homes, pins and map view") lives server-side: the hook sends `undo` and re-reads via `onChanged`; no client-side history of homes is kept.
- The Next dev-tools "N" badge sits bottom-left in dev screenshots; not part of the UI.
- `test-results/` is not gitignored; screenshots were left uncommitted.
