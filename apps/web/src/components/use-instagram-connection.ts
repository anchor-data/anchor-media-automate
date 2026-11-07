"use client";

import { useCallback, useEffect, useState } from "react";
import type { InstagramConnectionStatus } from "@ama/shared";
import { connectInstagram, disconnectInstagram, getInstagramStatus } from "../lib/api";

const DISCONNECTED: InstagramConnectionStatus = { connected: false };

export interface InstagramConnectionState {
  readonly status: InstagramConnectionStatus;
  readonly loading: boolean;
  readonly connect: (accessToken: string, igUserId?: string) => Promise<void>;
  readonly disconnect: () => Promise<void>;
}

/** Instagram link of one account: loads its status and connects with a token / removes the connection. */
export function useInstagramConnection(accountId: string | null, enabled: boolean): InstagramConnectionState {
  const [status, setStatus] = useState<InstagramConnectionStatus>(DISCONNECTED);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!accountId || !enabled) return;
    let cancelled = false;
    setLoading(true);
    getInstagramStatus(accountId)
      .then((res) => {
        if (cancelled) return;
        setStatus(res.item);
      })
      .catch(() => {
        if (!cancelled) setStatus(DISCONNECTED);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [accountId, enabled]);

  const connect = useCallback(
    async (accessToken: string, igUserId?: string) => {
      if (!accountId) return;
      const { item } = await connectInstagram(accountId, accessToken, igUserId);
      setStatus(item);
    },
    [accountId]
  );

  const disconnect = useCallback(async () => {
    if (!accountId) return;
    await disconnectInstagram(accountId);
    setStatus(DISCONNECTED);
  }, [accountId]);

  return { status, loading, connect, disconnect };
}
