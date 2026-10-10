"use client";

import { AlertTriangle, RotateCcw } from "lucide-react";
import { useEffect, useRef } from "react";

import { Button } from "~/components/shadcn/ui/button";
import type { AgentBlock } from "~/lib/agent/contract";
import type { AgentMessage } from "~/server/api/routers/agent";

import { useAgentMap, type AgentMarker } from "./agent-map";
import { ChoicesCard } from "./cards/choices-card";
import { ProposalCard } from "./cards/proposal-card";
import { ReportCard } from "./cards/report-card";
import { AnnouncementsCard, CollectorsCard, EventsCard, HotspotsCard, PinsCard, PlacesCard } from "./cards/result-cards";
import { DoneSteps, LiveSteps } from "./progress-steps";
import type { AgentChatState } from "./use-agent-chat";

/** Markers for a card that has places on the map, else null. */
function markersOf(block: AgentBlock): AgentMarker[] | null {
  switch (block.kind) {
    case "places":
      return block.items.map((p) => ({ id: p.key, lat: p.lat, lng: p.lng, title: p.title, kind: p.kind, muted: p.alreadyPinned }));
    case "pins":
      return block.items.map((p) => ({ id: p.id, lat: p.lat, lng: p.lng, title: p.title, kind: "pin" }));
    case "events":
      return block.items.flatMap((e) => (e.lat != null && e.lng != null ? [{ id: e.id, lat: e.lat, lng: e.lng, title: e.title, kind: "event" as const }] : []));
    case "proposal":
      return block.action.type === "create_pins" ? block.action.items.map((p) => ({ id: p.key, lat: p.lat, lng: p.lng, title: p.title, kind: p.kind })) : null;
    default:
      return null;
  }
}

export function MessageList({ chat, linkable }: { chat: AgentChatState; linkable: boolean }) {
  const end = useRef<HTMLDivElement>(null);
  const show = useAgentMap((s) => s.show);
  const { messages, working, steps, pendingText, failed } = chat;

  // Keep the newest message in view.
  useEffect(() => {
    end.current?.scrollIntoView({ block: "end", behavior: "smooth" });
  }, [messages.length, steps.length, working, pendingText, failed]);

  // Put the newest answer's places on the map.
  const last = messages[messages.length - 1];
  useEffect(() => {
    if (last?.role !== "assistant") return;
    for (const block of [...last.blocks].reverse()) {
      const markers = markersOf(block);
      if (markers?.length) return show(`${last.id}:${block.id}`, markers);
    }
  }, [last, show]);

  const lastUserText = [...messages].reverse().find((m) => m.role === "user")?.text;

  return (
    <div className="space-y-4 px-3 py-4">
      {messages.map((m) => (m.role === "user" ? <UserBubble key={m.id} text={m.text} /> : <Answer key={m.id} message={m} chat={chat} linkable={linkable} />))}
      {pendingText && <UserBubble text={pendingText} />}
      {working && <LiveSteps steps={steps} />}
      {failed && !working && (
        <div className="flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
          <span className="flex-1">{failed}</span>
          {lastUserText && (
            <Button size="sm" variant="ghost" className="-my-1 h-7" onClick={() => void chat.send(lastUserText)}>
              <RotateCcw /> Retry
            </Button>
          )}
        </div>
      )}
      <div ref={end} />
    </div>
  );
}

function UserBubble({ text }: { text: string }) {
  return (
    <div className="flex justify-end">
      <p className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-tr-sm bg-primary px-3 py-2 text-sm text-primary-foreground">{text}</p>
    </div>
  );
}

function Answer({ message, chat, linkable }: { message: AgentMessage; chat: AgentChatState; linkable: boolean }) {
  const isLatest = chat.messages[chat.messages.length - 1]?.id === message.id;
  return (
    <div className="space-y-2">
      <DoneSteps steps={message.steps} />
      {message.text && <p className="whitespace-pre-wrap text-sm leading-relaxed">{message.text}</p>}
      {message.blocks.map((b) => (
        <Block key={b.id} block={b} message={message} chat={chat} linkable={linkable} canAnswer={isLatest && !chat.working} />
      ))}
    </div>
  );
}

function Block({ block, message, chat, linkable, canAnswer }: { block: AgentBlock; message: AgentMessage; chat: AgentChatState; linkable: boolean; canAnswer: boolean }) {
  switch (block.kind) {
    case "choices":
      return (
        <ChoicesCard
          block={block}
          disabled={!canAnswer}
          onAnswer={(labels) => void chat.send(labels.join(", "), { messageId: message.id, blockId: block.id, labels })}
        />
      );
    case "places":
      return <PlacesCard block={block} />;
    case "pins":
      return <PinsCard block={block} linkable={linkable} />;
    case "hotspots":
      return <HotspotsCard block={block} linkable={linkable} />;
    case "events":
      return <EventsCard block={block} linkable={linkable} />;
    case "announcements":
      return <AnnouncementsCard block={block} />;
    case "collectors":
      return <CollectorsCard block={block} />;
    case "report":
      return <ReportCard block={block} />;
    case "proposal":
      return (
        <ProposalCard
          block={block}
          state={chat.actions[block.actionId]}
          busy={chat.confirming === block.actionId}
          cancelling={chat.cancelling === block.actionId}
          onConfirm={(edits) => chat.confirm(block.actionId, edits)}
          onCancel={() => void chat.cancel(block.actionId)}
        />
      );
  }
}
