import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import { EvidenceBundleSchema, type CaseId, type EvidenceBundle } from './types.js';

export class EvidenceStore {
  constructor(private readonly dataDir: string) {}

  caseDirectory(caseId: CaseId): string {
    return join(this.dataDir, 'cases', caseId);
  }

  async saveEvidence(evidence: EvidenceBundle): Promise<string> {
    const path = join(this.caseDirectory(evidence.case_id), 'evidence.json');
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');
    return path;
  }

  async readEvidence(caseId: CaseId): Promise<EvidenceBundle> {
    const path = join(this.caseDirectory(caseId), 'evidence.json');
    const content = await readFile(path, 'utf8');
    return EvidenceBundleSchema.parse(JSON.parse(content));
  }

  async saveArtifact(caseId: CaseId, name: string, content: string): Promise<string> {
    const path = join(this.caseDirectory(caseId), 'artifacts', name);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, content, 'utf8');
    return path;
  }
}
