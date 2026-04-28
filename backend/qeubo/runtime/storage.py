"""
Redis persistence layer for qEUBO experiments.

Tensors are serialised with torch.save into raw bytes and stored directly
in Redis — no base64 overhead, no pickle fragility for plain tensors.

Adapted from ~/preference_optimizer/qEUBO/wss3/storage.py with no
behavioural changes; this is the PBO-core storage layer with no
gradient-optimizer / colormap content to strip.

Key layout:
    pbo:exp:<id>:config       JSON dict of hyperparameters
    pbo:exp:<id>:state        JSON dict {phase, init_index, iteration, pending}
    pbo:exp:<id>:init_queries torch.save bytes  – pre-generated random pairs
    pbo:exp:<id>:queries      torch.save bytes  – all answered queries so far
    pbo:exp:<id>:responses    torch.save bytes  – corresponding preference labels
    pbo:experiments           Redis SET of all experiment IDs

License: MIT — see ../LICENSE
"""

import io
import json
from typing import Optional

import redis.asyncio as aioredis
import torch
from torch import Tensor

_PREFIX = "pbo:"


def _to_bytes(tensor: Tensor) -> bytes:
    buf = io.BytesIO()
    torch.save(tensor, buf)
    return buf.getvalue()


def _from_bytes(data: bytes) -> Tensor:
    return torch.load(io.BytesIO(data), weights_only=True)


class ExperimentStorage:
    """Thin async wrapper around Redis for experiment persistence."""

    def __init__(self, redis_url: str = "redis://localhost:6379") -> None:
        # decode_responses=False so we can store raw bytes for tensors
        self.redis = aioredis.from_url(redis_url, decode_responses=False)

    def _key(self, experiment_id: str, field: str) -> str:
        return f"{_PREFIX}exp:{experiment_id}:{field}"

    # ------------------------------------------------------------------
    # Connectivity
    # ------------------------------------------------------------------

    async def ping(self) -> bool:
        try:
            await self.redis.ping()
            return True
        except Exception:
            return False

    # ------------------------------------------------------------------
    # Experiment registry
    # ------------------------------------------------------------------

    async def experiment_exists(self, experiment_id: str) -> bool:
        return bool(await self.redis.exists(self._key(experiment_id, "config")))

    async def list_experiments(self) -> list[str]:
        members = await self.redis.smembers(f"{_PREFIX}experiments")
        return sorted(m.decode() if isinstance(m, bytes) else m for m in members)

    # ------------------------------------------------------------------
    # Config
    # ------------------------------------------------------------------

    async def save_config(self, experiment_id: str, config: dict) -> None:
        pipe = self.redis.pipeline()
        pipe.set(self._key(experiment_id, "config"), json.dumps(config).encode())
        pipe.sadd(f"{_PREFIX}experiments", experiment_id)
        await pipe.execute()

    async def load_config(self, experiment_id: str) -> Optional[dict]:
        raw = await self.redis.get(self._key(experiment_id, "config"))
        return json.loads(raw.decode()) if raw else None

    # ------------------------------------------------------------------
    # State
    # ------------------------------------------------------------------

    async def save_state(self, experiment_id: str, state: dict) -> None:
        await self.redis.set(
            self._key(experiment_id, "state"),
            json.dumps(state).encode(),
        )

    async def load_state(self, experiment_id: str) -> Optional[dict]:
        raw = await self.redis.get(self._key(experiment_id, "state"))
        return json.loads(raw.decode()) if raw else None

    # ------------------------------------------------------------------
    # Tensors (generic)
    # ------------------------------------------------------------------

    async def save_tensor(self, experiment_id: str, field: str, tensor: Tensor) -> None:
        await self.redis.set(self._key(experiment_id, field), _to_bytes(tensor))

    async def load_tensor(self, experiment_id: str, field: str) -> Optional[Tensor]:
        raw = await self.redis.get(self._key(experiment_id, field))
        return _from_bytes(raw) if raw else None

    # ------------------------------------------------------------------
    # Deletion
    # ------------------------------------------------------------------

    async def delete_experiment(self, experiment_id: str) -> None:
        fields = ["config", "state", "init_queries", "queries", "responses"]
        keys = [self._key(experiment_id, f) for f in fields]
        pipe = self.redis.pipeline()
        pipe.delete(*keys)
        pipe.srem(f"{_PREFIX}experiments", experiment_id)
        await pipe.execute()
