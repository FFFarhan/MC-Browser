import { GameError, renderFatalError, renderUnsupportedScreen } from './errors';
import type { GameApplication } from './GameApplication';
import { detectCapabilities, type CapabilityReport } from '../platform/capabilities';
import { ChunkWorkerClient } from '../workers/ChunkWorkerClient';
import type { PreparedChunk } from '../workers/chunkJobs';
import {
  createWorld,
  listWorlds,
  loadWorld,
  type WorldStorage,
  type WorldSummary,
} from '../world/WorldCatalog';
import { WorldSelectionView } from '../ui/WorldSelectionView';
import { getSignalingUrl } from '../network/runtimeConfig';
import { PeerSession } from '../network/PeerSession';
import type { PeerSessionEvent } from '../network/PeerSession';
import type { SnapshotMessage } from '../network/protocol';
import { NETWORK_PROTOCOL_VERSION } from '../network/protocol';
import type { MultiplayerSessionOptions } from './GameApplication';
import type { WorldSave } from '../world/WorldSave';
import { DEFAULT_HOTBAR_ITEM_IDS } from '../world/ItemRegistry';
import { createSurvivalState } from '../gameplay/Survival';
import { CHUNK_GENERATOR_VERSION } from '../world/ChunkGenerator';

export interface ApplicationHandle {
  dispose(): void;
}

