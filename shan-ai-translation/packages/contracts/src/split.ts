import { createHash } from 'node:crypto';

export type DatasetSplitName = 'train' | 'dev' | 'test' | 'na';

export interface ClusterMember {
  id: string;
  documentId: string | null;
  sourceHash: string;
}

class UnionFind {
  private parent = new Map<string, string>();

  add(id: string) {
    if (!this.parent.has(id)) this.parent.set(id, id);
  }

  find(id: string): string {
    const parent = this.parent.get(id);
    if (!parent) throw new Error(`unknown id ${id}`);
    if (parent === id) return id;
    const root = this.find(parent);
    this.parent.set(id, root);
    return root;
  }

  union(a: string, b: string) {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra === rb) return;
    if (ra < rb) this.parent.set(rb, ra);
    else this.parent.set(ra, rb);
  }
}

/** Group items that share a source document or an exact source hash. */
export function clusterKeys(items: ClusterMember[]): Map<string, string> {
  const uf = new UnionFind();
  for (const item of items) uf.add(item.id);
  const byDoc = new Map<string, string[]>();
  const byHash = new Map<string, string[]>();
  for (const item of items) {
    if (item.documentId) {
      const list = byDoc.get(item.documentId) ?? [];
      list.push(item.id);
      byDoc.set(item.documentId, list);
    }
    const hashes = byHash.get(item.sourceHash) ?? [];
    hashes.push(item.id);
    byHash.set(item.sourceHash, hashes);
  }
  for (const group of [...byDoc.values(), ...byHash.values()]) {
    const first = group[0];
    if (!first) continue;
    for (const id of group.slice(1)) uf.union(first, id);
  }
  const members = new Map<string, string[]>();
  for (const item of items) {
    const root = uf.find(item.id);
    const list = members.get(root) ?? [];
    list.push(item.id);
    members.set(root, list);
  }
  const result = new Map<string, string>();
  for (const list of members.values()) {
    list.sort();
    const key = list[0] ?? '';
    for (const id of list) result.set(id, key);
  }
  return result;
}

export function splitForCluster(
  releaseId: string,
  clusterKey: string,
): Exclude<DatasetSplitName, 'na'> {
  const hash = createHash('sha256').update(`${releaseId}:${clusterKey}`).digest();
  const bucket = hash.readUInt32BE(0) % 100;
  if (bucket < 80) return 'train';
  if (bucket < 90) return 'dev';
  return 'test';
}

export function assignSplits(
  releaseId: string,
  items: ClusterMember[],
  enabled: boolean,
): Map<string, DatasetSplitName> {
  const clusters = clusterKeys(items);
  const splits = new Map<string, DatasetSplitName>();
  const clusterSplit = new Map<string, DatasetSplitName>();
  for (const [id, key] of clusters) {
    let split = clusterSplit.get(key);
    if (!split) {
      split = enabled ? splitForCluster(releaseId, key) : 'na';
      clusterSplit.set(key, split);
    }
    splits.set(id, split);
  }
  return splits;
}
