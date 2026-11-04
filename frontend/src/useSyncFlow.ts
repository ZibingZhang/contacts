import { useState } from "react";
import {
  fetchContacts,
  fetchTags,
  startSync,
  submitSyncDevice,
  submitSyncCode,
  applySyncReview,
  startPush,
  submitPushDevice,
  submitPushCode,
  applyPushReview,
} from "./api";
import type { Contact, SyncRequiresVerification, SyncReview, SyncResult, TagCount } from "./types";
import type { SyncDirection } from "./components/SyncReviewModal";
import { networkErrorMessage } from "./networkError";

interface SyncApi {
  start: () => Promise<SyncResult>;
  submitDevice: (deviceIndex: number) => Promise<SyncResult>;
  submitCode: (code: string) => Promise<SyncResult>;
  applyReview: (createIcloudIds: string[], updateIcloudIds: string[]) => Promise<SyncResult>;
}

const SYNC_API: Record<SyncDirection, SyncApi> = {
  pull: { start: startSync, submitDevice: submitSyncDevice, submitCode: submitSyncCode, applyReview: applySyncReview },
  push: { start: startPush, submitDevice: submitPushDevice, submitCode: submitPushCode, applyReview: applyPushReview },
};

export interface SyncFlow {
  syncDirection: SyncDirection | null;
  syncing: boolean;
  syncMessage: string | null;
  syncError: string | null;
  syncChallenge: SyncRequiresVerification | null;
  syncReview: SyncReview | null;
  handleStartSync: (direction: SyncDirection) => Promise<void>;
  handleSyncSelectDevice: (deviceIndex: number) => Promise<void>;
  handleSyncSubmitCode: (code: string) => Promise<void>;
  handleSyncCancel: () => void;
  handleSyncReviewApply: (createIcloudIds: string[], updateIcloudIds: string[]) => Promise<void>;
  handleSyncReviewCancel: () => void;
  dismissSyncStatus: () => void;
}

// The iCloud pull/push flow -- device selection, two-factor code, and a
// create/update review step, all of which can short-circuit a `start` or
// `submit*` call at any point. Takes the setters for the data a completed
// sync replaces (contacts, tags) rather than owning that state itself,
// since useAppData already owns it and both pull and push land back on the
// same contacts list.
export function useSyncFlow(setContacts: (contacts: Contact[]) => void, setTags: (tags: TagCount[]) => void): SyncFlow {
  const [syncDirection, setSyncDirection] = useState<SyncDirection | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [syncChallenge, setSyncChallenge] = useState<SyncRequiresVerification | null>(null);
  const [syncReview, setSyncReview] = useState<SyncReview | null>(null);

  async function finishSync(direction: SyncDirection, result: SyncResult) {
    if (result.status === "requires_verification") {
      setSyncChallenge(result);
      return;
    }
    if (result.status === "review") {
      setSyncChallenge(null);
      setSyncReview(result);
      return;
    }
    setSyncChallenge(null);
    setSyncReview(null);
    setSyncing(false);
    const [contactsData, tagsData] = await Promise.all([fetchContacts(), fetchTags()]);
    setContacts(contactsData.objects);
    setTags(tagsData.tags);
    const verb = direction === "pull" ? "Pulled from" : "Pushed to";
    setSyncMessage(
      result.created === 0 && result.updated === 0
        ? "Already up to date with iCloud."
        : `${verb} iCloud: ${result.created} created, ${result.updated} updated.`
    );
  }

  async function handleStartSync(direction: SyncDirection) {
    setSyncDirection(direction);
    setSyncing(true);
    setSyncError(null);
    setSyncMessage(null);
    try {
      await finishSync(direction, await SYNC_API[direction].start());
    } catch (error) {
      setSyncError(networkErrorMessage(error));
      setSyncing(false);
    }
  }

  async function handleSyncSelectDevice(deviceIndex: number) {
    if (!syncDirection) return;
    const result = await SYNC_API[syncDirection].submitDevice(deviceIndex);
    if (result.status === "requires_verification") {
      setSyncChallenge(result);
    }
  }

  async function handleSyncSubmitCode(code: string) {
    if (!syncDirection) return;
    await finishSync(syncDirection, await SYNC_API[syncDirection].submitCode(code));
  }

  function handleSyncCancel() {
    setSyncChallenge(null);
    setSyncing(false);
    setSyncDirection(null);
  }

  async function handleSyncReviewApply(createIcloudIds: string[], updateIcloudIds: string[]) {
    if (!syncDirection) return;
    await finishSync(syncDirection, await SYNC_API[syncDirection].applyReview(createIcloudIds, updateIcloudIds));
  }

  function handleSyncReviewCancel() {
    setSyncReview(null);
    setSyncing(false);
    setSyncDirection(null);
  }

  function dismissSyncStatus() {
    setSyncMessage(null);
    setSyncError(null);
  }

  return {
    syncDirection,
    syncing,
    syncMessage,
    syncError,
    syncChallenge,
    syncReview,
    handleStartSync,
    handleSyncSelectDevice,
    handleSyncSubmitCode,
    handleSyncCancel,
    handleSyncReviewApply,
    handleSyncReviewCancel,
    dismissSyncStatus,
  };
}
