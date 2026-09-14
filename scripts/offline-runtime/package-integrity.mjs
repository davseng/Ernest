import { createHash } from 'node:crypto';

function revisionMaterial(pkg) {
  return JSON.stringify({
    snapshot: pkg?.snapshot || null,
    pages: pkg?.localEvidence?.documentPages || [],
    chunks: pkg?.localEvidence?.documentChunks || [],
  });
}

export function computePackageRevision(pkg) {
  return createHash('sha256').update(revisionMaterial(pkg)).digest('hex');
}

export function validatePackageIntegrity(pkg) {
  if (pkg?.offlineFormat !== 'ernest-offline-package') {
    throw new Error('Not an Ernest offline package.');
  }

  const expected = pkg?.sync?.packageRevision || null;
  if (!expected) {
    return { verified: false, reason: 'legacy-package-without-revision' };
  }

  const actual = computePackageRevision(pkg);
  if (actual !== expected) {
    throw new Error('Offline package revision check failed. The package may be incomplete or corrupted.');
  }

  return { verified: true, revision: actual };
}
