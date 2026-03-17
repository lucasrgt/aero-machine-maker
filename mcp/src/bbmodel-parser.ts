/**
 * Blockbench .bbmodel parser — extracts animation data and converts to Aero .anim.json format.
 *
 * Supports: rotation, position, scale channels + interpolation modes + element animators
 *
 * Output format matches Aero_AnimationLoader expectations:
 * {
 *   "format_version": "1.0",
 *   "pivots": { "boneName": [px, py, pz] },
 *   "childMap": { "childElement": "parentBone" },
 *   "animations": {
 *     "clipName": {
 *       "loop": true/false,
 *       "length": seconds,
 *       "bones": {
 *         "boneName": {
 *           "rotation": { "0.0": { "value": [rx,ry,rz], "interp": "linear" }, ... },
 *           "position": { "0.0": { "value": [px,py,pz], "interp": "linear" }, ... },
 *           "scale":    { "0.0": { "value": [sx,sy,sz], "interp": "linear" }, ... }
 *         }
 *       }
 *     }
 *   }
 * }
 */

// -------------------------------------------------------------------------
// Types
// -------------------------------------------------------------------------

export type InterpMode = 'linear' | 'catmullrom' | 'step';

export interface Keyframe {
  value: [number, number, number];
  interp: InterpMode;
}

export interface ParsedClip {
  name: string;
  loop: boolean;
  length: number;
  bones: Record<string, {
    rotation?: Record<string, Keyframe>;
    position?: Record<string, Keyframe>;
    scale?: Record<string, Keyframe>;
  }>;
}

export interface BbmodelParseResult {
  pivots: Record<string, [number, number, number]>;
  childMap: Record<string, string>;
  clips: ParsedClip[];
  boneNames: string[];
}

export interface AeroAnimJson {
  format_version: string;
  pivots: Record<string, [number, number, number]>;
  childMap: Record<string, string>;
  animations: Record<string, {
    loop: boolean;
    length: number;
    bones: Record<string, {
      rotation?: Record<string, Keyframe>;
      position?: Record<string, Keyframe>;
      scale?: Record<string, Keyframe>;
    }>;
  }>;
}

// -------------------------------------------------------------------------
// Parser
// -------------------------------------------------------------------------

export function parseBbmodel(bbmodel: any): BbmodelParseResult {
  const pivots: Record<string, [number, number, number]> = {};
  const childMap: Record<string, string> = {};
  const boneNames: string[] = [];
  const uuidToName = new Map<string, string>();
  const uuidToElementName = new Map<string, string>();

  // Build UUID → group lookup from the separate `groups` array
  const groupByUuid = new Map<string, any>();
  if (Array.isArray(bbmodel.groups)) {
    for (const g of bbmodel.groups) {
      if (g.uuid) {
        groupByUuid.set(g.uuid, g);
        if (g.name) uuidToName.set(g.uuid, g.name);
      }
    }
  }

  if (Array.isArray(bbmodel.elements)) {
    for (const el of bbmodel.elements) {
      if (el.uuid && el.name) {
        uuidToElementName.set(el.uuid, el.name);
      }
    }
  }

  // Fallback: pre-populate uuidToName from animation animators
  if (Array.isArray(bbmodel.animations)) {
    for (const anim of bbmodel.animations) {
      if (anim.animators && typeof anim.animators === 'object') {
        for (const [uuid, animator] of Object.entries(anim.animators as Record<string, any>)) {
          if (animator.name && !uuidToName.has(uuid)) {
            uuidToName.set(uuid, animator.name);
          }
        }
      }
    }
  }

  if (Array.isArray(bbmodel.outliner)) {
    walkOutliner(bbmodel.outliner, null, groupByUuid, uuidToName, uuidToElementName, pivots, childMap, boneNames);
  }

  const clips: ParsedClip[] = [];
  if (Array.isArray(bbmodel.animations)) {
    for (const anim of bbmodel.animations) {
      clips.push(parseAnimation(anim, uuidToName, uuidToElementName));
    }
  }

  return { pivots, childMap, clips, boneNames };
}

