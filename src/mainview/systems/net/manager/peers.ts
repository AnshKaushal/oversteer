import { RemoteCar } from "../RemoteCar"
import {
  netDiagForgetPeer,
  netDiagPeerEvent,
  netDiagRemoteCount,
} from "../NetDiagnostics"
import type { PeerPlayer } from "../types"
import type { MultiplayerManager } from "../MultiplayerManager"

export function registerPeer(
  this: MultiplayerManager,
  peerId: string,
): PeerPlayer {
  let peer = this.peers.get(peerId)
  if (!peer) {
    peer = {
      id: peerId,
      name: `Racer-${peerId.slice(0, 4)}`,
      color: 0xffffff,
      colorHex: "#ffffff",
      pingMs: 0,
      ready: false,
      isHost: false,
      lastSeen: Date.now(),
      progress: 0,
      finished: false,
      finishTime: null,
    }
    this.peers.set(peerId, peer)

    if (this.activeScene && this.activeWorld && !this.remoteCars.has(peerId)) {
      const remote = new RemoteCar(
        peerId,
        peer.name,
        peer.color,
        this.activeScene,
        this.baseUrl,
        this.activeWorld ?? undefined,
        this.activeRapier ?? undefined,
        this.remoteOptsFor(peer),
      )
      remote.setHeadlights(this.headlightsOn)
      this.remoteCars.set(peerId, remote)
    }

    this.callbacks.onPlayerJoined?.(peer)
    this.notifyPeersChanged()
    netDiagPeerEvent(peerId, "connect")
    netDiagRemoteCount(this.remoteCars.size)
  }
  return peer
}

export function unregisterPeer(this: MultiplayerManager, peerId: string) {
  this.peers.delete(peerId)
  this.sessions.reset(peerId)
  this.clocks.delete(peerId)
  netDiagPeerEvent(peerId, "disconnect")
  const remote = this.remoteCars.get(peerId)
  if (remote) {
    if (this.activeScene) {
      try {
        remote.dispose(this.activeScene, this.activeWorld ?? undefined)
      } catch (e) {
        console.warn("[Multiplayer] Remote dispose failed:", e)
      }
    }
    this.remoteCars.delete(peerId)
  }
  this.callbacks.onPlayerLeft?.(peerId)
  this.notifyPeersChanged()
  netDiagForgetPeer(peerId)
  netDiagRemoteCount(this.remoteCars.size)
}

export function notifyPeersChanged(this: MultiplayerManager) {
  this.callbacks.onPeersUpdated?.(this.getConnectedPeersList())
}
