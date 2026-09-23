import { BLOCK_ID } from '../world/defaultBlocks';
import { ITEM_ID } from '../world/ItemRegistry';

export interface MobDefinition {
  readonly type: 'mossling' | 'cinder';
  readonly displayName: string;
  readonly maxHealth: number;
  readonly attackDamage: number;
  readonly moveSpeed: number;
  readonly dropItemId: number;
}

export const MOB_DEFINITIONS: readonly MobDefinition[] = Object.freeze([
  Object.freeze({
    type: 'mossling',
    displayName: 'Mossling',
    maxHealth: 8,
    attackDamage: 2,
    moveSpeed: 1.25,
    dropItemId: ITEM_ID['berries'] ?? 0,
  }),
  Object.freeze({
    type: 'cinder',
    displayName: 'Cinder',
    maxHealth: 14,
    attackDamage: 3,
    moveSpeed: 0.95,
    dropItemId: BLOCK_ID['coal_ore'] ?? 0,
  }),
]);

export const MOB_DEFINITION_BY_TYPE = new Map(
  MOB_DEFINITIONS.map((definition) => [definition.type, definition]),
);
