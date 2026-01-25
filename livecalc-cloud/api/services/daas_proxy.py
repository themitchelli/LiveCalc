"""
DaaS (Debugging-as-a-Service) Proxy

Provides remote debugging capabilities for cloud-executed pipeline runs:
- Pause/Resume remote workers via WebSocket signals
- Stream raw memory segments from SharedArrayBuffer to IDE
- Step-through execution control
- Bus resource inspection with zero serialization overhead

Architecture:
- FastAPI endpoints provide REST interface for debug commands
- WebSocket connection maintains active debug session
- Atomics-based signaling coordinates pause/resume states
- Binary memory streaming uses raw Uint8Array chunks

Technical Notes:
- Pause triggers Atomics.wait() in remote worker
- Memory segments are 16-byte aligned for SIMD compatibility
- Active sessions tracked in Redis with TTL
- Auto-resume after configurable timeout (default: 5 minutes)
"""

from typing import Dict, Optional, List
from datetime import datetime, timedelta
import asyncio
import struct
import hashlib

from fastapi import WebSocket, WebSocketDisconnect, HTTPException
from pydantic import BaseModel
import redis.asyncio as redis


class DebugSession(BaseModel):
    """Active debugging session metadata"""
    session_id: str
    run_id: str
    user_id: str
    tenant_id: str
    started_at: datetime
    paused_at: Optional[datetime] = None
    current_node: Optional[str] = None
    memory_offset_map: Optional[Dict] = None
    auto_resume_timeout: int = 300  # 5 minutes default


class MemorySegmentRequest(BaseModel):
    """Request for specific memory segment inspection"""
    bus_uri: str  # e.g., "bus://category/name"
    offset: int = 0
    length: int = 1024  # bytes to read
    format: str = "raw"  # raw, float64, int32, etc.


class DebugCommand(BaseModel):
    """Debug control command"""
    command: str  # pause, resume, step, inspect
    target_node: Optional[str] = None
    params: Optional[Dict] = None


