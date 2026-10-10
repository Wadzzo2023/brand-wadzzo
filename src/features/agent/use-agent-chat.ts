"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";

import type { ActionEdits, ActionStatus, AgentStep } from "~/lib/agent/contract";
import type { AgentMessage } from "~/server/api/routers/agent";
import { api } from "~/utils/api";

import { useStored } from "./use-stored";

/** How often to check on a running answer, so progress steps feel live. */
const POLL_MS = 600;

export type ActionState = { status: ActionStatus; result: { message?: string; pinJobId?: string } | null };

/**
 * The map agent chat for one brand (`creatorId`; omitted = the caller's own):
 * the current conversation, sending, live progress of a running answer, and
 * confirming or cancelling proposals. The last conversation and a still-running
 * answer are remembered per brand, so a reload picks up where it left off.
 */
export function useAgentChat(creatorId?: string) {
  const utils = api.useUtils();
  const key = `wadzzo.agent.${creatorId ?? "me"}`;
  const [conversationId, setConversationId] = useStored(`${key}.conversation`);
  const [jobId, setJobId] = useStored(`${key}.job`);
  const [steps, setSteps] = useState<AgentStep[]>([]);
  const [pendingText, setPendingText] = useState<string | null>(null);
  const [failed, setFailed] = useState<string | null>(null);

  const conversation = api.agent.conversation.useQuery({ creatorId, id: conversationId ?? "" }, { enabled: Boolean(conversationId), retry: false, refetchOnWindowFocus: false });
  // Deleted (or not this person's): behave as a new chat.
  const gone = conversation.error?.data?.code === "NOT_FOUND";
  const activeId = gone ? null : conversationId;

  // ── Live progress of the running answer ────────────────────────────────
  useEffect(() => {
    if (!jobId) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const tick = async () => {
      try {
        const data = await utils.client.agent.poll.query({ jobId });
        if (stopped) return;
        setSteps(data.steps);
        if (data.status === "completed") {
          if (data.message && activeId) {
            const message = data.message;
            utils.agent.conversation.setData({ creatorId, id: activeId }, (old) =>
              old && !old.messages.some((m) => m.id === message.id) ? { ...old, messages: [...old.messages, message] } : old,
            );
            // Fetch the new message's proposals (they start out pending).
            void utils.agent.conversation.invalidate({ creatorId, id: activeId });
          }
          void utils.agent.conversations.invalidate();
          setJobId(null);
          setSteps([]);
        } else if (data.status === "failed" || data.status === "cancelled") {
          setJobId(null);
          setSteps([]);
          setFailed(data.error ?? "The assistant couldn't finish. Please try again.");
        } else {
          timer = setTimeout(() => void tick(), POLL_MS);
        }
      } catch {
        if (stopped) return;
        setJobId(null);
        setSteps([]);
        setFailed("Lost track of the answer. Please ask again.");
      }
    };
    void tick();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [jobId, activeId, creatorId, utils, setJobId]);

  // ── Sending ────────────────────────────────────────────────────────────
  const sendMutation = api.agent.send.useMutation();

  const send = useCallback(
    async (text: string, answer?: { messageId: string; blockId: string; labels: string[] }) => {
      const body = text.trim();
      if (!body || jobId || sendMutation.isPending) return;
      setFailed(null);
      setPendingText(body);
      try {
        const res = await sendMutation.mutateAsync({
          creatorId,
          conversationId: activeId ?? undefined,
          text: body,
          answer,
          timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        });
        const id = res.conversationId;
        utils.agent.conversation.setData({ creatorId, id }, (old) => {
          const messages = (old?.messages ?? []).map((m) =>
            m.id === answer?.messageId
              ? { ...m, blocks: m.blocks.map((b) => (b.kind === "choices" && b.id === answer.blockId ? { ...b, answered: answer.labels } : b)) }
              : m,
          );
          // A refetch that finished meanwhile may already include it.
          const fresh = messages.some((m) => m.id === res.userMessage.id) ? messages : [...messages, res.userMessage];
          return { id, title: old?.title ?? body.slice(0, 80), actions: old?.actions ?? {}, messages: fresh };
        });
        setConversationId(id);
        setSteps([]);
        setJobId(res.jobId);
        void utils.agent.conversations.invalidate();
      } catch (err) {
        setFailed(err instanceof Error ? err.message : "Couldn't send. Please try again.");
      } finally {
        setPendingText(null);
      }
    },
    [creatorId, activeId, jobId, sendMutation, utils, setConversationId, setJobId],
  );

  // ── Proposals ──────────────────────────────────────────────────────────
  const setActionState = useCallback(
    (actionId: string, state: ActionState) => {
      if (!activeId) return;
      utils.agent.conversation.setData({ creatorId, id: activeId }, (old) => (old ? { ...old, actions: { ...old.actions, [actionId]: state } } : old));
    },
    [creatorId, activeId, utils],
  );

  const confirmMutation = api.agent.confirm.useMutation();
  const cancelMutation = api.agent.cancel.useMutation();

  const confirm = useCallback(
    async (actionId: string, edits?: ActionEdits) => {
      try {
        const r = await confirmMutation.mutateAsync({ creatorId, actionId, edits });
        setActionState(actionId, { status: "done", result: { message: r.message, pinJobId: r.pinJobId } });
        toast.success(r.message);
        // Pins, hotspots and events may have changed.
        void utils.maps.pin.invalidate();
        void utils.events.invalidate();
        return true;
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Couldn't complete this change");
        if (activeId) void utils.agent.conversation.invalidate({ creatorId, id: activeId });
        return false;
      }
    },
    [creatorId, activeId, confirmMutation, setActionState, utils],
  );

  const cancel = useCallback(
    async (actionId: string) => {
      try {
        await cancelMutation.mutateAsync({ creatorId, actionId });
        setActionState(actionId, { status: "cancelled", result: null });
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Couldn't cancel");
      }
    },
    [creatorId, cancelMutation, setActionState],
  );

  const newChat = useCallback(() => {
    if (jobId) return;
    setConversationId(null);
    setFailed(null);
  }, [jobId, setConversationId]);

  const messages: AgentMessage[] = useMemo(() => (activeId ? (conversation.data?.messages ?? []) : []), [activeId, conversation.data]);

  return {
    conversationId: activeId,
    messages,
    actions: (activeId ? (conversation.data?.actions ?? {}) : {}) as Record<string, ActionState>,
    loading: Boolean(activeId) && conversation.isPending,
    /** True from send until the answer arrives. */
    working: Boolean(jobId) || sendMutation.isPending,
    pendingText,
    steps,
    failed,
    send,
    confirm,
    cancel,
    confirming: confirmMutation.isPending ? confirmMutation.variables.actionId : undefined,
    cancelling: cancelMutation.isPending ? cancelMutation.variables.actionId : undefined,
    newChat,
    openConversation: setConversationId,
  };
}

export type AgentChatState = ReturnType<typeof useAgentChat>;
