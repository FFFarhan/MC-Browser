export type ToolClass = 'none' | 'axe' | 'pickaxe' | 'shovel';
export type ToolTier = 'hand' | 'wood' | 'stone' | 'iron';
export type BlockRenderLayer = 'opaque' | 'cutout' | 'translucent' | 'invisible';
export type BlockCollision = 'solid' | 'none' | 'liquid';

export interface BlockDefinition {
  readonly id: number;
  readonly key: string;
  readonly displayName: string;
  readonly renderLayer: BlockRenderLayer;
  readonly collision: BlockCollision;
  readonly replaceable: boolean;
  readonly hardnessSeconds: number;
  readonly requiredTool: ToolClass | null;
  readonly minimumToolTier: ToolTier;
  readonly emittedLight: number;
  readonly textures: {
    readonly top: string;
    readonly bottom: string;
    readonly side: string;
  };
  readonly dropItem: string | null;
}

const blockKeyPattern = /^[a-z0-9_-]+:[a-z0-9_./-]+$/;

function validateDefinition(definition: BlockDefinition): void {
  if (!Number.isInteger(definition.id) || definition.id < 0 || definition.id > 65_535) {
    throw new RangeError(`Block id must be an unsigned 16-bit integer: ${definition.id}`);
  }
  if (!blockKeyPattern.test(definition.key)) {
    throw new RangeError(`Invalid block key: ${definition.key}`);
  }
  if (!definition.displayName.trim()) {
    throw new RangeError(`Block ${definition.key} needs a display name`);
  }
  if (!Number.isFinite(definition.hardnessSeconds) || definition.hardnessSeconds < 0) {
    throw new RangeError(`Block ${definition.key} has invalid hardness`);
  }
  if (
    !Number.isInteger(definition.emittedLight) ||
    definition.emittedLight < 0 ||
    definition.emittedLight > 15
  ) {
    throw new RangeError(`Block ${definition.key} emitted light must be between 0 and 15`);
  }
  for (const texture of Object.values(definition.textures)) {
    if (!texture.trim()) throw new RangeError(`Block ${definition.key} has an empty texture key`);
  }
}

export class BlockRegistry {
  private readonly byId = new Map<number, BlockDefinition>();
  private readonly byKey = new Map<string, BlockDefinition>();

  constructor(definitions: readonly BlockDefinition[]) {
    if (definitions.length === 0) throw new RangeError('Block registry must define air at id zero');

    for (const definition of definitions) {
      validateDefinition(definition);
      if (this.byId.has(definition.id))
        throw new RangeError(`Duplicate block id: ${definition.id}`);
      if (this.byKey.has(definition.key))
        throw new RangeError(`Duplicate block key: ${definition.key}`);

      const frozen = Object.freeze({
        ...definition,
        textures: Object.freeze({ ...definition.textures }),
      });
      this.byId.set(frozen.id, frozen);
      this.byKey.set(frozen.key, frozen);
    }

    const air = this.byId.get(0);
    if (
      !air ||
      air.key !== 'stonefield:air' ||
      air.collision !== 'none' ||
      air.renderLayer !== 'invisible'
    ) {
      throw new RangeError('Block id zero must be invisible, non-colliding stonefield:air');
    }
  }

  get(id: number): BlockDefinition {
    const definition = this.byId.get(id);
    if (!definition) throw new RangeError(`Unknown block id: ${id}`);
    return definition;
  }

  getByKey(key: string): BlockDefinition {
    const definition = this.byKey.get(key);
    if (!definition) throw new RangeError(`Unknown block key: ${key}`);
    return definition;
  }

  list(): readonly BlockDefinition[] {
    return [...this.byId.values()].sort((left, right) => left.id - right.id);
  }
}