class DaaSProxy:
    """
    Debugging-as-a-Service Proxy

    Coordinates remote debugging sessions between VS Code extension and cloud workers.
    """

    def __init__(self, redis_url: str):
        self.redis_url = redis_url
        self.redis_client: Optional[redis.Redis] = None
        self.active_sessions: Dict[str, DebugSession] = {}
        self.websocket_connections: Dict[str, WebSocket] = {}

    async def initialize(self):
        """Initialize Redis connection"""
        self.redis_client = await redis.from_url(
            self.redis_url,
            encoding="utf-8",
            decode_responses=True
        )

    async def shutdown(self):
        """Cleanup connections"""
        if self.redis_client:
            await self.redis_client.close()

    async def create_session(
        self,
        run_id: str,
        user_id: str,
        tenant_id: str,
        memory_offset_map: Dict
    ) -> str:
        """
        Create new debug session

        Args:
            run_id: Job/run identifier
            user_id: User ID from JWT
            tenant_id: Tenant ID from JWT
            memory_offset_map: Memory layout from pipeline initialization

        Returns:
            session_id: Unique session identifier
        """
        session_id = f"debug:{run_id}:{datetime.utcnow().timestamp()}"

        session = DebugSession(
            session_id=session_id,
            run_id=run_id,
            user_id=user_id,
            tenant_id=tenant_id,
            started_at=datetime.utcnow(),
            memory_offset_map=memory_offset_map
        )

        self.active_sessions[session_id] = session

        # Store in Redis with TTL
        await self.redis_client.setex(
            f"daas:session:{session_id}",
            3600,  # 1 hour TTL
            session.model_dump_json()
        )

        return session_id

    async def pause_run(self, session_id: str, node_id: Optional[str] = None) -> bool:
        """
        Pause remote worker execution

        Sends pause signal via WebSocket to worker, which triggers Atomics.wait().

        Args:
            session_id: Active debug session
            node_id: Specific pipeline node to pause at (None = current node)

        Returns:
            success: Whether pause signal was sent successfully
        """
        session = self.active_sessions.get(session_id)
        if not session:
            raise HTTPException(status_code=404, detail="Debug session not found")

        # Get WebSocket connection for this run
        ws = self.websocket_connections.get(session.run_id)
        if not ws:
            raise HTTPException(status_code=400, detail="Worker not connected")

        # Send pause command via WebSocket
        await ws.send_json({
            "type": "debug:pause",
            "sessionId": session_id,
            "nodeId": node_id,
            "timestamp": datetime.utcnow().isoformat()
        })

        # Update session state
        session.paused_at = datetime.utcnow()
        session.current_node = node_id
        await self._update_session(session)

        return True

    async def resume_run(self, session_id: str) -> bool:
        """
        Resume paused worker execution

        Sends resume signal, which triggers Atomics.notify() to wake worker.

        Args:
            session_id: Active debug session

        Returns:
            success: Whether resume signal was sent successfully
        """
        session = self.active_sessions.get(session_id)
        if not session:
            raise HTTPException(status_code=404, detail="Debug session not found")

        ws = self.websocket_connections.get(session.run_id)
        if not ws:
            raise HTTPException(status_code=400, detail="Worker not connected")

        await ws.send_json({
            "type": "debug:resume",
            "sessionId": session_id,
            "timestamp": datetime.utcnow().isoformat()
        })

        session.paused_at = None
        await self._update_session(session)

        return True

    async def step_run(self, session_id: str) -> bool:
        """
        Execute single step in pipeline (advance one node)

        Args:
            session_id: Active debug session

        Returns:
            success: Whether step signal was sent successfully
        """
        session = self.active_sessions.get(session_id)
        if not session:
            raise HTTPException(status_code=404, detail="Debug session not found")

        if not session.paused_at:
            raise HTTPException(status_code=400, detail="Session not paused")

        ws = self.websocket_connections.get(session.run_id)
        if not ws:
            raise HTTPException(status_code=400, detail="Worker not connected")

        await ws.send_json({
            "type": "debug:step",
            "sessionId": session_id,
            "timestamp": datetime.utcnow().isoformat()
        })

        return True

    async def inspect_memory(
        self,
        session_id: str,
        bus_uri: str,
        offset: int = 0,
        length: int = 1024
    ) -> bytes:
        """
        Request raw memory segment from remote worker

        Returns binary data from SharedArrayBuffer with zero serialization overhead.

        Args:
            session_id: Active debug session
            bus_uri: Bus resource URI (e.g., "bus://results/npv")
            offset: Byte offset in resource
            length: Number of bytes to read

        Returns:
            Binary memory segment (raw bytes)
        """
        session = self.active_sessions.get(session_id)
        if not session:
            raise HTTPException(status_code=404, detail="Debug session not found")

        # Validate bus URI exists in memory map
        if not session.memory_offset_map:
            raise HTTPException(status_code=400, detail="Memory map not available")

        blocks_by_name = session.memory_offset_map.get("blocksByName", {})
        resource_name = bus_uri.replace("bus://", "")

        if resource_name not in blocks_by_name:
            raise HTTPException(status_code=404, detail=f"Bus resource '{bus_uri}' not found")

        block_info = blocks_by_name[resource_name]
        block_offset = block_info["offset"]
        block_size = block_info["sizeBytes"]

        # Validate offset and length
        if offset < 0 or offset >= block_size:
            raise HTTPException(status_code=400, detail="Invalid offset")

        if length < 0 or offset + length > block_size:
            # Clamp to block boundary
            length = block_size - offset

        # Request memory segment from worker
        ws = self.websocket_connections.get(session.run_id)
        if not ws:
            raise HTTPException(status_code=400, detail="Worker not connected")

        request_id = hashlib.md5(f"{session_id}:{bus_uri}:{offset}".encode()).hexdigest()[:12]

        await ws.send_json({
            "type": "debug:inspect",
            "requestId": request_id,
            "sessionId": session_id,
            "busUri": bus_uri,
            "offset": block_offset + offset,
            "length": length
        })

        # Wait for binary response (timeout: 5 seconds)
        try:
            # Worker will send binary WebSocket message with memory data
            data = await asyncio.wait_for(
                ws.receive_bytes(),
                timeout=5.0
            )
            return data
        except asyncio.TimeoutError:
            raise HTTPException(status_code=504, detail="Worker timeout")

    async def get_bus_resources(self, session_id: str) -> List[Dict]:
        """
        Get list of all bus:// resources available for inspection

        Args:
            session_id: Active debug session

        Returns:
            List of bus resource metadata dicts
        """
        session = self.active_sessions.get(session_id)
        if not session:
            raise HTTPException(status_code=404, detail="Debug session not found")

        if not session.memory_offset_map:
            return []

        blocks = session.memory_offset_map.get("blocks", [])

        return [
            {
                "uri": f"bus://{block['name']}",
                "name": block["name"],
                "offset": block["offset"],
                "sizeBytes": block["sizeBytes"],
                "dataType": block["dataType"],
                "elementCount": block["elementCount"],
                "checksumOffset": block.get("checksumOffset")
            }
            for block in blocks
        ]

    async def handle_websocket(self, websocket: WebSocket, run_id: str):
        """
        Handle WebSocket connection from cloud worker

        Maintains bidirectional channel for debug commands and memory streaming.

        Args:
            websocket: WebSocket connection
            run_id: Job/run identifier
        """
        await websocket.accept()
        self.websocket_connections[run_id] = websocket

        try:
            while True:
                # Wait for messages from worker (status updates, memory data)
                message = await websocket.receive_json()

                # Forward to appropriate session handler
                msg_type = message.get("type")

                if msg_type == "debug:paused":
                    # Worker has paused, notify sessions
                    session_id = message.get("sessionId")
                    node_id = message.get("nodeId")
                    await self._on_worker_paused(session_id, node_id)

                elif msg_type == "debug:resumed":
                    session_id = message.get("sessionId")
                    await self._on_worker_resumed(session_id)

                elif msg_type == "debug:stepped":
                    session_id = message.get("sessionId")
                    next_node = message.get("nextNode")
                    await self._on_worker_stepped(session_id, next_node)

        except WebSocketDisconnect:
            # Worker disconnected, clean up
            if run_id in self.websocket_connections:
                del self.websocket_connections[run_id]

    async def _update_session(self, session: DebugSession):
        """Update session in Redis"""
        await self.redis_client.setex(
            f"daas:session:{session.session_id}",
            3600,
            session.model_dump_json()
        )

    async def _on_worker_paused(self, session_id: str, node_id: str):
        """Handle worker paused notification"""
        session = self.active_sessions.get(session_id)
        if session:
            session.paused_at = datetime.utcnow()
            session.current_node = node_id
            await self._update_session(session)

    async def _on_worker_resumed(self, session_id: str):
        """Handle worker resumed notification"""
        session = self.active_sessions.get(session_id)
        if session:
            session.paused_at = None
            await self._update_session(session)

    async def _on_worker_stepped(self, session_id: str, next_node: str):
        """Handle worker step completion"""
        session = self.active_sessions.get(session_id)
        if session:
            session.current_node = next_node
            await self._update_session(session)


# ============================================================================
# Singleton Instance
# ============================================================================

_daas_proxy_instance: Optional[DaaSProxy] = None


def get_daas_proxy() -> DaaSProxy:
    """
    Get singleton DaaSProxy instance.

    Raises:
        RuntimeError: If proxy not initialized
    """
    if _daas_proxy_instance is None:
        raise RuntimeError("DaaSProxy not initialized. Call initialize_daas_proxy() first.")
    return _daas_proxy_instance


async def initialize_daas_proxy(redis_url: str) -> DaaSProxy:
    """
    Initialize singleton DaaSProxy instance.

    Args:
        redis_url: Redis connection URL

    Returns:
        Initialized DaaSProxy instance
    """
    global _daas_proxy_instance
    if _daas_proxy_instance is None:
        _daas_proxy_instance = DaaSProxy(redis_url)
        await _daas_proxy_instance.initialize()
    return _daas_proxy_instance


async def shutdown_daas_proxy():
    """Shutdown singleton DaaSProxy instance."""
    global _daas_proxy_instance
    if _daas_proxy_instance is not None:
        await _daas_proxy_instance.shutdown()
        _daas_proxy_instance = None
