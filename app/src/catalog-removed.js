// 1.5.205 "Remove" in the Brain catalogue: entries the owner took off this replicant matrix's own list
// (settings.catalogRemoved, catalogue ids). The shipped catalog.json is never changed, so Put back always works.
// A removed entry still shows while its model is here, half downloaded or in a slot, so it can be used and deleted.
// -> { models: what the pages list, removed: [{ id, name, sizeGB }] for the Put back list }
export function splitRemoved(models = [], removedIds = [], inUse = new Set()) {
  const gone = new Set(removedIds || []);
  if (!gone.size) return { models, removed: [] };
  const stays = (m) => !gone.has(m.id) || m.own || ['installed', 'partial'].includes(m.status?.state) || inUse.has(m.id) || (m.ollama && inUse.has(m.ollama));
  return { models: models.filter(stays), removed: models.filter((m) => gone.has(m.id) && !stays(m)).map((m) => ({ id: m.id, name: m.name, sizeGB: m.sizeGB ?? null })) };
}
