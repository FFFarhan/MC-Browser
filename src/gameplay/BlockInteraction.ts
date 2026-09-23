import { DEFAULT_PLAYER_COLLIDER, type PlayerState } from '../player/PlayerState';
import { traceVoxels } from '../physics/VoxelRaycast';
import { playerPositionToWorld } from '../physics/PlayerCollision';
import { MutationBatch, commitMutation, type WorldMutationStore } from '../world/MutationBatch';
import type { BlockRegistry } from '../world/BlockRegistry';
import { DEFAULT_ITEMS } from '../world/ItemRegistry';
import { evaluateMiningTool } from './Equipment';

export interface BlockMiningTarget {
  readonly key: string;
  readonly position: { readonly x: number; readonly y: number; readonly z: number };
  readonly blockId: number;
  readonly hardnessSeconds: number;
  readonly heldItemId: number | null;
  readonly dropAllowed: boolean;
}

export interface InteractionResult {
  readonly changed: boolean;
  readonly position?: { readonly x: number; readonly y: number; readonly z: number };
  readonly usedToolId?: number;
}

export class BlockInteraction {
  constructor(
    private readonly world: WorldMutationStore,
    private readonly registry: BlockRegistry,
    private readonly getPlayer: () => PlayerState,
    private readonly reach = 5,
  ) {
    if (!Number.isFinite(reach) || reach <= 0 || reach > 8)
      throw new RangeError('Block interaction reach must be in (0,8]');
  }
  getMiningTarget(
    selectedItemId: number | null = null,
    creative = false,
  ): BlockMiningTarget | null {
    const target = this.traceTarget()?.block;
    if (!target || target.id === 0) return null;
    const definition = this.registry.get(target.id);
    if (!creative && definition.hardnessSeconds <= 0) return null;
    const heldItemId =
      !creative && selectedItemId !== null && this.world.getItemCount(selectedItemId) > 0
        ? selectedItemId
        : null;
    const tool = evaluateMiningTool(definition, heldItemId);
    const position = { x: target.x, y: target.y, z: target.z };
    return {
      key: `${position.x},${position.y},${position.z}:${definition.key}:${heldItemId ?? 'hand'}`,
      position,
      blockId: target.id,
      hardnessSeconds: definition.hardnessSeconds / tool.speedMultiplier,
      heldItemId,
      dropAllowed: creative ? false : tool.dropAllowed,
    };
  }

  breakTarget(target: BlockMiningTarget, creative = false): InteractionResult {
    if (
      this.world.getBlock(target.position.x, target.position.y, target.position.z) !==
      target.blockId
    )
      return { changed: false };
    const block = this.registry.get(target.blockId);
    if (!creative && block.hardnessSeconds <= 0) return { changed: false };
    const heldItemId =
      target.heldItemId !== null && this.world.getItemCount(target.heldItemId) > 0
        ? target.heldItemId
        : null;
    const tool = evaluateMiningTool(block, heldItemId);
    return this.breakBlock(
      { ...target.position, id: target.blockId },
      creative ? false : tool.dropAllowed,
      creative ? null : heldItemId,
      creative,
    );
  }

  interact(selectedBlockId: number, creative = false): InteractionResult {
    const hit = this.traceTarget();
    if (!hit) return { changed: false };
    return this.placeBlock(hit.previous, selectedBlockId, creative);
  }

  getPlacementTarget(
    selectedBlockId: number,
    creative = false,
  ): { readonly x: number; readonly y: number; readonly z: number } | null {
    if (selectedBlockId === 0 || (!creative && this.world.getItemCount(selectedBlockId) <= 0))
      return null;
    return this.traceTarget()?.previous ?? null;
  }

  private traceTarget() {
    const player = this.getPlayer();
    const worldPosition = playerPositionToWorld(player.position);
    const eyeY = worldPosition.y + (player.crouching ? 1.35 : 1.62);
    const cosPitch = Math.cos(player.pitch);
    const hit = traceVoxels(
      { x: worldPosition.x, y: eyeY, z: worldPosition.z },
      {
        x: -Math.sin(player.yaw) * cosPitch,
        y: Math.sin(player.pitch),
        z: -Math.cos(player.yaw) * cosPitch,
      },
      this.reach,
      (x, y, z) => this.world.getBlock(x, y, z),
    );
    return hit;
  }
  private breakBlock(
    target: {
      readonly x: number;
      readonly y: number;
      readonly z: number;
      readonly id: number;
    },
    dropAllowed: boolean,
    heldItemId: number | null,
    creative = false,
  ): InteractionResult {
    if (target.id === 0) return { changed: false };
    const block = this.registry.get(target.id);
    if (block.hardnessSeconds <= 0 && !creative) return { changed: false };
    const batch = new MutationBatch(this.world.revision).changeBlock(target, target.id, 0);
    if (!creative && dropAllowed && block.dropItem)
      batch.changeItem(this.registry.getByKey(block.dropItem).id, 1);
    const changed = commitMutation(this.world, batch);
    const heldItem = heldItemId === null ? null : DEFAULT_ITEMS.get(heldItemId);
    return {
      changed,
      ...(changed ? { position: target } : {}),
      ...(changed && heldItem?.kind === 'tool' && heldItemId !== null
        ? { usedToolId: heldItemId }
        : {}),
    };
  }
  private placeBlock(
    target: { readonly x: number; readonly y: number; readonly z: number } | null,
    blockId: number,
    creative = false,
  ): InteractionResult {
    if (!target || blockId === 0 || (!creative && this.world.getItemCount(blockId) <= 0))
      return { changed: false };
    const block = this.registry.get(blockId);
    if (block.renderLayer === 'invisible' || target.y < 0 || target.y >= 192)
      return { changed: false };
    const before = this.world.getBlock(target.x, target.y, target.z);
    if (
      before === null ||
      (before !== 0 && !this.registry.get(before).replaceable) ||
      overlapsPlayer(target, this.getPlayer())
    )
      return { changed: false };
    const batch = new MutationBatch(this.world.revision).changeBlock(target, before, blockId);
    if (!creative) batch.changeItem(blockId, -1);
    const changed = commitMutation(this.world, batch);
    return { changed, ...(changed ? { position: target } : {}) };
  }
}

function overlapsPlayer(
  block: { readonly x: number; readonly y: number; readonly z: number },
  player: PlayerState,
): boolean {
  const position = playerPositionToWorld(player.position);
  const height = player.crouching
    ? DEFAULT_PLAYER_COLLIDER.crouchingHeight
    : DEFAULT_PLAYER_COLLIDER.standingHeight;
  return (
    position.x + DEFAULT_PLAYER_COLLIDER.radiusX > block.x &&
    position.x - DEFAULT_PLAYER_COLLIDER.radiusX < block.x + 1 &&
    position.y + height > block.y &&
    position.y < block.y + 1 &&
    position.z + DEFAULT_PLAYER_COLLIDER.radiusZ > block.z &&
    position.z - DEFAULT_PLAYER_COLLIDER.radiusZ < block.z + 1
  );
}
