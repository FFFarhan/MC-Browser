import * as THREE from 'three';
import { FpsSampler } from '../diagnostics/FpsSampler';
import { FixedStepLoop } from '../engine/FixedStepLoop';
import { BlockInteraction } from '../gameplay/BlockInteraction';
import { craftRecipe } from '../gameplay/Crafting';
import {
  applyDurability,
  createEquipmentState,
  evaluateMiningTool,
  serializeDurability,
  type EquipmentState,
} from '../gameplay/Equipment';
import { MiningProgress } from '../gameplay/MiningProgress';
import { MobSystem } from '../gameplay/MobSystem';
import {
  calculateFallDamage,
  damagePlayer,
  eatFood,
  createSurvivalState,
  tickSurvival,
} from '../gameplay/Survival';
import type { ChunkMeshBuffers, ChunkMeshSnapshot, MeshLayer } from '../meshing/mesh-types';
import { createChunkCollisionWorld } from '../physics/ChunkCollisionWorld';
import {
  findSafeSpawn,
  isPlayerAabbBlocked,
  playerPositionToWorld,
  type CollisionWorld,
  type PlayerPosition,
} from '../physics/PlayerCollision';
import { DEFAULT_PLAYER_COLLIDER } from '../player/PlayerState';
import { PlayerController } from '../player/PlayerController';
import { ChunkView } from '../rendering/ChunkView';
import { MobView } from '../rendering/MobView';
import { RemotePlayerView, type RemotePlayerRecord } from '../rendering/RemotePlayerView';
import { OriginManager } from '../rendering/OriginManager';
import { Renderer } from '../rendering/Renderer';
import { createTextureAtlas } from '../rendering/TextureAtlas';
import { CHUNK_SIZE, worldBlockIndex, worldToChunk } from '../shared/coordinates';
import { chunkKey } from '../shared/chunk-key';
import { createControlsOverlay } from '../ui/ControlsOverlay';
import { HotbarView } from '../ui/HotbarView';
import { InventoryView } from '../ui/InventoryView';
import { DEFAULT_BLOCKS, DEFAULT_BLOCK_DEFINITIONS, BLOCK_ID } from '../world/defaultBlocks';
import {
  DEFAULT_HOTBAR_ITEM_IDS,
  DEFAULT_ITEMS,
  DEFAULT_ITEM_DEFINITIONS,
  ITEM_ID,
} from '../world/ItemRegistry';
import { CHUNK_GENERATOR_VERSION } from '../world/ChunkGenerator';
import { MutationBatch, WorldMutationStore } from '../world/MutationBatch';
import type { WorldSaveWriteResult } from '../world/WorldSave';
import type { WorldSave } from '../world/WorldSave';
import { saveWorld, type WorldStorage } from '../world/WorldCatalog';
import type { WorldSummary } from '../world/WorldCatalog';
import { advanceWorldTime, dayPhase, getDaylight } from '../world/WorldClock';
import type { PreparedChunk } from '../workers/chunkJobs';
import { MAX_PENDING_CHUNK_JOBS } from '../workers/ChunkWorkerClient';
import type { ChunkWorkerClient } from '../workers/ChunkWorkerClient';
import type { ChunkCoord } from '../shared/coordinates';
import { traceVoxels } from '../physics/VoxelRaycast';
import {
  MAX_NETWORK_MESSAGE_BYTES,
  NETWORK_PROTOCOL_VERSION,
  MAX_SNAPSHOT_MUTATIONS,
} from '../network/protocol';
import type {
  NetworkActionRequest,
  NetworkBlockMutation,
  NetworkMessage,
  NetworkPose,
} from '../network/protocol';
import type { PeerSession } from '../network/PeerSession';
import type { PeerSessionEvent } from '../network/PeerSession';

export interface MultiplayerSessionOptions {
  readonly session: PeerSession;
  readonly role: 'host' | 'guest';
  readonly roomId: string;
  readonly localPeerId: string;
  readonly initialRevision?: number;
}

const VISIBLE_CHUNK_RADIUS = 1;
const WORKER_JOB_LIMIT = MAX_PENDING_CHUNK_JOBS - 1;
const DEFAULT_WORLD_TIME = 400;
const CHUNK_LAYERS = ['opaque', 'cutout', 'translucent'] as const;
const DEFAULT_INVENTORY = new Map([
  [BLOCK_ID['dirt'] ?? 0, 32],
  [BLOCK_ID['stone'] ?? 0, 16],
  [BLOCK_ID['oak_planks'] ?? 0, 16],
  [BLOCK_ID['cobblestone'] ?? 0, 16],
  [BLOCK_ID['glass'] ?? 0, 8],
  [BLOCK_ID['torch'] ?? 0, 8],
  [BLOCK_ID['oak_log'] ?? 0, 8],
  [BLOCK_ID['sand'] ?? 0, 16],
  [BLOCK_ID['oak_leaves'] ?? 0, 16],
]);

function applyMesh(view: ChunkView, mesh: ChunkMeshBuffers): void {
  for (const layer of CHUNK_LAYERS) view.update(layer, mesh[layer]);
}

function coordFromKey(key: string): ChunkCoord | null {
  const parts = key.split(',');
  const x = Number(parts[0]);
  const z = Number(parts[1]);
  return Number.isSafeInteger(x) && Number.isSafeInteger(z) ? { x, z } : null;
}

function neighborCoords(coord: ChunkCoord): readonly ChunkCoord[] {
  return [
    { x: coord.x - 1, z: coord.z },
    { x: coord.x + 1, z: coord.z },
    { x: coord.x, z: coord.z - 1 },
    { x: coord.x, z: coord.z + 1 },
  ];
}

export class GameApplication {
  readonly renderer: Renderer;
  private readonly loop: FixedStepLoop;
  private readonly shell: HTMLElement;
  private readonly status: HTMLElement;
  private readonly enterButton: HTMLButtonElement;
  private readonly gameModeButton: HTMLButtonElement;
  private readonly saveNewWorldButton: HTMLButtonElement;
  private readonly worldPickerButton: HTMLButtonElement;
  private readonly respawnButton: HTMLButtonElement;
  private readonly atlas: ReturnType<typeof createTextureAtlas>;
  private readonly materials: Record<MeshLayer, THREE.Material>;
  private readonly player: PlayerController;
  private readonly origin: OriginManager;
  private readonly controls: HTMLElement;
  private readonly hotbar: HotbarView;
  private readonly inventory: InventoryView;
  private readonly worldStore: WorldMutationStore;
  private readonly interaction: BlockInteraction;
  private readonly mobSystem: MobSystem;
  private readonly mobView: MobView;
  private readonly remotePlayerView: RemotePlayerView;
  private readonly sunLight: THREE.DirectionalLight;
  private readonly ambientLight: THREE.HemisphereLight;
  private readonly clockDisplay: HTMLElement;
  private readonly fpsSampler = new FpsSampler();
  private readonly fpsDisplay: HTMLElement;
  private readonly miningIndicator: HTMLElement;
  private readonly miningFill: HTMLElement;
  private readonly miningLabel: HTMLElement;
  private readonly healthMeter: HTMLMeterElement;
  private readonly hungerMeter: HTMLMeterElement;
  private readonly mobCountDisplay: HTMLElement;
  private readonly gameModeDisplay: HTMLElement;
  private readonly flightDisplay: HTMLElement;
  private readonly networkPanel: HTMLElement;
  private readonly networkDetails: HTMLElement;
  private readonly networkRequests: HTMLElement;
  private readonly collisionWorld: CollisionWorld;
  private safeSpawn: PlayerPosition;
  private survivalState = createSurvivalState();
  private readonly mining = new MiningProgress();
  private miningHeld = false;
  private readonly skyDay = new THREE.Color('#9bb9bb');
  private readonly skyNight = new THREE.Color('#111c2b');
  private readonly fogDay = new THREE.Color('#9bb9bb');
  private readonly fogNight = new THREE.Color('#283444');
  private readonly chunks = new Map<string, ChunkMeshSnapshot>();
  private readonly chunkViews = new Map<string, ChunkView>();
  private readonly chunkRevisions = new Map<string, number>();
  private readonly mutationJournal = new Map<string, Map<number, number>>();
  private readonly desiredChunkKeys = new Set<string>();
  private readonly generationQueue: ChunkCoord[] = [];
  private readonly queuedRemeshes = new Set<string>();
  private readonly chunkWorker: ChunkWorkerClient;
  private readonly multiplayer: MultiplayerSessionOptions | null;
  private readonly connectedPeers = new Set<string>();
  private readonly pendingBreaks = new Map<
    string,
    { readonly key: string; readonly startedAt: number }
  >();
  private readonly remotePlayerPoses = new Map<string, NetworkPose>();
  private readonly peerSequences = new Map<string, number>();
  private readonly peerReceivedAt = new Map<string, number>();
  private readonly seed: number | string;
  private readonly worldId: string;
  private readonly worldName: string;
  private readonly worldSave: WorldSave | null;
  private readonly saveStorage: WorldStorage | null;
  private gameMode: WorldSave['gameMode'];
  private survivalHotbarAssignments: readonly (number | null)[];
  private survivalSelectedSlotIndex = 0;
  private equipmentState: EquipmentState;
  private worldTime = DEFAULT_WORLD_TIME;
  private autosaveElapsed = 0;
  private dirty = false;
  private activeWorkerJobs = 0;
  private lastStreamingCenter = '';
  private networkRevision = 0;
  private networkSequence = 0;
  private networkElapsed = 0;
  private hostPeerId: string | null = null;
  private lastRenderOrigin = '';
  private sessionStarted = false;
  private disposed = false;

