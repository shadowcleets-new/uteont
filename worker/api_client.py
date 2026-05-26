"""HTTP client for the Vercel API — claim/complete/fail jobs.

Uses urllib (stdlib) so we avoid pulling requests as a hard dep.
"""

from __future__ import annotations

import json
import logging
import os
import urllib.error
import urllib.request
from typing import Any

log = logging.getLogger("worker.api")


class ApiError(Exception):
    pass


class VercelClient:
    def __init__(self, base_url: str, secret: str, worker_id: str) -> None:
        self.base_url = base_url.rstrip("/")
        self.secret = secret
        self.worker_id = worker_id

    def _request(self, method: str, path: str, body: dict | None = None,
                 timeout: int = 30) -> dict:
        url = f"{self.base_url}{path}"
        data = json.dumps(body or {}).encode("utf-8") if body is not None else None
        headers = {
            "Authorization": f"Bearer {self.secret}",
            "Content-Type": "application/json",
            "User-Agent": f"uteont-worker/{self.worker_id}",
        }
        req = urllib.request.Request(url, data=data, headers=headers, method=method)
        try:
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                payload = resp.read().decode("utf-8")
                if not payload:
                    return {}
                return json.loads(payload)
        except urllib.error.HTTPError as e:
            try:
                err_body = e.read().decode("utf-8")
            except Exception:
                err_body = ""
            raise ApiError(f"{method} {path} → HTTP {e.code}: {err_body}") from e
        except urllib.error.URLError as e:
            raise ApiError(f"{method} {path} → network error: {e}") from e

    # --- job lifecycle --------------------------------------------------

    def claim_job(self, agent_keys: list[str]) -> dict | None:
        resp = self._request(
            "POST", "/api/jobs/claim",
            {"workerId": self.worker_id, "agentKeys": agent_keys},
        )
        return resp.get("job")

    def complete_job(self, job_id: int, result: dict) -> None:
        self._request("POST", f"/api/jobs/{job_id}/complete", {"result": result})

    def fail_job(self, job_id: int, error: str, retry: bool = True) -> None:
        self._request("POST", f"/api/jobs/{job_id}/fail", {"error": error, "retry": retry})


def from_env(worker_id: str | None = None) -> VercelClient:
    base = os.environ.get("UTEONT_API_BASE")
    secret = os.environ.get("WORKER_SHARED_SECRET")
    if not base:
        raise ApiError("UTEONT_API_BASE not set (e.g. https://uteont.vercel.app)")
    if not secret:
        raise ApiError("WORKER_SHARED_SECRET not set")
    wid = worker_id or os.environ.get("WORKER_ID") or f"worker-{os.getpid()}"
    return VercelClient(base, secret, wid)
