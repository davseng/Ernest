export function planCloudToBoatSync({ localState, remote }) {
  if (!remote || remote.protocolVersion !== 1) {
    return { action: 'unsupported', reason: 'Unsupported or missing sync protocol.' };
  }

  if (!remote.assetId) {
    return { action: 'unsupported', reason: 'Remote sync descriptor is missing assetId.' };
  }

  const localAssetId = localState?.assetId || null;
  if (localAssetId && localAssetId !== remote.assetId) {
    return {
      action: 'reject',
      reason: 'Remote package belongs to a different asset.',
      localAssetId,
      remoteAssetId: remote.assetId,
    };
  }

  const localRevision = localState?.cloudRevision || null;
  const remoteRevision = remote.packageRevision || null;

  if (localRevision && remoteRevision && localRevision === remoteRevision) {
    return {
      action: 'none',
      reason: 'Local Ernest already has the current cloud revision.',
      assetId: remote.assetId,
      revision: remoteRevision,
    };
  }

  return {
    action: 'replace-full-snapshot',
    reason: 'Cloud revision differs from the local revision.',
    assetId: remote.assetId,
    localRevision,
    remoteRevision,
    fullSnapshot: remote.fullSnapshot !== false,
  };
}
