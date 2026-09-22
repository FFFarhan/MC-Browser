import { DEFAULT_PLAYER_COLLIDER, type PlayerState } from '../player/PlayerState';
import { traceVoxels } from '../physics/VoxelRaycast';
import { playerPositionToWorld } from '../physics/PlayerCollision';
import { MutationBatch, commitMutation, type WorldMutationStore } from '../world/MutationBatch';
import type { BlockRegistry } from '../world/BlockRegistry';

export type InteractionMode = 'break' | 'place';
export interface InteractionResult {
  readonly changed: boolean;
  readonly position?: { readonly x: number; readonly y: number; readonly z: number };
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
  interact(mode: InteractionMode, selectedBlockId: number): InteractionResult {
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
    if (!hit) return { changed: false };
    return mode === 'break'
      ? this.breakBlock(hit.block)
      : this.placeBlock(hit.previous, selectedBlockId);
  }
  private breakBlock(target: {
    readonly x: number;
    readonly y: number;
    readonly z: number;
    readonly id: number;
  }): InteractionResult {
    if (target.id === 0) return { changed: false };
    const block = this.registry.get(target.id);
    if (block.hardnessSeconds <= 0) return { changed: false };
    const batch = new MutationBatch(this.world.revision).changeBlock(target, target.id, 0);
    if (block.dropItem) batch.changeItem(this.registry.getByKey(block.dropItem).id, 1);
    const changed = commitMutation(this.world, batch);
    return { changed, ...(changed ? { position: target } : {}) };
  }
  private placeBlock(
    target: { readonly x: number; readonly y: number; readonly z: number } | null,
    blockId: number,
  ): InteractionResult {
    if (!target || blockId === 0 || this.world.getItemCount(blockId) <= 0)
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
    const batch = new MutationBatch(this.world.revision)
      .changeBlock(target, before, blockId)
      .changeItem(blockId, -1);
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
