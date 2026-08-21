"""
tests/integration/routes/test_error_cors_legibility.py

Pins the error-path CORS remedy in ``main.py`` (ledger row 1342): a
genuine unhandled 500 must still carry
``access-control-allow-origin`` when the request carries an
``Origin`` header, so the browser reports the real status instead of
mis-reporting it as an opaque CORS failure.

``main.py`` is not imported directly here — importing it side-effects
(module-level logging configuration, ``core.config``'s SECRET_KEY
file resolution, building the full router-wired ``app`` singleton),
which is exactly the pattern ``tests/integration/routes/conftest.py``
documents avoiding (see its ``_build_test_app`` docstring). Instead
this test mirrors ``main.py``'s ``CatchAllExceptionMiddleware`` +
CORSMiddleware wiring byte-for-byte (same middleware-add ORDER, which
is the load-bearing part) in a throwaway app, plus one test-only
route that always raises.

The mechanism (why a plain ``@app.exception_handler(Exception)``
does NOT work here, and why middleware add-order matters) is
documented in ``main.py``'s ``CatchAllExceptionMiddleware``
docstring — read that first; this file exists to pin the claim, not
re-derive it.

License: Public Domain (The Unlicense)
"""
from __future__ import annotations

import logging

import pytest
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from httpx import ASGITransport, AsyncClient
from starlette.requests import Request
from starlette.types import ASGIApp, Message, Receive, Scope, Send

pytestmark = pytest.mark.integration

logger = logging.getLogger(__name__)


class _CatchAllExceptionMiddleware:
    """
    Mirror of ``main.CatchAllExceptionMiddleware`` — see that class's
    docstring for the full mechanism explanation. Duplicated here
    (rather than imported) to keep this test from importing
    ``main.py`` and its module-level side effects.
    """

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        response_started = False

        async def _send(message: Message) -> None:
            nonlocal response_started
            if message["type"] == "http.response.start":
                response_started = True
            await send(message)

        try:
            await self.app(scope, receive, _send)
        except Exception as exc:
            request = Request(scope)
            logger.exception(
                "Unhandled exception on %s %s", request.method, request.url.path
            )
            if not response_started:
                response = JSONResponse(
                    status_code=500, content={"detail": "Internal server error"}
                )
                await response(scope, receive, send)
            raise exc


def _build_error_app() -> FastAPI:
    """
    Mirrors main.py's middleware ADD ORDER exactly: CatchAll first,
    then CORS. Per Starlette's `add_middleware` (prepends to
    `user_middleware`, so the LAST-added ends up OUTERMOST among user
    middleware), this makes CORSMiddleware wrap
    `_CatchAllExceptionMiddleware` — the load-bearing detail this test
    pins. Same CORS config as main.py (allow_origins=["*"],
    allow_credentials=False).
    """
    app = FastAPI(title="CORS-on-500 legibility test app")

    app.add_middleware(_CatchAllExceptionMiddleware)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=False,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.get("/boom")
    async def boom():
        raise RuntimeError("deliberate unhandled exception for the CORS-legibility test")

    return app


async def test_unhandled_500_carries_cors_header_when_origin_present():
    app = _build_error_app()
    # raise_app_exceptions=False: CatchAllExceptionMiddleware re-raises
    # after sending its response (matching Starlette's own
    # ServerErrorMiddleware convention, so a real ASGI server still
    # sees/logs the exception) -- httpx's ASGITransport defaults to
    # propagating that re-raised exception into the test instead of
    # returning the response that was already sent. Disable that here
    # so the test can inspect the response the middleware produced.
    transport = ASGITransport(app=app, raise_app_exceptions=False)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get(
            "/boom", headers={"Origin": "https://example.org"}
        )

    assert response.status_code == 500
    assert response.json() == {"detail": "Internal server error"}
    assert response.headers.get("access-control-allow-origin") == "*", (
        "an unhandled 500 must still carry CORS headers so the browser "
        "reports the real 500 instead of an opaque CORS failure "
        f"(ledger row 1342); got headers: {dict(response.headers)}"
    )


async def test_unhandled_500_without_the_fix_loses_cors_header():
    """
    Negative control: CORSMiddleware alone, with NO
    CatchAllExceptionMiddleware in front of it, does NOT get to
    inject headers on an unhandled exception -- Starlette's
    ServerErrorMiddleware (always outermost, always outside
    CORSMiddleware) sends its own bare 500 directly on the raw ASGI
    `send`, bypassing CORSMiddleware entirely. This pins that the fix
    in main.py is load-bearing: CORSMiddleware by itself does not
    solve ledger row 1342.
    """
    app = FastAPI(title="CORS-on-500 negative control (no catch-all middleware)")
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=False,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.get("/boom")
    async def boom():
        raise RuntimeError("deliberate unhandled exception, no catch-all middleware")

    transport = ASGITransport(app=app, raise_app_exceptions=False)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get(
            "/boom", headers={"Origin": "https://example.org"}
        )

    assert response.status_code == 500
    assert response.headers.get("access-control-allow-origin") is None, (
        "negative control: this app has no CatchAllExceptionMiddleware, "
        "so CORSMiddleware should NOT be able to inject headers into the "
        "ServerErrorMiddleware-generated 500 -- if this now has a CORS "
        "header, the underlying Starlette mechanism this test documents "
        "has changed and main.py's CatchAllExceptionMiddleware docstring "
        "needs re-checking"
    )