export function toAeroAnimJson(result: BbmodelParseResult): AeroAnimJson {
  const animations: AeroAnimJson['animations'] = {};
  for (const clip of result.clips) {
    animations[clip.name] = {
      loop: clip.loop,
      length: clip.length,
      bones: clip.bones,
    };
  }
  return {
    format_version: '1.0',
    pivots: result.pivots,
    childMap: result.childMap,
    animations,
  };
}

// -------------------------------------------------------------------------
// Internals
// -------------------------------------------------------------------------

function walkOutliner(
  entries: any[],
  parentBoneName: string | null,
  groupByUuid: Map<string, any>,
  uuidToName: Map<string, string>,
  uuidToElementName: Map<string, string>,
  pivots: Record<string, [number, number, number]>,
  childMap: Record<string, string>,
  boneNames: string[],
): void {
  for (const entry of entries) {
    if (typeof entry === 'string') {
      if (parentBoneName) {
        const elementName = uuidToElementName.get(entry);
        if (elementName) {
          childMap[elementName] = parentBoneName;
        }
      }
    } else if (typeof entry === 'object' && entry !== null) {
      const uuid = entry.uuid as string | undefined;
      const groupData = uuid ? groupByUuid.get(uuid) : undefined;

      const boneName = groupData?.name || (entry.name as string) || (uuid ? uuidToName.get(uuid) : undefined);
      if (!boneName) continue;

      boneNames.push(boneName);
      if (uuid) uuidToName.set(uuid, boneName);

      if (parentBoneName) {
        childMap[boneName] = parentBoneName;
      }

      const origin = groupData?.origin || entry.origin;
      if (Array.isArray(origin) && origin.length >= 3) {
        pivots[boneName] = [origin[0] as number, origin[1] as number, origin[2] as number];
      }

      if (Array.isArray(entry.children)) {
        walkOutliner(entry.children, boneName, groupByUuid, uuidToName, uuidToElementName, pivots, childMap, boneNames);
      }
    }
  }
}

function resolveInterpMode(kf: any): InterpMode {
  const raw = kf.interpolation as string | undefined;
  if (raw === 'catmullrom') return 'catmullrom';
  if (raw === 'step') return 'step';
  return 'linear';
}

function parseAnimation(
  anim: any,
  uuidToName: Map<string, string>,
  uuidToElementName: Map<string, string>,
): ParsedClip {
  const name = anim.name || 'unnamed';
  const loop = anim.loop === 'loop' || anim.loop === true;
  const length = typeof anim.length === 'number' ? anim.length : 1.0;
  const bones: ParsedClip['bones'] = {};

  if (anim.animators && typeof anim.animators === 'object') {
    for (const [uuid, animator] of Object.entries(anim.animators as Record<string, any>)) {
      const type = (animator as any).type as string | undefined;

      let targetName: string | undefined;
      if (type === 'bone' || !type) {
        targetName = animator.name || uuidToName.get(uuid) || uuid;
      } else if (type === 'element') {
        targetName = uuidToElementName.get(uuid) || animator.name || uuid;
      } else {
        continue;
      }

      if (!targetName) continue;
      if (!bones[targetName]) bones[targetName] = {};

      if (Array.isArray(animator.keyframes)) {
        for (const kf of animator.keyframes) {
          const channel = kf.channel as string;
          if (channel !== 'rotation' && channel !== 'position' && channel !== 'scale') continue;

          const timeStr = String(kf.time);
          const dp = Array.isArray(kf.data_points) && kf.data_points.length > 0
            ? kf.data_points[0] : { x: 0, y: 0, z: 0 };

          const values: [number, number, number] = [
            parseFloat(dp.x) || 0, parseFloat(dp.y) || 0, parseFloat(dp.z) || 0,
          ];
          const interp = resolveInterpMode(kf);

          if (!bones[targetName][channel as 'rotation' | 'position' | 'scale']) {
            bones[targetName][channel as 'rotation' | 'position' | 'scale'] = {};
          }
          bones[targetName][channel as 'rotation' | 'position' | 'scale']![timeStr] = { value: values, interp };
        }
      }
    }
  }

  return { name, loop, length, bones };
}
