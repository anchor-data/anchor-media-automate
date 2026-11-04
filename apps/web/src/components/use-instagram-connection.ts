"use client";

import { useCallback, useEffect, useState } from "react";
import type { InstagramConnectionStatus } from "@ama/shared";
import { disconnectInstagram, getInstagramStatus, startInstagramConnect } from "../lib/api";

const DISCONNECTED: InstagramConnectionStatus = { connected: false };

export interface InstagramConnectionState {
  readonly status: InstagramConnectionStatus;
  /** False when the API has no Meta app credentials, so connecting can't work yet. */
  readonly configured: boolean;
  readonly loading: boolean;
  readonly connect: () => Promise<void>;
  readonly disconnect: () => Promise<void>;
}

/** Instagram link of one account: loads its status and starts / removes the connection. */
export function useInstagramConnection(accountId: string | null, enabled: boolean): InstagramConnectionState {
  const [status, setStatus] = useState<InstagramConnectionStatus>(DISCONNECTED);
  const [configured, setConfigured] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!accountId || !enabled) return;
    let cancelled = false;
    setLoading(true);
    getInstagramStatus(accountId)
      .then((res) => {
        if (cancelled) return;
        setStatus(res.item);
        setConfigured(res.configured);
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

  const connect = useCallback(async () => {
    if (!accountId) return;
    const { url } = await startInstagramConnect(accountId);
    window.location.assign(url);
  }, [accountId]);

  const disconnect = useCallback(async () => {
    if (!accountId) return;
    await disconnectInstagram(accountId);
    setStatus(DISCONNECTED);
  }, [accountId]);

  return { status, configured, loading, connect, disconnect };
}