class MemoryStorage implements WorldStorage {
  private readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

export async function startApplication(root: HTMLElement): Promise<ApplicationHandle | null> {
  const capabilityReport: CapabilityReport = detectCapabilities();
  if (!capabilityReport.supported) {
    renderUnsupportedScreen(root, capabilityReport);
    return null;
  }

  let storage: WorldStorage;
  try {
    storage = window.localStorage;
  } catch {
    storage = new MemoryStorage();
  }

  let activeApplication: GameApplication | null = null;
  let worldSelection: WorldSelectionView | null = null;
  let disposed = false;
  let networkEventHandler: ((event: PeerSessionEvent) => void) | null = null;
  let queuedNetworkEvents: PeerSessionEvent[] = [];

  const createPeerSession = (signalingUrl: string): PeerSession =>
    new PeerSession({
      signalingUrl,
      onEvent: (event) => {
        if (networkEventHandler) networkEventHandler(event);
        else if (queuedNetworkEvents.length < 32) queuedNetworkEvents.push(event);
      },
    });

  const routeQueuedNetworkEvents = (): void => {
    networkEventHandler = (event) => activeApplication?.handleNetworkEvent(event);
    for (const event of queuedNetworkEvents.splice(0)) activeApplication?.handleNetworkEvent(event);
  };

  const showWorldSelection = (openCreateForm: boolean): void => {
    if (disposed) return;
    activeApplication?.dispose();
    activeApplication = null;
    worldSelection?.dispose();
    try {
      const worlds = listWorlds(storage);
      worldSelection = new WorldSelectionView(
        worlds,
        (worldId) => void openWorld(worldId),
        (input) => createWorld(storage, input),
        (worldId) => void hostWorld(worldId),
        (roomCode) => void joinWorld(roomCode),
      );
      root.replaceChildren(worldSelection.element);
      if (openCreateForm) worldSelection.openCreateForm();
    } catch (error) {
      renderFatalError(root, error);
    }
  };

  const openWorld = async (
    worldId: string,
    network?: { readonly options: MultiplayerSessionOptions; readonly snapshot?: SnapshotMessage },
  ): Promise<void> => {
    worldSelection?.dispose();
    worldSelection = null;
    let chunkWorker: ChunkWorkerClient | null = null;
    try {
      const isGuest = network?.options.role === 'guest';
      const snapshot = network?.snapshot;
      const summary: WorldSummary | undefined =
        isGuest && snapshot
          ? { id: `online-${network.options.roomId}`, name: 'Shared world', seed: snapshot.seed }
          : listWorlds(storage).find((world) => world.id === worldId);
      if (!summary) throw new Error('That world no longer exists.');
      const save =
        isGuest && snapshot
          ? worldSaveFromSnapshot(summary, snapshot)
          : loadWorld(storage, worldId);
      const seed = save?.seed ?? summary.seed;
      const centerX = save?.player.chunkX ?? 0;
      const centerZ = save?.player.chunkZ ?? 0;
      const startingRegion = Array.from({ length: 9 }, (_, index) => ({
        x: centerX + (index % 3) - 1,
        z: centerZ + Math.floor(index / 3) - 1,
      }));
      const worker = new Worker(new URL('../workers/chunk.worker.ts', import.meta.url), {
        type: 'module',
      });
      chunkWorker = new ChunkWorkerClient(worker);
      const initialChunks: readonly PreparedChunk[] = await chunkWorker.prepareRegion(
        seed,
        startingRegion,
      );
      if (disposed) {
        chunkWorker.dispose();
        network?.options.session.close();
        return;
      }
      const { GameApplication } = await import('./GameApplication');
      activeApplication = new GameApplication(
        root,
        initialChunks,
        chunkWorker,
        seed,
        save,
        storage,
        summary,
        () => showWorldSelection(true),
        network?.options ?? null,
        () => showWorldSelection(false),
      );
      chunkWorker = null;
      if (network) routeQueuedNetworkEvents();
    } catch (cause) {
      chunkWorker?.dispose();
      network?.options.session.close();
      const error = new GameError('STARTUP_FAILED', 'The game could not start.', { cause });
      renderFatalError(root, error);
    }
  };

  const hostWorld = async (worldId: string): Promise<void> => {
    const signalingUrl = getSignalingUrl();
    if (!signalingUrl) {
      worldSelection?.setStatus(unconfiguredSignalingMessage());
      return;
    }
    queuedNetworkEvents = [];
    networkEventHandler = null;
    const session = createPeerSession(signalingUrl);
    try {
      const roomId = (await session.host()).toLowerCase();
      await openWorld(worldId, {
        options: { session, role: 'host', roomId, localPeerId: '' },
      });
    } catch (error) {
      session.close();
      worldSelection?.setStatus(
        error instanceof Error ? error.message : 'Could not host this world.',
      );
    }
  };

  const joinWorld = async (roomCode: string): Promise<void> => {
    const signalingUrl = getSignalingUrl();
    if (!signalingUrl) {
      worldSelection?.setStatus(unconfiguredSignalingMessage());
      return;
    }
    queuedNetworkEvents = [];
    networkEventHandler = null;
    const session = createPeerSession(signalingUrl);
    let localPeerId = '';
    let waitingForSnapshot: ((snapshot: SnapshotMessage) => void) | null = null;
    let rejectJoin: ((error: Error) => void) | null = null;
    const snapshotPromise = new Promise<SnapshotMessage>((resolve, reject) => {
      waitingForSnapshot = resolve;
      rejectJoin = reject;
    });
    networkEventHandler = (event) => {
      if (event.type === 'waiting') {
        localPeerId = event.peerId;
        worldSelection?.setStatus(`Invite sent. Waiting for host approval · ${event.roomCode}`);
      } else if (event.type === 'connected') {
        session.sendReliable(event.peerId, {
          protocolVersion: NETWORK_PROTOCOL_VERSION,
          worldId: roomCode.toLowerCase(),
          type: 'hello',
          generatorVersion: CHUNK_GENERATOR_VERSION,
          contentVersion: 1,
        });
      } else if (event.type === 'message' && event.message.type === 'snapshot') {
        waitingForSnapshot?.(event.message);
        waitingForSnapshot = null;
      } else if (!waitingForSnapshot && event.type === 'message') {
        if (queuedNetworkEvents.length < 32) queuedNetworkEvents.push(event);
      } else if (
        event.type === 'message' &&
        event.message.type === 'accept' &&
        !event.message.accepted
      ) {
        rejectJoin?.(new Error(event.message.reason ?? 'The host declined the connection.'));
      } else if (event.type === 'rejected' || event.type === 'error') {
        rejectJoin?.(new Error(event.type === 'error' ? event.message : event.reason));
      }
    };
    try {
      await session.join(roomCode);
      worldSelection?.setStatus('Invite sent. Waiting for the host to approve your request…');
      let timeoutId = 0;
      const snapshot = await Promise.race([
        snapshotPromise,
        new Promise<never>(
          (_resolve, reject) =>
            (timeoutId = window.setTimeout(
              () =>
                reject(new Error('Timed out waiting for the host to approve and share the world.')),
              90_000,
            )),
        ),
      ]);
      window.clearTimeout(timeoutId);
      await openWorld(`online-${roomCode.toLowerCase()}`, {
        options: {
          session,
          role: 'guest',
          roomId: roomCode.toLowerCase(),
          localPeerId,
          initialRevision: snapshot.revision,
        },
        snapshot,
      });
    } catch (error) {
      session.close();
      networkEventHandler = null;
      worldSelection?.setStatus(
        error instanceof Error ? error.message : 'Could not join that world.',
      );
    }
  };

  try {
    const worlds: readonly WorldSummary[] = listWorlds(storage);
    if (worlds.length === 1 && worlds[0]) await openWorld(worlds[0].id);
    else showWorldSelection(false);
  } catch (cause) {
    const error = new GameError('STARTUP_FAILED', 'The game could not start.', { cause });
    renderFatalError(root, error);
    return null;
  }

  return {
    dispose: () => {
      disposed = true;
      activeApplication?.dispose();
      activeApplication = null;
      worldSelection?.dispose();
      worldSelection = null;
    },
  };
}

function unconfiguredSignalingMessage(): string {
  return 'Online play needs a deployed signaling service. Set VITE_SIGNALING_URL during the client build; see docs/MULTIPLAYER_HOSTING.md.';
}

function worldSaveFromSnapshot(summary: WorldSummary, snapshot: SnapshotMessage): WorldSave {
  const chunkX = Math.floor(snapshot.hostPose.x / 16);
  const chunkZ = Math.floor(snapshot.hostPose.z / 16);
  return {
    version: 3,
    worldId: summary.id,
    worldName: summary.name,
    seed: snapshot.seed,
    worldTime: snapshot.worldTime,
    player: {
      chunkX,
      chunkZ,
      localX: snapshot.hostPose.x - chunkX * 16,
      localZ: snapshot.hostPose.z - chunkZ * 16,
      y: snapshot.hostPose.y,
      yaw: snapshot.hostPose.yaw,
      pitch: snapshot.hostPose.pitch,
    },
    inventory: snapshot.inventory ?? [],
    mutations: snapshot.mutations.map(({ position, blockId }) => ({ ...position, blockId })),
    survival: createSurvivalState(),
    hotbar: [...DEFAULT_HOTBAR_ITEM_IDS],
    durability: [],
    gameMode: 'survival',
  };
}
