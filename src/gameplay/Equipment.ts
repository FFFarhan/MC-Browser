import type { BlockDefinition, ToolTier } from '../world/BlockRegistry';
import { DEFAULT_ITEMS, type ItemDefinition } from '../world/ItemRegistry';

export interface SavedDurability {
  readonly itemId: number;
  readonly remaining: number;
}

export interface EquipmentState {
  readonly durability: ReadonlyMap<number, number>;
  readonly nextAttackAtMs: number;
}

export interface MiningToolEvaluation {
  readonly speedMultiplier: number;
  readonly dropAllowed: boolean;
}

export interface DurabilityResult {
  readonly state: EquipmentState;
  readonly remaining: number;
  readonly broken: boolean;
}

export interface WeaponAttackResult extends DurabilityResult {
  readonly accepted: boolean;
  readonly damage: number;
}

const TIER_RANK: Readonly<Record<ToolTier, number>> = Object.freeze({
  hand: 0,
  wood: 1,
  stone: 2,
  iron: 3,
});
const WEAPON_COOLDOWN_MS = 500;

function gearItem(itemId: number): ItemDefinition | null {
  try {
    const item = DEFAULT_ITEMS.get(itemId);
    return item.kind === 'tool' || item.kind === 'weapon' ? item : null;
  } catch {
    return null;
  }
}

export function evaluateMiningTool(
  block: BlockDefinition,
  heldItemId: number | null,
): MiningToolEvaluation {
  if (!block.requiredTool)
    return { speedMultiplier: 1, dropAllowed: block.minimumToolTier === 'hand' };
  const heldItem = heldItemId === null ? null : gearItem(heldItemId);
  const matchingTool =
    heldItem?.kind === 'tool' && heldItem.toolClass === block.requiredTool ? heldItem : null;
  const enoughTier = Boolean(
    matchingTool && TIER_RANK[matchingTool.tier ?? 'hand'] >= TIER_RANK[block.minimumToolTier],
  );
  return {
    speedMultiplier: matchingTool?.miningMultiplier ?? 1,
    dropAllowed: block.minimumToolTier === 'hand' || enoughTier,
  };
}

export function createEquipmentState(records: readonly SavedDurability[] = []): EquipmentState {
  const durability = new Map<number, number>();
  for (const record of records) {
    const item = gearItem(record.itemId);
    if (
      !item ||
      !Number.isSafeInteger(record.remaining) ||
      record.remaining < 1 ||
      record.remaining > (item.maxDurability ?? 0) ||
      durability.has(record.itemId)
    )
      throw new RangeError('Saved equipment durability is invalid');
    durability.set(record.itemId, record.remaining);
  }
  return { durability, nextAttackAtMs: 0 };
}

export function getDurability(state: EquipmentState, itemId: number): number {
  const item = gearItem(itemId);
  if (!item) return 0;
  return state.durability.get(itemId) ?? item.maxDurability ?? 0;
}

export function applyDurability(
  state: EquipmentState,
  itemId: number,
  uses: number,
): DurabilityResult {
  if (!Number.isSafeInteger(uses) || uses < 1)
    throw new RangeError('Durability use count must be a positive integer');
  const item = gearItem(itemId);
  if (!item?.maxDurability) throw new RangeError('Only tools and weapons have durability');
  const remaining = getDurability(state, itemId) - uses;
  const durability = new Map(state.durability);
  const broken = remaining <= 0;
  if (broken) durability.delete(itemId);
  else durability.set(itemId, remaining);
  return {
    state: { durability, nextAttackAtMs: state.nextAttackAtMs },
    remaining: Math.max(0, remaining),
    broken,
  };
}

export function attackWithWeapon(
  state: EquipmentState,
  itemId: number,
  nowMs: number,
): WeaponAttackResult {
  if (!Number.isFinite(nowMs) || nowMs < 0)
    throw new RangeError('Attack time must be non-negative');
  const item = gearItem(itemId);
  if (item?.kind !== 'weapon' || getDurability(state, itemId) <= 0) {
    return { state, accepted: false, damage: 0, remaining: 0, broken: false };
  }
  if (nowMs < state.nextAttackAtMs) {
    return {
      state,
      accepted: false,
      damage: 0,
      remaining: getDurability(state, itemId),
      broken: false,
    };
  }
  const wear = applyDurability(state, itemId, 1);
  return {
    ...wear,
    state: { ...wear.state, nextAttackAtMs: nowMs + WEAPON_COOLDOWN_MS },
    accepted: true,
    damage: item.attackDamage ?? 1,
  };
}

export function attackWithMelee(
  state: EquipmentState,
  itemId: number | null,
  nowMs: number,
): WeaponAttackResult {
  const heldItem = itemId === null ? null : gearItem(itemId);
  if (itemId !== null && heldItem?.kind === 'weapon') return attackWithWeapon(state, itemId, nowMs);
  if (!Number.isFinite(nowMs) || nowMs < 0)
    throw new RangeError('Attack time must be non-negative');
  if (nowMs < state.nextAttackAtMs)
    return { state, accepted: false, damage: 0, remaining: 0, broken: false };
  return {
    state: { ...state, nextAttackAtMs: nowMs + WEAPON_COOLDOWN_MS },
    accepted: true,
    damage: 1,
    remaining: 0,
    broken: false,
  };
}

export function serializeDurability(state: EquipmentState): readonly SavedDurability[] {
  return [...state.durability]
    .map(([itemId, remaining]) => ({ itemId, remaining }))
    .sort((left, right) => left.itemId - right.itemId);
}
