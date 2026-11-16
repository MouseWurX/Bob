// RunPod's v2 API (16 Nov 2026). RunPod retired the old address (rest.runpod.io/v1: "REST API v1 is deprecated and no
// longer available"; its name no longer resolves) and moved to https://api.runpod.io/v2, same Bearer key. Forge was written
// for v1, so this file turns Forge's v1-shaped requests and reads into v2 ones, and v2 answers back into the v1 shape the
// rest of Forge reads (id, costPerHr, machine.gpuTypeId, publicIp, portMappings, desiredStatus). The GraphQL door
// (api.runpod.io/graphql) still answers and Forge keeps using it read-only for where cards and storage are; it can't
// set a container's entrypoint, so pods are rented here.
//
// What changed for Forge:
//   - pods: one card type per request (no gpuTypeIds fallback list), so createPod asks for each wanted card in order
//   - nested body: image, gpu {id, count}, disk (container disk), mounts (persistent OR network), entrypoint + cmd
//   - no supportPublicIp: a pod's tcp ports come back in runtime.ports with their ip
//   - network volumes: /network-volumes, and the data centre field is `dataCenter`
//   - lists come wrapped ({pods: [...]}, {networkVolumes: [...]}); errors are {title, status, detail}
export const V2 = 'https://api.runpod.io/v2';

// a v1-shaped pod create body (what forge.mjs builds) -> the v2 body for one card type
export function podBodyV2(b, gpuId) {
  const out = {
    name: b.name, image: b.imageName, cloud: b.cloudType || 'SECURE',
    gpu: { id: gpuId, count: b.gpuCount || 1 },
    disk: b.containerDiskInGb || 40,
    env: b.env || {}, ports: [].concat(b.ports || [])
  };
  if (b.dockerEntrypoint?.length) out.entrypoint = [].concat(b.dockerEntrypoint);
  if (b.dockerStartCmd?.length) out.cmd = [].concat(b.dockerStartCmd);
  const at = b.volumeMountPath || '/workspace';
  // a network volume and a host disk can't be mixed in v2 (v1 gave both; the network one was the one mounted)
  out.mounts = b.networkVolumeId ? { network: [{ volumeId: b.networkVolumeId, path: at }] } : { persistent: { size: Math.max(10, b.volumeInGb || 20), path: at } };
  if (Array.isArray(b.dataCenterIds) && b.dataCenterIds.length) out.dataCenterIds = b.dataCenterIds;
  return out;
}

// a v2 pod -> the v1 fields Forge reads
export function podV1(p) {
  if (!p || typeof p !== 'object') return p;
  const ports = p.runtime?.ports || [];
  const pm = {}; let ip = null;
  for (const x of ports) if (x && x.public && /tcp/i.test(String(x.type || 'tcp'))) { pm[String(x.private)] = x.public; if (x.ip && !ip) ip = x.ip; }
  return {
    ...p, id: p.id, name: p.name,
    costPerHr: typeof p.cost === 'number' ? p.cost : Number(p.cost?.perHour || p.costPerHr || 0),
    desiredStatus: p.status || p.desiredStatus,
    machine: { gpuTypeId: p.gpu?.id || p.machine?.gpuTypeId || null, dataCenterId: p.dataCenterId || p.machine?.dataCenterId || null },
    machineId: p.machineId || null,
    publicIp: p.publicIp || ip || p.ssh?.direct?.host || null,
    portMappings: Object.keys(pm).length ? pm : (p.portMappings || {})
  };
}

// a v2 list answer ({pods: [...]}, or a bare array) -> the array
export const listOf = (j, key) => Array.isArray(j) ? j : Array.isArray(j?.[key]) ? j[key] : [];
// a v2 network volume -> the fields Forge keeps (dataCenterId as in volume.json)
export const volumeV1 = (v) => v && ({ ...v, dataCenterId: v.dataCenterId || v.dataCenter });
export const volumeBodyV2 = ({ name, size, dataCenterId }) => ({ name, size, dataCenter: dataCenterId });

// Rents one pod: asks for each card type in order (v2 places one type per request) and returns the first pod made, in
// the v1 shape. A 422 (the body breaks the contract) or 401/402/403 stops at once: asking for another card won't help.
// rp(method, path, body) is forge.mjs's caller.
export async function createPod(rp, body, cards) {
  const errs = [];
  for (const g of cards) {
    try { return podV1(await rp('POST', '/pods', podBodyV2(body, g))); }
    catch (e) { errs.push(`${g}: ${String(e.message).slice(0, 160)}`); if (/: (?:401|402|403|413|422) /.test(String(e.message))) break; }
  }
  throw new Error(errs.join(' | ') || 'no card type to ask for');
}