  constructor(
    private readonly root: HTMLElement,
    initialChunks: readonly PreparedChunk[],
    chunkWorker: ChunkWorkerClient,
    seed: number | string,
    worldSave: WorldSave | null = null,
    saveStorage: WorldStorage | null = null,
    world: WorldSummary = { id: 'world-default', name: 'Quiet Valley', seed },
    private readonly onSaveAndNew: () => void = () => undefined,
    multiplayer: MultiplayerSessionOptions | null = null,
    private readonly onOpenWorldPicker: () => void = () => undefined,
  ) {
    this.chunkWorker = chunkWorker;
    this.multiplayer = multiplayer;
    this.networkRevision = multiplayer?.initialRevision ?? 0;
    this.worldSave = worldSave;
    this.gameMode = this.multiplayer ? 'survival' : (worldSave?.gameMode ?? 'survival');
    this.survivalHotbarAssignments = [...(worldSave?.hotbar ?? DEFAULT_HOTBAR_ITEM_IDS)];
    this.saveStorage = saveStorage;
    this.equipmentState = createEquipmentState(worldSave?.durability ?? []);
    this.seed = worldSave?.seed ?? seed;
    this.worldId = world.id;
    this.worldName = world.name;
    this.worldTime = worldSave?.worldTime ?? DEFAULT_WORLD_TIME;
    this.survivalState = worldSave?.survival ?? createSurvivalState();
    const centerCoord = {
      x: worldSave?.player.chunkX ?? 0,
      z: worldSave?.player.chunkZ ?? 0,
    };
    if (
      !initialChunks.some(
        (chunk) => chunk.coord.x === centerCoord.x && chunk.coord.z === centerCoord.z,
      )
    )
      throw new Error('Starting region is missing the player chunk');
    this.shell = document.createElement('main');
    this.shell.className = 'game-shell';
    this.shell.dataset['state'] = 'ready';

    const viewport = document.createElement('div');
    viewport.className = 'game-viewport';
    this.renderer = new Renderer(viewport);
    this.mobSystem = new MobSystem(this.seed);
    this.mobView = new MobView(this.renderer.scene);
    this.remotePlayerView = new RemotePlayerView(this.renderer.scene);
    this.atlas = createTextureAtlas('stonefield-preview-v1');
    this.materials = {
      opaque: new THREE.MeshLambertMaterial({ map: this.atlas.texture }),
      cutout: new THREE.MeshLambertMaterial({ map: this.atlas.texture, alphaTest: 0.48 }),
      translucent: new THREE.MeshLambertMaterial({
        map: this.atlas.texture,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    };
    this.renderer.scene.background = this.skyDay.clone();
    this.renderer.scene.fog = new THREE.Fog('#9bb9bb', 28, 72);
    this.ambientLight = new THREE.HemisphereLight('#e5f0db', '#554d3b', 2.1);
    this.renderer.scene.add(this.ambientLight);
    this.sunLight = new THREE.DirectionalLight('#fff0cb', 2.4);
    this.sunLight.position.set(-18, 32, 12);
    this.renderer.scene.add(this.sunLight);
    this.clockDisplay = document.createElement('div');
    this.clockDisplay.className = 'world-clock';
    this.clockDisplay.setAttribute('aria-label', 'World time');
    this.fpsDisplay = document.createElement('div');
    this.fpsDisplay.className = 'fps-display';
    this.fpsDisplay.dataset['testid'] = 'fps-counter';
    this.fpsDisplay.setAttribute('role', 'meter');
    this.fpsDisplay.setAttribute('aria-label', 'Frames per second');
    this.fpsDisplay.setAttribute('aria-valuemin', '0');
    this.fpsDisplay.setAttribute('aria-valuemax', '240');
    this.fpsDisplay.setAttribute('aria-valuenow', '0');
    this.fpsDisplay.setAttribute('aria-valuetext', 'Waiting for frame samples');
    this.fpsDisplay.textContent = 'FPS · —';
    this.miningIndicator = document.createElement('div');
    this.miningIndicator.className = 'mining-progress';
    this.miningIndicator.dataset['testid'] = 'mining-progress';
    this.miningIndicator.setAttribute('role', 'progressbar');
    this.miningIndicator.setAttribute('aria-valuemin', '0');
    this.miningIndicator.setAttribute('aria-valuemax', '100');
    this.miningIndicator.setAttribute('aria-valuenow', '0');
    this.miningLabel = document.createElement('span');
    this.miningLabel.className = 'mining-label';
    this.miningFill = document.createElement('span');
    this.miningFill.className = 'mining-fill';
    const miningTrack = document.createElement('span');
    miningTrack.className = 'mining-track';
    miningTrack.append(this.miningFill);
    this.miningIndicator.append(this.miningLabel, miningTrack);
    this.miningIndicator.hidden = true;
    this.updateWorldLighting();
    this.origin = new OriginManager(4);
    this.origin.rebaseIfNeeded(centerCoord);

    const snapshots = initialChunks.map((chunk): ChunkMeshSnapshot => ({
      coord: { ...chunk.coord },
      blocks: chunk.blocks,
      revision: chunk.revision,
      definitions: DEFAULT_BLOCK_DEFINITIONS,
      neighbors: {},
    }));
    for (const mutation of worldSave?.mutations ?? []) {
      const coordinate = worldToChunk(mutation.x, mutation.z);
      const key = chunkKey(coordinate.chunk);
      const index = worldBlockIndex(coordinate.localX, mutation.y, coordinate.localZ);
      const journal = this.mutationJournal.get(key) ?? new Map<number, number>();
      journal.set(index, mutation.blockId);
      this.mutationJournal.set(key, journal);
      const chunk = snapshots.find(
        (entry) => entry.coord.x === coordinate.chunk.x && entry.coord.z === coordinate.chunk.z,
      );
      if (chunk) chunk.blocks[index] = mutation.blockId;
    }
    for (const snapshot of snapshots) this.chunks.set(chunkKey(snapshot.coord), snapshot);
    const centerSnapshot = this.chunks.get(chunkKey(centerCoord));
    if (!centerSnapshot) throw new Error('Could not load the player terrain chunk');
    this.worldStore = new WorldMutationStore(
      centerSnapshot.coord,
      centerSnapshot.blocks,
      DEFAULT_ITEM_DEFINITIONS.map((item) => ({
        id: item.id,
        placeable: item.kind === 'block' && item.id !== 0,
        maxStack: item.maxStack,
      })),
      worldSave
        ? new Map(worldSave.inventory.map(({ itemId, count }) => [itemId, count]))
        : DEFAULT_INVENTORY,
    );
    for (const snapshot of snapshots) {
      const key = chunkKey(snapshot.coord);
      if (key !== chunkKey(centerSnapshot.coord))
        this.worldStore.addChunk(snapshot.coord, snapshot.blocks);
      this.chunkRevisions.set(key, snapshot.revision);
      const view = new ChunkView(this.renderer.scene, this.materials);
      this.chunkViews.set(key, view);
      this.positionChunkView(key, snapshot.coord);
      const prepared = initialChunks.find(
        (chunk) => chunk.coord.x === snapshot.coord.x && chunk.coord.z === snapshot.coord.z,
      );
      if (prepared) applyMesh(view, prepared.mesh);
    }

    this.collisionWorld = createChunkCollisionWorld(this.chunks);
    const fallbackSpawn = findSafeSpawn(
      centerCoord.x * CHUNK_SIZE + 8,
      centerCoord.z * CHUNK_SIZE + 8,
      191,
      DEFAULT_PLAYER_COLLIDER,
      this.collisionWorld,
    );
    this.safeSpawn = fallbackSpawn;
    const savedPosition = worldSave?.player;
    const savedSpawn = savedPosition
      ? {
          chunkX: savedPosition.chunkX,
          chunkZ: savedPosition.chunkZ,
          localX: savedPosition.localX,
          localZ: savedPosition.localZ,
          y: savedPosition.y,
        }
      : null;
    const spawn =
      savedSpawn && !isPlayerAabbBlocked(savedSpawn, DEFAULT_PLAYER_COLLIDER, this.collisionWorld)
        ? savedSpawn
        : fallbackSpawn;
    this.player = new PlayerController(
      this.renderer.canvas,
      this.renderer.camera,
      this.collisionWorld,
      {
        position: spawn,
        velocity: { x: 0, y: 0, z: 0 },
        yaw: savedPosition?.yaw ?? 0,
        pitch: savedPosition?.pitch ?? -0.5,
        grounded: false,
        crouching: false,
        jumpWasDown: false,
      },
      this.pauseGame,
      this.origin,
    );
    this.player.setCreativeMode(this.gameMode === 'creative');
    this.interaction = new BlockInteraction(this.worldStore, DEFAULT_BLOCKS, () =>
      this.player.getState(),
    );
    this.hotbar = new HotbarView(
      this.worldStore,
      () => undefined,
      (itemId) => this.iconForItem(itemId),
      this.gameMode === 'creative' ? DEFAULT_HOTBAR_ITEM_IDS : this.survivalHotbarAssignments,
      (assignments) => {
        if (this.gameMode === 'survival') {
          this.survivalHotbarAssignments = [...assignments];
          this.dirty = true;
        }
      },
    );
    this.hotbar.setCreativeMode(this.gameMode === 'creative');
    this.inventory = new InventoryView(
      this.worldStore,
      (recipeId) => {
        if (this.multiplayer?.role === 'guest') return false;
        const crafted = craftRecipe(this.worldStore, recipeId);
        if (crafted) {
          this.dirty = true;
          this.hotbar.refresh();
          this.status.textContent = 'Crafted. Your new item is in the backpack.';
          this.broadcastInventoryDelta();
        }
        return crafted;
      },
      (open) => {
        if (open) {
          this.cancelMining();
          this.player.suspendControlsForUi();
        } else if (this.sessionStarted && this.shell.dataset['state'] === 'playing') {
          this.player.resumeControlsFromUi();
          try {
            const request = this.renderer.canvas.requestPointerLock();
            if (request instanceof Promise)
              void request.catch(() => this.player.activateFallbackControls());
          } catch {
            this.player.activateFallbackControls();
          }
        }
        this.hotbar.setEnabled(this.sessionStarted && !open);
      },
      (itemId) => (this.multiplayer?.role === 'guest' ? false : this.useInventoryItem(itemId)),
      (itemId) =>
        itemId === ITEM_ID['berries'] &&
        this.survivalState.hunger < 20 &&
        this.survivalState.health > 0,
      (itemId) => this.iconForItem(itemId),
      (itemId) => {
        const assigned = this.hotbar.assignItem(this.hotbar.selectedSlotIndex, itemId);
        if (assigned) {
          this.status.textContent =
            this.gameMode === 'creative'
              ? 'Creative block assigned to the selected hotbar slot.'
              : 'Item assigned to the selected hotbar slot.';
        }
        return assigned;
      },
    );
    this.inventory.setCreativeMode(this.gameMode === 'creative');
    this.renderer.canvas.addEventListener('mousedown', this.onBlockAction);
    this.renderer.canvas.addEventListener('contextmenu', this.onContextMenu);
    this.renderer.canvas.addEventListener('wheel', this.onHotbarWheel, { passive: false });
    document.addEventListener('mouseup', this.onPointerRelease);
    this.renderer.render();

    const panel = document.createElement('section');
    panel.className = 'welcome-panel';
    panel.setAttribute('aria-labelledby', 'game-title');
    const eyebrow = document.createElement('p');
    eyebrow.className = 'eyebrow';
    eyebrow.textContent = `Seed · ${String(seed)}`;
    const title = document.createElement('h1');
    title.id = 'game-title';
    title.textContent = 'Stonefield';
    const description = document.createElement('p');
    description.className = 'welcome-copy';
    description.textContent = 'Gather, build, and find your way through a quiet wild world.';
    this.enterButton = document.createElement('button');
    this.enterButton.type = 'button';
    this.enterButton.className = 'primary-button';
    this.enterButton.textContent = 'Enter world';
    this.enterButton.addEventListener('click', this.enterWorld);
    this.saveNewWorldButton = document.createElement('button');
    this.saveNewWorldButton.type = 'button';
    this.saveNewWorldButton.className = 'secondary-button save-new-world';
    this.saveNewWorldButton.textContent = 'Save & New World';
    this.saveNewWorldButton.addEventListener('click', this.onSaveAndCreateWorld);
    this.worldPickerButton = document.createElement('button');
    this.worldPickerButton.type = 'button';
    this.worldPickerButton.className = 'text-button world-picker-button';
    this.worldPickerButton.textContent = 'Worlds & online play';
    this.worldPickerButton.addEventListener('click', this.onOpenWorlds);
    this.gameModeButton = document.createElement('button');
    this.gameModeButton.type = 'button';
    this.gameModeButton.className = 'secondary-button game-mode-toggle';
    this.gameModeButton.addEventListener('click', this.toggleGameMode);
    this.updateGameModeButton();
    this.respawnButton = document.createElement('button');
    this.respawnButton.type = 'button';
    this.respawnButton.className = 'primary-button respawn-button';
    this.respawnButton.textContent = 'Respawn';
    this.respawnButton.hidden = true;
    this.respawnButton.addEventListener('click', this.onRespawn);
    this.status = document.createElement('p');
    this.status.className = 'status-line';
    this.status.setAttribute('role', 'status');
    this.status.textContent = 'World ready · WASD to move';
    this.networkPanel = document.createElement('aside');
    this.networkPanel.className = 'network-panel';
    this.networkPanel.setAttribute('aria-label', 'Multiplayer session');
    this.networkDetails = document.createElement('div');
    this.networkDetails.className = 'network-details';
    this.networkRequests = document.createElement('div');
    this.networkRequests.className = 'network-requests';
    this.networkPanel.append(this.networkDetails, this.networkRequests);
    this.networkPanel.hidden = !this.multiplayer;
    if (this.multiplayer?.role === 'guest') {
      this.saveNewWorldButton.textContent = 'Leave shared world';
      this.networkDetails.textContent = `Online world · ${this.multiplayer.roomId.toUpperCase()}`;
    } else if (this.multiplayer?.role === 'host') {
      this.networkDetails.textContent = 'Starting invite-only room…';
    }
    this.healthMeter = document.createElement('meter');
    this.healthMeter.min = 0;
    this.healthMeter.max = 20;
    this.healthMeter.setAttribute('aria-label', 'Health');
    this.hungerMeter = document.createElement('meter');
    this.hungerMeter.min = 0;
    this.hungerMeter.max = 20;
    this.hungerMeter.setAttribute('aria-label', 'Hunger');
    const survivalHud = document.createElement('aside');
    survivalHud.className = 'survival-hud';
    survivalHud.setAttribute('aria-label', 'Survival status');
    const healthRow = document.createElement('label');
    healthRow.append(document.createTextNode('Health'), this.healthMeter);
    const hungerRow = document.createElement('label');
    hungerRow.append(document.createTextNode('Hunger'), this.hungerMeter);
    this.mobCountDisplay = document.createElement('p');
    this.mobCountDisplay.className = 'mob-count';
    this.mobCountDisplay.dataset['testid'] = 'mob-count';
    this.mobCountDisplay.textContent = 'Creatures · 0';
    this.gameModeDisplay = document.createElement('p');
    this.gameModeDisplay.className = 'game-mode-indicator';
    this.gameModeDisplay.dataset['testid'] = 'game-mode-indicator';
    this.flightDisplay = document.createElement('p');
    this.flightDisplay.className = 'flight-indicator';
    this.flightDisplay.dataset['testid'] = 'flight-indicator';
    this.updateGameModeHud();
    survivalHud.append(healthRow, hungerRow, this.gameModeDisplay, this.flightDisplay);
    survivalHud.append(this.mobCountDisplay);
    this.updateSurvivalHud();
    this.controls = createControlsOverlay();
    panel.append(
      eyebrow,
      title,
      description,
      this.enterButton,
      this.saveNewWorldButton,
      this.worldPickerButton,
      this.gameModeButton,
      this.respawnButton,
      this.status,
    );
    this.shell.append(
      viewport,
      panel,
      this.clockDisplay,
      this.fpsDisplay,
      survivalHud,
      this.networkPanel,
      this.controls,
      this.hotbar.element,
      this.inventory.element,
      this.miningIndicator,
    );
    this.root.replaceChildren(this.shell);
    if (this.survivalState.health <= 0) {
      this.shell.dataset['state'] = 'dead';
      this.enterButton.hidden = true;
      this.respawnButton.hidden = false;
      this.status.textContent = 'You were lost in the wild. Respawn to try again.';
    }

    this.loop = new FixedStepLoop((dt) => {
      if (this.sessionStarted && !this.inventory.isOpen && this.survivalState.health > 0)
        this.updatePlayerAndSurvival(dt);
      if (this.sessionStarted && !this.inventory.isOpen && this.survivalState.health > 0)
        this.updateMobs(dt);
      if (this.survivalState.health <= 0) {
        this.renderer.render();
        return;
      }
      this.updateStreaming();
      this.updateRenderOrigin();
      if (this.sessionStarted && !this.inventory.isOpen) this.updateMining(dt);
      if (this.sessionStarted && this.multiplayer) this.updateNetwork(dt);
      this.updatePlayerStatus();
      this.updateGameModeHud();
      if (this.sessionStarted && !this.inventory.isOpen) {
        this.worldTime = advanceWorldTime(this.worldTime, dt);
        this.dirty = true;
        this.autosaveElapsed += dt;
        if (this.autosaveElapsed >= 30) {
          this.autosaveElapsed = 0;
          this.persistWorld();
        }
        this.updateWorldLighting();
      }
      this.renderer.render();
    });
    this.loop.setFrameObserver(this.onRenderFrame);
    this.loop.start();
    this.updateStreaming();
    document.addEventListener('visibilitychange', this.onVisibilityChange);
    document.addEventListener('pointerlockchange', this.onPointerLockChange);
    document.addEventListener('keydown', this.onMobAttack);
    document.addEventListener('keydown', this.onGameModeShortcut);
    this.renderer.canvas.addEventListener('webglcontextlost', this.onContextLost);
    this.renderer.canvas.addEventListener('webglcontextrestored', this.onContextRestored);
    for (const key of this.mutationJournal.keys()) {
      const coord = coordFromKey(key);
      if (coord) {
        this.enqueueRemesh(coord);
        for (const neighbor of neighborCoords(coord)) this.enqueueRemesh(neighbor);
      }
    }
    this.pumpWorkerJobs();
    window.addEventListener('beforeunload', this.onBeforeUnload);
  }

  handleNetworkEvent(event: PeerSessionEvent): void {
    if (this.disposed || !this.multiplayer) return;
    switch (event.type) {
      case 'room-created':
        this.hostPeerId = event.peerId;
        this.networkDetails.replaceChildren();
        this.networkDetails.append(document.createTextNode(`Invite code · ${event.roomCode} `));
        {
          const copy = document.createElement('button');
          copy.type = 'button';
          copy.className = 'secondary-button copy-invite';
          copy.textContent = 'Copy';
          copy.setAttribute('aria-label', 'Copy invite code');
          copy.addEventListener('click', () => {
            void navigator.clipboard?.writeText(event.roomCode).then(
              () => (this.status.textContent = 'Invite code copied.'),
              () => (this.status.textContent = 'Copy failed; select the invite code above.'),
            );
          });
          this.networkDetails.append(copy);
        }
        this.status.textContent = 'Share the invite code. Players must be approved to join.';
        return;
      case 'waiting':
        this.networkDetails.textContent = `Waiting for host approval · ${event.roomCode}`;
        return;
      case 'join-request':
        if (this.multiplayer.role !== 'host') return;
        this.renderJoinRequest(event.peerId);
        return;
      case 'peer-approved':
        if (this.multiplayer.role === 'guest') this.hostPeerId = event.peerId;
        this.status.textContent = 'Player approved. Connecting…';
        return;
      case 'connected':
        this.connectedPeers.add(event.peerId);
        this.status.textContent = `Online · ${this.connectedPeers.size} guest${this.connectedPeers.size === 1 ? '' : 's'} connected`;
        if (this.multiplayer.role === 'guest') this.sendGuestHello(event.peerId);
        return;
      case 'disconnected':
        this.connectedPeers.delete(event.peerId);
        this.remotePlayerPoses.delete(event.peerId);
        this.peerSequences.delete(event.peerId);
        this.peerReceivedAt.delete(event.peerId);
        this.pendingBreaks.delete(event.peerId);
        this.updateRemotePlayerView();
        this.status.textContent = 'A player disconnected.';
        return;
      case 'message':
        this.handleNetworkMessage(event.peerId, event.message);
        return;
      case 'rejected':
        this.status.textContent = event.reason;
        return;
      case 'error':
        this.status.textContent = `Multiplayer · ${event.message}`;
    }
  }

  pause(): void {
    this.cancelMining();
    this.persistWorld();
    this.fpsSampler.reset();
    this.fpsDisplay.textContent = 'FPS · —';
    this.fpsDisplay.setAttribute('aria-valuenow', '0');
    this.fpsDisplay.setAttribute('aria-valuetext', 'Frame rate paused');
    this.hotbar.setEnabled(false);
    this.loop.pause();
    if (document.pointerLockElement) document.exitPointerLock();
  }

  resume(): void {
    this.hotbar.setEnabled(
      this.sessionStarted &&
        !this.inventory.isOpen &&
        this.shell.dataset['state'] === 'playing' &&
        this.survivalState.health > 0,
    );
    this.loop.resume();
  }

  dispose(): void {
    if (this.disposed) return;
    this.persistWorld();
    this.disposed = true;
    this.multiplayer?.session.close();
    this.pause();
    this.loop.dispose();
    document.removeEventListener('visibilitychange', this.onVisibilityChange);
    document.removeEventListener('pointerlockchange', this.onPointerLockChange);
    document.removeEventListener('keydown', this.onMobAttack);
    document.removeEventListener('keydown', this.onGameModeShortcut);
    document.removeEventListener('mouseup', this.onPointerRelease);
    window.removeEventListener('beforeunload', this.onBeforeUnload);
    this.renderer.canvas.removeEventListener('webglcontextlost', this.onContextLost);
    this.renderer.canvas.removeEventListener('webglcontextrestored', this.onContextRestored);
    this.enterButton.removeEventListener('click', this.enterWorld);
    this.saveNewWorldButton.removeEventListener('click', this.onSaveAndCreateWorld);
    this.worldPickerButton.removeEventListener('click', this.onOpenWorlds);
    this.gameModeButton.removeEventListener('click', this.toggleGameMode);
    this.respawnButton.removeEventListener('click', this.onRespawn);
    this.renderer.canvas.removeEventListener('mousedown', this.onBlockAction);
    this.renderer.canvas.removeEventListener('contextmenu', this.onContextMenu);
    this.renderer.canvas.removeEventListener('wheel', this.onHotbarWheel);
    this.hotbar.dispose();
    this.inventory.dispose();
    this.mobView.dispose();
    this.remotePlayerView.dispose();
    this.player.dispose();
    for (const view of this.chunkViews.values()) view.dispose();
    this.chunkViews.clear();
    this.chunkWorker.dispose();
    for (const material of Object.values(this.materials)) material.dispose();
    this.atlas.texture.dispose();
    this.renderer.dispose();
    this.shell.remove();
  }

  private readonly enterWorld = (): void => {
    if (this.survivalState.health <= 0) return;
    try {
      this.sessionStarted = true;
      this.shell.dataset['state'] = 'playing';
      this.enterButton.textContent = 'Resume world';
      this.hotbar.setEnabled(true);
      this.inventory.setEnabled(true);
      this.renderer.canvas.focus();
      const request = this.renderer.canvas.requestPointerLock();
      if (request instanceof Promise) {
        void request.catch(() => {
          this.player.activateFallbackControls();
          this.hotbar.setEnabled(true);
          this.inventory.setEnabled(true);
          this.resume();
        });
      }
    } catch {
      this.player.activateFallbackControls();
      this.hotbar.setEnabled(true);
      this.inventory.setEnabled(true);
      this.resume();
    }
  };

  private readonly onVisibilityChange = (): void => {
    if (document.hidden) this.pause();
    else this.resume();
  };

  private readonly onPointerLockChange = (): void => {
    if (document.pointerLockElement === this.renderer.canvas) {
      this.enterButton.textContent = 'Resume world';
      this.resume();
    }
  };

  private readonly pauseGame = (): void => {
    if (this.disposed || this.survivalState.health <= 0) return;
    this.shell.dataset['state'] = 'paused';
    this.player.deactivateControls();
    this.hotbar.setEnabled(false);
    this.inventory.setEnabled(false);
    this.pause();
    this.enterButton.textContent = 'Resume world';
    this.status.textContent = 'Paused. Select Resume world to continue.';
    this.lastStatusCell = '';
  };

  private updateStreaming(): void {
    const position = this.player.getState().position;
    const centers = [
      { x: position.chunkX, z: position.chunkZ },
      ...[...this.remotePlayerPoses.values()].map((pose) => ({
        x: Math.floor(pose.x / CHUNK_SIZE),
        z: Math.floor(pose.z / CHUNK_SIZE),
      })),
    ];
    const uniqueCenters = [
      ...new Map(centers.map((center) => [chunkKey(center), center])).values(),
    ];
    const centerKey = uniqueCenters.map(chunkKey).sort().join('|');
    if (centerKey === this.lastStreamingCenter) return;
    const hadPreviousCenter = this.lastStreamingCenter !== '';
    this.lastStreamingCenter = centerKey;
    this.desiredChunkKeys.clear();
    for (const center of uniqueCenters)
      for (let dz = -VISIBLE_CHUNK_RADIUS; dz <= VISIBLE_CHUNK_RADIUS; dz += 1)
        for (let dx = -VISIBLE_CHUNK_RADIUS; dx <= VISIBLE_CHUNK_RADIUS; dx += 1)
          this.desiredChunkKeys.add(chunkKey({ x: center.x + dx, z: center.z + dz }));

    const unloaded: ChunkCoord[] = [];
    for (const [key, snapshot] of this.chunks) {
      if (this.desiredChunkKeys.has(key)) continue;
      unloaded.push(snapshot.coord);
      this.chunks.delete(key);
      this.chunkRevisions.delete(key);
      this.worldStore.removeChunk(snapshot.coord);
      this.chunkViews.get(key)?.dispose();
      this.chunkViews.delete(key);
    }
    this.generationQueue.splice(
      0,
      this.generationQueue.length,
      ...this.generationQueue.filter((coord) => this.desiredChunkKeys.has(chunkKey(coord))),
    );
    for (const key of this.queuedRemeshes)
      if (!this.chunks.has(key)) this.queuedRemeshes.delete(key);
    for (const key of this.desiredChunkKeys) {
      const coord = coordFromKey(key);
      if (
        coord &&
        !this.chunks.has(key) &&
        !this.generationQueue.some((entry) => chunkKey(entry) === key)
      )
        this.generationQueue.push(coord);
    }
    this.pumpWorkerJobs();
    if (hadPreviousCenter)
      for (const coord of unloaded)
        for (const neighbor of neighborCoords(coord)) this.enqueueRemesh(neighbor);
  }

  private pumpWorkerJobs(): void {
    if (this.disposed) return;
    while (this.activeWorkerJobs < WORKER_JOB_LIMIT && this.queuedRemeshes.size > 0) {
      const key = this.queuedRemeshes.values().next().value as string | undefined;
      if (!key) break;
      this.queuedRemeshes.delete(key);
      const snapshot = this.chunks.get(key);
      if (!snapshot) continue;
      const revision = this.chunkRevisions.get(key) ?? 0;
      const neighbors = this.getNeighborBlocks(snapshot.coord);
      this.activeWorkerJobs += 1;
      void this.chunkWorker
        .rebuildChunk({ ...snapshot, revision, neighbors })
        .then((result) => {
          if (this.chunkRevisions.get(key) !== result.revision) return;
          const view = this.chunkViews.get(key);
          if (view) this.applyBuffers(view, result.mesh);
        })
        .catch((error: unknown) => this.showWorkerError(error))
        .finally(() => {
          this.activeWorkerJobs -= 1;
          this.pumpWorkerJobs();
        });
    }
    while (this.activeWorkerJobs < WORKER_JOB_LIMIT && this.generationQueue.length > 0) {
      const coord = this.generationQueue.shift();
      if (!coord) break;
      const key = chunkKey(coord);
      if (!this.desiredChunkKeys.has(key) || this.chunks.has(key)) continue;
      this.activeWorkerJobs += 1;
      void this.chunkWorker
        .prepareRegion(this.seed, [coord])
        .then((prepared) => {
          if (this.desiredChunkKeys.has(key) && !this.disposed) {
            const chunk = prepared[0];
            if (chunk) this.installPreparedChunk(chunk);
          }
        })
        .catch((error: unknown) => this.showWorkerError(error))
        .finally(() => {
          this.activeWorkerJobs -= 1;
          this.pumpWorkerJobs();
        });
    }
  }

  private installPreparedChunk(prepared: PreparedChunk): void {
    const key = chunkKey(prepared.coord);
    if (this.chunks.has(key)) return;
    const blocks = prepared.blocks;
    const overrides = this.mutationJournal.get(key);
    if (overrides) for (const [index, id] of overrides) blocks[index] = id;
    const snapshot: ChunkMeshSnapshot = {
      coord: { ...prepared.coord },
      blocks,
      revision: 0,
      definitions: DEFAULT_BLOCK_DEFINITIONS,
      neighbors: {},
    };
    this.chunks.set(key, snapshot);
    this.chunkRevisions.set(key, 0);
    this.worldStore.addChunk(prepared.coord, blocks);
    const view = new ChunkView(this.renderer.scene, this.materials);
    this.chunkViews.set(key, view);
    this.positionChunkView(key, prepared.coord);
    if (overrides) this.enqueueRemesh(prepared.coord);
    else this.applyBuffers(view, prepared.mesh);
    for (const neighbor of neighborCoords(prepared.coord)) this.enqueueRemesh(neighbor);
  }

  private getNeighborBlocks(coord: ChunkCoord): ChunkMeshSnapshot['neighbors'] {
    const north = this.chunks.get(chunkKey({ x: coord.x, z: coord.z - 1 }));
    const south = this.chunks.get(chunkKey({ x: coord.x, z: coord.z + 1 }));
    const east = this.chunks.get(chunkKey({ x: coord.x + 1, z: coord.z }));
    const west = this.chunks.get(chunkKey({ x: coord.x - 1, z: coord.z }));
    return {
      ...(north ? { north: north.blocks } : {}),
      ...(south ? { south: south.blocks } : {}),
      ...(east ? { east: east.blocks } : {}),
      ...(west ? { west: west.blocks } : {}),
    };
  }

  private enqueueRemesh(coord: ChunkCoord): void {
    const key = chunkKey(coord);
    if (this.chunks.has(key)) this.queuedRemeshes.add(key);
  }

  private applyBuffers(view: ChunkView, buffers: PreparedChunk['mesh']): void {
    for (const layer of CHUNK_LAYERS) view.update(layer, buffers[layer]);
  }

  private positionChunkView(key: string, coord: ChunkCoord): void {
    const origin = this.origin.getOrigin();
    this.chunkViews
      .get(key)
      ?.setChunkOffset((coord.x - origin.x) * CHUNK_SIZE, (coord.z - origin.z) * CHUNK_SIZE);
  }

  private updateRenderOrigin(): void {
    const origin = this.origin.getOrigin();
    const key = chunkKey(origin);
    if (key === this.lastRenderOrigin) return;
    this.lastRenderOrigin = key;
    for (const [chunkKeyValue, snapshot] of this.chunks)
      this.positionChunkView(chunkKeyValue, snapshot.coord);
  }

  private updatePlayerStatus(): void {
    if (!this.sessionStarted || this.survivalState.health <= 0) return;
    const position = this.player.getState().position;
    const cell = `${position.chunkX * CHUNK_SIZE + Math.floor(position.localX)},${Math.floor(position.y)},${position.chunkZ * CHUNK_SIZE + Math.floor(position.localZ)}`;
    if (cell === this.lastStatusCell) return;
    this.lastStatusCell = cell;
    this.dirty = true;
    this.status.textContent = `Exploring · ${cell}`;
  }

  private lastStatusCell = '';

  private updatePlayerAndSurvival(dt: number): void {
    const previous = this.player.getState();
    const previousSurvival = this.survivalState;
    this.player.update(dt);
    const current = this.player.getState();
    const horizontalSpeed = Math.hypot(current.velocity.x, current.velocity.z);
    const activity =
      horizontalSpeed > 5.5 ? 'sprinting' : horizontalSpeed > 0.6 ? 'walking' : 'idle';
    let state = this.survivalState;
    if (this.gameMode === 'survival') {
      state = tickSurvival(this.survivalState, dt, activity);
      if (current.grounded && !previous.grounded)
        state = damagePlayer(state, calculateFallDamage(-previous.velocity.y));
    }
    this.survivalState = state;
    this.updateSurvivalHud();
    if (state.health !== previousSurvival.health || state.hunger !== previousSurvival.hunger)
      this.inventory.refresh();
    if (state.health === 0) this.enterDeath('fall');
  }

  private updateMobs(dt: number): void {
    const player = playerPositionToWorld(this.player.getState().position);
    const tick = this.mobSystem.tick(dt, this.worldTime, player, this.collisionWorld);
    if (tick.playerDamage > 0 && this.gameMode === 'survival') {
      this.survivalState = damagePlayer(this.survivalState, tick.playerDamage);
      this.updateSurvivalHud();
      this.dirty = true;
      if (this.survivalState.health === 0) this.enterDeath('creature');
    }
    const mobs = this.mobSystem.getMobs();
    this.mobView.update(mobs, this.origin.getOrigin());
    this.mobCountDisplay.textContent = `Creatures · ${mobs.length}`;
  }

  private readonly onRenderFrame = (timestampMs: number): void => {
    const framesPerSecond = this.fpsSampler.addFrame(timestampMs);
    if (framesPerSecond !== null) {
      this.fpsDisplay.textContent = `FPS · ${framesPerSecond}`;
      this.fpsDisplay.setAttribute('aria-valuenow', String(framesPerSecond));
      this.fpsDisplay.setAttribute('aria-valuetext', `${framesPerSecond} frames per second`);
    }
  };

  private readonly onHotbarWheel = (event: WheelEvent): void => {
    if (this.hotbar.scrollSelection(event.deltaY)) event.preventDefault();
  };

  private readonly onMobAttack = (event: KeyboardEvent): void => {
    if (
      event.code !== 'KeyF' ||
      event.repeat ||
      !this.sessionStarted ||
      this.inventory.isOpen ||
      this.survivalState.health <= 0
    )
      return;
    event.preventDefault();
    this.performMobAttack();
  };

  private readonly onGameModeShortcut = (event: KeyboardEvent): void => {
    if (event.code !== 'KeyG' || !event.altKey || event.ctrlKey || event.metaKey || event.repeat)
      return;
    const target = event.target;
    if (
      target instanceof HTMLElement &&
      (target.isContentEditable ||
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement)
    )
      return;
    event.preventDefault();
    this.toggleGameMode();
  };

  private readonly toggleGameMode = (): void => {
    if (this.multiplayer) {
      this.status.textContent = 'Creative mode is available in solo worlds only.';
      return;
    }
    if (this.survivalState.health <= 0) return;
    if (this.gameMode === 'survival') {
      this.survivalHotbarAssignments = [...this.hotbar.assignments];
      this.survivalSelectedSlotIndex = this.hotbar.selectedSlotIndex;
      this.gameMode = 'creative';
      this.player.setCreativeMode(true);
      this.hotbar.setCreativeMode(true);
      this.hotbar.setAssignments(DEFAULT_HOTBAR_ITEM_IDS, 0);
      this.inventory.setCreativeMode(true);
      this.status.textContent = 'Creative mode enabled. Alt+G returns to Survival.';
    } else {
      this.gameMode = 'survival';
      this.player.setCreativeMode(false);
      this.hotbar.setCreativeMode(false);
      this.hotbar.setAssignments(this.survivalHotbarAssignments, this.survivalSelectedSlotIndex);
      this.inventory.setCreativeMode(false);
      this.status.textContent = 'Survival mode restored with your saved inventory.';
    }
    this.dirty = true;
    this.updateGameModeButton();
    this.updateGameModeHud();
  };

  private updateGameModeButton(): void {
    this.gameModeButton.textContent = this.multiplayer
      ? 'Creative mode unavailable online'
      : this.gameMode === 'creative'
        ? 'Switch to Survival'
        : 'Switch to Creative';
    this.gameModeButton.disabled = Boolean(this.multiplayer) || this.survivalState.health <= 0;
  }

  private updateGameModeHud(): void {
    this.gameModeDisplay.textContent = this.gameMode === 'creative' ? 'Creative' : 'Survival';
    this.flightDisplay.textContent = `Flight · ${this.player.isFlying ? 'On' : 'Off'}`;
  }

  private performMobAttack(): boolean {
    const itemId = this.hotbar.selectedItemId;
    const player = playerPositionToWorld(this.player.getState().position);
    const attack = this.mobSystem.attackNearest(
      player,
      itemId,
      performance.now(),
      this.equipmentState,
    );
    if (!attack.accepted) {
      if (attack.mobId !== null) this.status.textContent = 'Attack is recharging.';
      else this.status.textContent = 'No creature in reach.';
      return attack.mobId !== null;
    }
    this.equipmentState = attack.equipment;
    this.dirty = true;
    if (attack.weaponBroken && itemId !== null) {
      const consume = new MutationBatch(this.worldStore.revision).changeItem(itemId, -1);
      if (this.worldStore.commit(consume)) {
        this.hotbar.removeItem(itemId);
        this.status.textContent = 'Your weapon broke.';
      }
    }
    if (attack.defeated && attack.dropItemId !== null) {
      const drop = new MutationBatch(this.worldStore.revision).changeItem(attack.dropItemId, 1);
      if (this.worldStore.commit(drop))
        this.status.textContent = 'Creature defeated. It left a drop.';
    } else if (!attack.weaponBroken) {
      this.status.textContent = 'You struck a creature.';
    }
    this.hotbar.refresh();
    this.inventory.refresh();
    const mobs = this.mobSystem.getMobs();
    this.mobView.update(mobs, this.origin.getOrigin());
    this.mobCountDisplay.textContent = `Creatures · ${mobs.length}`;
    return true;
  }

  private updateSurvivalHud(): void {
    this.healthMeter.value = this.survivalState.health;
    this.hungerMeter.value = this.survivalState.hunger;
    this.healthMeter.title = `Health ${this.survivalState.health} of 20`;
    this.hungerMeter.title = `Hunger ${this.survivalState.hunger} of 20`;
  }

  private useInventoryItem(itemId: number): boolean {
    if (
      itemId !== ITEM_ID['berries'] ||
      this.survivalState.hunger >= 20 ||
      this.survivalState.health <= 0
    ) {
      return false;
    }
    const batch = new MutationBatch(this.worldStore.revision).changeItem(itemId, -1);
    if (!this.worldStore.commit(batch)) return false;
    this.survivalState = eatFood(this.survivalState, 4);
    this.dirty = true;
    this.updateSurvivalHud();
    this.status.textContent = 'You ate wild berries and restored hunger.';
    this.broadcastInventoryDelta();
    return true;
  }

  private enterDeath(cause: 'fall' | 'creature'): void {
    if (this.shell.dataset['state'] === 'dead') return;
    this.shell.dataset['state'] = 'dead';
    this.enterButton.hidden = true;
    this.respawnButton.hidden = false;
    this.updateGameModeButton();
    this.hotbar.setEnabled(false);
    this.inventory.setEnabled(false);
    this.player.deactivateControls();
    this.status.textContent =
      cause === 'fall'
        ? 'You fell too far. Respawn to return to the wild.'
        : 'A creature overcame you. Respawn to return to the wild.';
    this.pause();
  }

  private readonly onRespawn = (): void => {
    const position = this.player.getState().position;
    this.safeSpawn = findSafeSpawn(
      position.chunkX * CHUNK_SIZE + 8,
      position.chunkZ * CHUNK_SIZE + 8,
      191,
      DEFAULT_PLAYER_COLLIDER,
      this.collisionWorld,
    );
    this.player.respawn(this.safeSpawn);
    this.player.setCreativeMode(this.gameMode === 'creative');
    this.survivalState = createSurvivalState();
    this.updateSurvivalHud();
    this.updateGameModeButton();
    this.updateGameModeHud();
    this.sessionStarted = true;
    this.shell.dataset['state'] = 'playing';
    this.enterButton.hidden = false;
    this.enterButton.textContent = 'Resume world';
    this.respawnButton.hidden = true;
    this.hotbar.setEnabled(true);
    this.inventory.setEnabled(true);
    this.status.textContent = 'Back on your feet. Watch your step.';
    this.dirty = true;
    this.resume();
  };

  private updateWorldLighting(): void {
    const daylight = getDaylight(this.worldTime);
    const angle = (this.worldTime / 1_200) * Math.PI * 2 - Math.PI / 2;
    this.sunLight.position.set(Math.cos(angle) * 40, Math.sin(angle) * 50, 18);
    this.sunLight.intensity = 0.08 + daylight * 2.3;
    this.ambientLight.intensity = 0.28 + daylight * 1.82;
    const background = this.renderer.scene.background;
    if (background instanceof THREE.Color)
      background.lerpColors(this.skyNight, this.skyDay, daylight);
    if (this.renderer.scene.fog instanceof THREE.Fog)
      this.renderer.scene.fog.color.lerpColors(this.fogNight, this.fogDay, daylight);
    const minutes = Math.floor((this.worldTime / 1_200) * 1_440);
    const hours24 = Math.floor(minutes / 60) % 24;
    const hours12 = hours24 % 12 || 12;
    const clockMinutes = String(minutes % 60).padStart(2, '0');
    this.clockDisplay.textContent = `${dayPhase(this.worldTime)} · ${hours12}:${clockMinutes} ${hours24 < 12 ? 'AM' : 'PM'}`;
  }

  private readonly onBlockAction = (event: MouseEvent): void => {
    if (!this.sessionStarted || this.survivalState.health <= 0 || this.inventory.isOpen) return;
    if (event.button !== 0 && event.button !== 2) return;
    event.preventDefault();
    if (event.button === 0) {
      if (this.performMobAttack()) return;
      this.miningHeld = true;
      return;
    }
    if (this.multiplayer?.role === 'guest') {
      const blockId = this.hotbar.selectedBlockId;
      const position = this.interaction.getPlacementTarget(blockId);
      if (position) this.sendGuestAction({ type: 'place', position, blockId });
      return;
    }
    const result = this.interaction.interact(
      this.hotbar.selectedBlockId,
      this.gameMode === 'creative',
    );
    this.applyInteractionResult(result, 'Block placed.');
  };

  private readonly onPointerRelease = (event: MouseEvent): void => {
    if (event.button === 0) this.cancelMining();
  };

  private updateMining(deltaSeconds: number): void {
    if (!this.miningHeld || this.survivalState.health <= 0) return;
    const creative = this.gameMode === 'creative';
    const target = this.interaction.getMiningTarget(this.hotbar.selectedItemId, creative);
    if (creative) {
      this.mining.cancel();
      this.miningIndicator.hidden = true;
      const result = target ? this.interaction.breakTarget(target, true) : { changed: false };
      if (result.changed) this.applyInteractionResult(result, 'Block collected.');
      return;
    }
    const state = this.mining.advance(target, true, deltaSeconds);
    if (!target || state.progress <= 0) {
      this.miningIndicator.hidden = true;
      return;
    }
    const percent = Math.round(state.progress * 100);
    this.miningIndicator.hidden = false;
    this.miningIndicator.setAttribute('aria-valuenow', String(percent));
    this.miningIndicator.setAttribute(
      'aria-label',
      `Mining ${DEFAULT_BLOCKS.get(target.blockId).displayName}`,
    );
    this.miningLabel.textContent = `${DEFAULT_BLOCKS.get(target.blockId).displayName} · ${percent}%`;
    this.miningFill.style.width = `${percent}%`;
    if (!state.complete) return;
    if (this.multiplayer?.role === 'guest') {
      this.status.textContent = 'Break request sent to the world host…';
      return;
    }
    this.miningHeld = false;
    this.mining.cancel();
    this.miningIndicator.hidden = true;
    const result = this.interaction.breakTarget(target);
    this.applyInteractionResult(result, 'Block collected.');
    if (result.changed && result.usedToolId !== undefined) this.wearTool(result.usedToolId);
  }

  private wearTool(itemId: number): void {
    const wear = applyDurability(this.equipmentState, itemId, 1);
    this.equipmentState = wear.state;
    if (wear.broken) {
      const batch = new MutationBatch(this.worldStore.revision).changeItem(itemId, -1);
      if (this.worldStore.commit(batch)) {
        this.hotbar.removeItem(itemId);
        this.status.textContent = 'Your tool broke.';
      }
    }
    this.dirty = true;
    this.hotbar.refresh();
    this.inventory.refresh();
    this.broadcastInventoryDelta();
  }

  private cancelMining(): void {
    this.miningHeld = false;
    this.mining.cancel();
    this.miningIndicator.hidden = true;
    this.miningIndicator.setAttribute('aria-valuenow', '0');
    this.miningFill.style.width = '0%';
  }

  private applyInteractionResult(
    result: ReturnType<BlockInteraction['interact']> | ReturnType<BlockInteraction['breakTarget']>,
    status: string,
  ): void {
    if (!result.changed || !result.position) return;
    this.dirty = true;
    this.hotbar.refresh();
    this.inventory.refresh();
    const position = result.position;
    const id = this.worldStore.getBlock(position.x, position.y, position.z);
    if (id !== null) {
      this.recordAndRemeshMutation(position, id);
      if (this.multiplayer?.role === 'host')
        this.broadcastWorldDelta([
          { position: { x: position.x, y: position.y, z: position.z }, blockId: id },
        ]);
    }
    this.status.textContent = status;
  }

  private iconForItem(itemId: number): string {
    return this.atlas.icons[DEFAULT_ITEMS.get(itemId).iconKey] ?? '';
  }

  private readonly onContextMenu = (event: MouseEvent): void => event.preventDefault();

  private showWorkerError(error: unknown): void {
    const message = error instanceof Error ? error.message : 'Unknown worker error';
    this.status.textContent = `World update delayed: ${message}`;
  }

  private persistWorld(force = false): WorldSaveWriteResult {
    if (this.multiplayer?.role === 'guest') return { ok: true };
    if (!this.saveStorage) {
      this.showSaveFailure('storage');
      return { ok: false, reason: 'storage' };
    }
    if (!force && !this.dirty) return { ok: true };
    const player = this.player.getState();
    const mutations = [];
    for (const [key, blocks] of this.mutationJournal) {
      const coord = coordFromKey(key);
      if (!coord) continue;
      for (const [index, blockId] of blocks) {
        const localX = index % CHUNK_SIZE;
        const localZ = Math.floor(index / CHUNK_SIZE) % CHUNK_SIZE;
        const y = Math.floor(index / (CHUNK_SIZE * CHUNK_SIZE));
        mutations.push({
          x: coord.x * CHUNK_SIZE + localX,
          y,
          z: coord.z * CHUNK_SIZE + localZ,
          blockId,
        });
      }
    }
    const saved = saveWorld(this.saveStorage, this.worldId, {
      version: 3,
      worldId: this.worldId,
      worldName: this.worldName,
      seed: this.seed,
      worldTime: this.worldTime,
      player: {
        chunkX: player.position.chunkX,
        chunkZ: player.position.chunkZ,
        localX: player.position.localX,
        localZ: player.position.localZ,
        y: player.position.y,
        yaw: player.yaw,
        pitch: player.pitch,
      },
      inventory: this.worldStore.getInventorySnapshot(),
      mutations,
      survival: this.survivalState,
      hotbar: [...this.survivalHotbarAssignments],
      durability: serializeDurability(this.equipmentState),
      gameMode: this.multiplayer ? (this.worldSave?.gameMode ?? 'survival') : this.gameMode,
    });
    if (saved.ok) {
      this.dirty = false;
      return saved;
    }
    this.showSaveFailure(saved.reason);
    return saved;
  }

  private showSaveFailure(reason: 'invalid' | 'too-large' | 'storage'): void {
    this.status.textContent =
      reason === 'too-large'
        ? 'Save failed: this world has outgrown the browser save limit.'
        : reason === 'storage'
          ? 'Save failed: browser storage is full or unavailable.'
          : 'Save failed: world data could not be validated.';
  }

  private readonly onSaveAndCreateWorld = (): void => {
    if (this.multiplayer?.role === 'guest') {
      this.multiplayer.session.close();
      this.onSaveAndNew();
      return;
    }
    const result = this.persistWorld(true);
    if (result.ok) {
      this.multiplayer?.session.close();
      this.onSaveAndNew();
    }
  };

  private readonly onOpenWorlds = (): void => {
    const result = this.persistWorld(true);
    if (!result.ok) return;
    this.multiplayer?.session.close();
    this.onOpenWorldPicker();
  };

  private readonly onBeforeUnload = (): void => {
    this.persistWorld();
  };

  private renderJoinRequest(peerId: string): void {
    if (this.networkRequests.querySelector(`[data-peer-id="${peerId}"]`)) return;
    const row = document.createElement('div');
    row.className = 'network-request';
    row.dataset['peerId'] = peerId;
    const label = document.createElement('span');
    label.textContent = `Player ${peerId.slice(0, 8)} wants to join`;
    const approve = document.createElement('button');
    approve.type = 'button';
    approve.className = 'primary-button approve-peer';
    approve.textContent = 'Approve';
    approve.addEventListener('click', () => {
      this.multiplayer?.session.approvePeer(peerId, true);
      row.remove();
    });
    const reject = document.createElement('button');
    reject.type = 'button';
    reject.className = 'text-button reject-peer';
    reject.textContent = 'Reject';
    reject.addEventListener('click', () => {
      this.multiplayer?.session.approvePeer(peerId, false);
      row.remove();
    });
    row.append(label, approve, reject);
    this.networkRequests.append(row);
    this.status.textContent = 'A player is requesting to join your world.';
  }

  private sendGuestHello(peerId: string): void {
    if (this.multiplayer?.role !== 'guest') return;
    this.multiplayer.session.sendReliable(peerId, {
      protocolVersion: NETWORK_PROTOCOL_VERSION,
      worldId: this.multiplayer.roomId,
      type: 'hello',
      generatorVersion: CHUNK_GENERATOR_VERSION,
      contentVersion: 1,
    });
  }

  private handleNetworkMessage(peerId: string, message: NetworkMessage): void {
    if (!this.multiplayer) return;
    if (message.type === 'hello' && this.multiplayer.role === 'host') {
      const mutations = this.getNetworkMutations();
      const snapshot = {
        protocolVersion: NETWORK_PROTOCOL_VERSION,
        worldId: this.multiplayer.roomId,
        type: 'snapshot' as const,
        seed: this.seed,
        worldTime: this.worldTime,
        revision: this.networkRevision,
        hostPose: this.getNetworkPose(),
        mutations,
        inventory: this.worldStore.getInventorySnapshot(),
      };
      const rejectedReason =
        message.generatorVersion !== CHUNK_GENERATOR_VERSION || message.contentVersion !== 1
          ? 'Your game content version does not match the host.'
          : mutations.length > MAX_SNAPSHOT_MUTATIONS
            ? 'This world has too many edits to send in the current multiplayer version.'
            : new TextEncoder().encode(JSON.stringify(snapshot)).byteLength >
                MAX_NETWORK_MESSAGE_BYTES
              ? 'This world snapshot is too large to send in one safe network packet.'
              : '';
      this.multiplayer.session.sendReliable(peerId, {
        protocolVersion: NETWORK_PROTOCOL_VERSION,
        worldId: this.multiplayer.roomId,
        type: 'accept',
        accepted: !rejectedReason,
        ...(rejectedReason ? { reason: rejectedReason } : {}),
      });
      if (rejectedReason) return;
      this.connectedPeers.add(peerId);
      this.multiplayer.session.sendReliable(peerId, snapshot);
      this.status.textContent = 'World snapshot sent. The guest is joining…';
      return;
    }
    if (message.type === 'accept' && this.multiplayer.role === 'guest') {
      this.status.textContent = message.accepted
        ? 'Host approved. Receiving shared world…'
        : (message.reason ?? 'The host declined the connection.');
      if (!message.accepted) this.multiplayer.session.close();
      return;
    }
    if (message.type === 'input' && this.multiplayer.role === 'host') {
      this.processRemoteInput(peerId, message.sequence, message.pose, message.action);
      return;
    }
    if (message.type === 'player-state' && this.multiplayer.role === 'guest') {
      if (message.peerId === this.multiplayer.localPeerId) return;
      if (this.remotePlayerPoses.size < 3 || this.remotePlayerPoses.has(message.peerId))
        this.remotePlayerPoses.set(message.peerId, message.pose);
      this.updateRemotePlayerView();
      return;
    }
    if (message.type === 'world-delta' && this.multiplayer.role === 'guest') {
      this.applyWorldDelta(message.revision, message.mutations, message.inventory);
    }
  }

  private updateNetwork(dt: number): void {
    if (!this.multiplayer || !this.sessionStarted) return;
    this.networkElapsed += dt;
    if (this.networkElapsed < 0.1) return;
    this.networkElapsed %= 0.1;
    if (this.multiplayer.role === 'guest') {
      const target = this.miningHeld
        ? this.interaction.getMiningTarget(this.hotbar.selectedItemId)
        : null;
      const action: NetworkActionRequest | undefined = target
        ? {
            type: 'break',
            position: target.position,
            ...(target.heldItemId === null ? {} : { heldItemId: target.heldItemId }),
          }
        : undefined;
      this.sendGuestInput(action);
      return;
    }
    if (!this.hostPeerId) return;
    const ownPose: NetworkPose = this.getNetworkPose();
    this.multiplayer.session.broadcastPresence({
      protocolVersion: NETWORK_PROTOCOL_VERSION,
      worldId: this.multiplayer.roomId,
      type: 'player-state',
      peerId: this.hostPeerId,
      sequence: ++this.networkSequence,
      pose: ownPose,
    });
    for (const [peerId, pose] of this.remotePlayerPoses) {
      this.multiplayer.session.broadcastPresence({
        protocolVersion: NETWORK_PROTOCOL_VERSION,
        worldId: this.multiplayer.roomId,
        type: 'player-state',
        peerId,
        sequence: ++this.networkSequence,
        pose,
      });
    }
  }

  private sendGuestInput(action?: NetworkActionRequest): void {
    if (this.multiplayer?.role !== 'guest' || !this.hostPeerId) return;
    this.multiplayer.session.sendReliable(this.hostPeerId, {
      protocolVersion: NETWORK_PROTOCOL_VERSION,
      worldId: this.multiplayer.roomId,
      type: 'input',
      sequence: ++this.networkSequence,
      pose: this.getNetworkPose(),
      ...(action ? { action } : {}),
    });
  }

  private sendGuestAction(action: NetworkActionRequest): void {
    this.sendGuestInput(action);
    this.status.textContent = 'Action sent to the world host…';
  }

  private getNetworkPose(): NetworkPose {
    const player = this.player.getState();
    const position = playerPositionToWorld(player.position);
    return { ...position, yaw: player.yaw, pitch: player.pitch };
  }

  private getNetworkMutations(): NetworkBlockMutation[] {
    const mutations: NetworkBlockMutation[] = [];
    mutationScan: for (const [key, blocks] of this.mutationJournal) {
      const coord = coordFromKey(key);
      if (!coord) continue;
      for (const [index, blockId] of blocks) {
        const localX = index % CHUNK_SIZE;
        const localZ = Math.floor(index / CHUNK_SIZE) % CHUNK_SIZE;
        const y = Math.floor(index / (CHUNK_SIZE * CHUNK_SIZE));
        mutations.push({
          position: {
            x: coord.x * CHUNK_SIZE + localX,
            y,
            z: coord.z * CHUNK_SIZE + localZ,
          },
          blockId,
        });
        if (mutations.length > MAX_SNAPSHOT_MUTATIONS) break mutationScan;
      }
    }
    return mutations;
  }

  private processRemoteInput(
    peerId: string,
    sequence: number,
    pose: NetworkPose,
    action?: NetworkActionRequest,
  ): void {
    const previousSequence = this.peerSequences.get(peerId) ?? -1;
    if (sequence <= previousSequence) return;
    const now = performance.now();
    const previousPose = this.remotePlayerPoses.get(peerId);
    const previousAt = this.peerReceivedAt.get(peerId) ?? now;
    if (previousPose) {
      const elapsed = Math.max(0.05, Math.min(1, (now - previousAt) / 1_000));
      const distance = Math.hypot(pose.x - previousPose.x, pose.z - previousPose.z);
      if (distance > elapsed * 10 + 1.5 || Math.abs(pose.y - previousPose.y) > elapsed * 55 + 2)
        return;
    }
    this.peerSequences.set(peerId, sequence);
    this.peerReceivedAt.set(peerId, now);
    this.remotePlayerPoses.set(peerId, pose);
    this.updateRemotePlayerView();
    if (action?.type === 'break') this.processRemoteBreak(peerId, pose, action, now);
    else {
      this.pendingBreaks.delete(peerId);
      if (action?.type === 'place') this.processRemotePlace(pose, action);
    }
  }

  private processRemoteBreak(
    peerId: string,
    pose: NetworkPose,
    action: Extract<NetworkActionRequest, { type: 'break' }>,
    now: number,
  ): void {
    const hit = this.traceNetworkPose(pose);
    if (!hit || !sameBlockPosition(hit.block, action.position)) {
      this.pendingBreaks.delete(peerId);
      return;
    }
    const definition = DEFAULT_BLOCKS.get(hit.block.id);
    if (definition.hardnessSeconds <= 0) {
      this.pendingBreaks.delete(peerId);
      return;
    }
    const heldItemId = action.heldItemId ?? null;
    const heldItem =
      heldItemId !== null && this.worldStore.getItemCount(heldItemId) > 0 ? heldItemId : null;
    const tool = evaluateMiningTool(definition, heldItem);
    const key = `${hit.block.x},${hit.block.y},${hit.block.z},${heldItem ?? 'hand'}`;
    const current = this.pendingBreaks.get(peerId);
    const pending = current?.key === key ? current : { key, startedAt: now };
    this.pendingBreaks.set(peerId, pending);
    if (now - pending.startedAt < (definition.hardnessSeconds / tool.speedMultiplier) * 1_000)
      return;
    const batch = new MutationBatch(this.worldStore.revision).changeBlock(
      action.position,
      hit.block.id,
      0,
    );
    if (tool.dropAllowed && definition.dropItem)
      batch.changeItem(DEFAULT_ITEMS.getByKey(definition.dropItem).id, 1);
    if (!this.worldStore.commit(batch)) return;
    this.pendingBreaks.delete(peerId);
    this.applyInteractionResult(
      { changed: true, position: action.position },
      'A guest broke a block.',
    );
  }

  private processRemotePlace(
    pose: NetworkPose,
    action: Extract<NetworkActionRequest, { type: 'place' }>,
  ): void {
    const hit = this.traceNetworkPose(pose);
    if (!hit || !hit.previous || !sameBlockPosition(hit.previous, action.position)) return;
    let item;
    try {
      item = DEFAULT_ITEMS.get(action.blockId);
    } catch {
      return;
    }
    if (
      item.kind !== 'block' ||
      action.blockId === 0 ||
      this.worldStore.getItemCount(action.blockId) < 1
    )
      return;
    const definition = DEFAULT_BLOCKS.get(action.blockId);
    const before = this.worldStore.getBlock(
      action.position.x,
      action.position.y,
      action.position.z,
    );
    if (
      before === null ||
      (before !== 0 && !DEFAULT_BLOCKS.get(before).replaceable) ||
      overlapsNetworkPlayer(action.position, pose)
    )
      return;
    const batch = new MutationBatch(this.worldStore.revision)
      .changeBlock(action.position, before, definition.id)
      .changeItem(action.blockId, -1);
    if (!this.worldStore.commit(batch)) return;
    this.applyInteractionResult(
      { changed: true, position: action.position },
      'A guest placed a block.',
    );
  }

  private traceNetworkPose(pose: NetworkPose) {
    const cosPitch = Math.cos(pose.pitch);
    return traceVoxels(
      { x: pose.x, y: pose.y + 1.62, z: pose.z },
      {
        x: -Math.sin(pose.yaw) * cosPitch,
        y: Math.sin(pose.pitch),
        z: -Math.cos(pose.yaw) * cosPitch,
      },
      5,
      (x, y, z) => this.worldStore.getBlock(x, y, z),
    );
  }

  private updateRemotePlayerView(): void {
    const players: RemotePlayerRecord[] = [...this.remotePlayerPoses].map(([peerId, pose]) => ({
      peerId,
      pose,
    }));
    this.remotePlayerView.update(players, this.origin.getOrigin());
  }

  private broadcastInventoryDelta(): void {
    if (this.multiplayer?.role !== 'host' || this.connectedPeers.size === 0) return;
    this.multiplayer.session.broadcastReliable({
      protocolVersion: NETWORK_PROTOCOL_VERSION,
      worldId: this.multiplayer.roomId,
      type: 'world-delta',
      revision: ++this.networkRevision,
      mutations: [],
      inventory: this.worldStore.getInventorySnapshot(),
    });
  }

  private broadcastWorldDelta(mutations: readonly NetworkBlockMutation[]): void {
    if (this.multiplayer?.role !== 'host' || this.connectedPeers.size === 0) return;
    const message: NetworkMessage = {
      protocolVersion: NETWORK_PROTOCOL_VERSION,
      worldId: this.multiplayer.roomId,
      type: 'world-delta',
      revision: ++this.networkRevision,
      mutations,
      inventory: this.worldStore.getInventorySnapshot(),
    };
    this.multiplayer.session.broadcastReliable(message);
  }

  private applyWorldDelta(
    revision: number,
    mutations: readonly NetworkBlockMutation[],
    inventory?: readonly { readonly itemId: number; readonly count: number }[],
  ): void {
    if (!this.multiplayer || revision <= this.networkRevision) return;
    if (revision !== this.networkRevision + 1) {
      this.status.textContent = 'World sync was interrupted. Rejoin the host to resynchronize.';
      return;
    }
    const batch = new MutationBatch(this.worldStore.revision);
    for (const mutation of mutations) {
      const before = this.worldStore.getBlock(
        mutation.position.x,
        mutation.position.y,
        mutation.position.z,
      );
      if (before === null) {
        this.status.textContent = 'World edit arrived outside the loaded area; sync stopped.';
        return;
      }
      try {
        DEFAULT_BLOCKS.get(mutation.blockId);
      } catch {
        this.multiplayer.session.close();
        return;
      }
      if (before !== mutation.blockId)
        batch.changeBlock(mutation.position, before, mutation.blockId);
    }
    if (inventory) {
      const desired = new Map(inventory.map(({ itemId, count }) => [itemId, count]));
      for (const item of inventory) {
        try {
          DEFAULT_ITEMS.get(item.itemId);
        } catch {
          this.multiplayer.session.close();
          return;
        }
      }
      const ids = new Set([
        ...this.worldStore.getInventorySnapshot().map(({ itemId }) => itemId),
        ...desired.keys(),
      ]);
      for (const itemId of ids) {
        const amount = (desired.get(itemId) ?? 0) - this.worldStore.getItemCount(itemId);
        if (amount !== 0) batch.changeItem(itemId, amount);
      }
    }
    if ((batch.blocks.length > 0 || batch.items.length > 0) && !this.worldStore.commit(batch)) {
      this.status.textContent = 'The host sent a world edit this client could not apply.';
      this.multiplayer.session.close();
      return;
    }
    for (const mutation of mutations)
      this.recordAndRemeshMutation(mutation.position, mutation.blockId);
    this.networkRevision = revision;
    this.hotbar.refresh();
    this.inventory.refresh();
    this.status.textContent = 'Shared world updated.';
  }

  private recordAndRemeshMutation(
    position: { readonly x: number; readonly y: number; readonly z: number },
    blockId: number,
  ): void {
    const coordinate = worldToChunk(position.x, position.z);
    const key = chunkKey(coordinate.chunk);
    const index = worldBlockIndex(coordinate.localX, position.y, coordinate.localZ);
    const journal = this.mutationJournal.get(key) ?? new Map<number, number>();
    journal.set(index, blockId);
    this.mutationJournal.set(key, journal);
    for (const coord of [coordinate.chunk, ...neighborCoords(coordinate.chunk)]) {
      const changedKey = chunkKey(coord);
      if (!this.chunks.has(changedKey)) continue;
      this.chunkRevisions.set(changedKey, this.worldStore.revision);
      this.enqueueRemesh(coord);
    }
    this.pumpWorkerJobs();
  }

  private readonly onContextLost = (event: Event): void => {
    event.preventDefault();
    this.pause();
    this.status.textContent = 'Graphics paused while the browser restores the display.';
  };

  private readonly onContextRestored = (): void => {
    this.status.textContent = 'Graphics restored. Select Enter world to continue.';
    this.renderer.render();
  };
}

function sameBlockPosition(
  left: { readonly x: number; readonly y: number; readonly z: number },
  right: { readonly x: number; readonly y: number; readonly z: number },
): boolean {
  return left.x === right.x && left.y === right.y && left.z === right.z;
}

function overlapsNetworkPlayer(
  block: { readonly x: number; readonly y: number; readonly z: number },
  pose: NetworkPose,
): boolean {
  return (
    pose.x + DEFAULT_PLAYER_COLLIDER.radiusX > block.x &&
    pose.x - DEFAULT_PLAYER_COLLIDER.radiusX < block.x + 1 &&
    pose.y + DEFAULT_PLAYER_COLLIDER.standingHeight > block.y &&
    pose.y < block.y + 1 &&
    pose.z + DEFAULT_PLAYER_COLLIDER.radiusZ > block.z &&
    pose.z - DEFAULT_PLAYER_COLLIDER.radiusZ < block.z + 1
  );
}
