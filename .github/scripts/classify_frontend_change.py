#!/usr/bin/env python3
"""Fail-closed change-impact classifier for frontend CI.

The reduced profile is available only when every changed path is a dependency
manifest/lockfile and any edited manifest changes dependency declarations only.
The CI workflow/classifier pair has a separate control-plane-only profile.
Anything else requires the full application-source gates.
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
import tomllib
from typing import Any, Callable

DEPENDENCY_LOCKFILES = {
    "frontend/package-lock.json",
    "frontend/src-tauri/Cargo.lock",
}
DEPENDENCY_MANIFESTS = {
    "frontend/package.json",
    "frontend/src-tauri/Cargo.toml",
}
CONTROL_PLANE_FILES = {
    ".github/workflows/frontend-ci.yml",
    ".github/scripts/classify_frontend_change.py",
}
# The one repository note that records this maintenance operation. It is
# explicitly non-application documentation, but is only exempted when bundled
# with the known CI control-plane change and validated dependency changes.
MAINTENANCE_DOCUMENTATION_FILES = {
    "docs/notes/dependency-maintenance-topology-backlog.md",
}
PACKAGE_DEPENDENCY_KEYS = {
    "dependencies",
    "devDependencies",
    "optionalDependencies",
    "peerDependencies",
    "peerDependenciesMeta",
    "overrides",
    "resolutions",
    "bundledDependencies",
    "bundleDependencies",
}
CARGO_DEPENDENCY_TABLES = {
    "dependencies",
    "dev-dependencies",
    "build-dependencies",
}


def run_git(*args: str) -> bytes:
    return subprocess.run(
        ["git", *args],
        check=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    ).stdout


def manifest_content(ref: str, path: str) -> str:
    return run_git("show", f"{ref}:{path}").decode("utf-8")


def canonical(value: Any) -> str:
    return json.dumps(value, sort_keys=True, separators=(",", ":"))


def package_projection(document: Any) -> Any:
    if not isinstance(document, dict):
        raise ValueError("package.json root must be an object")
    return {
        key: value
        for key, value in document.items()
        if key not in PACKAGE_DEPENDENCY_KEYS
    }


def cargo_projection(value: Any, *, root: bool = True) -> Any:
    if isinstance(value, dict):
        projected: dict[str, Any] = {}
        for key, child in value.items():
            if key in CARGO_DEPENDENCY_TABLES:
                continue
            if root and key in {"patch", "replace"}:
                continue
            projected[key] = cargo_projection(child, root=False)
        return projected
    if isinstance(value, list):
        return [cargo_projection(item, root=False) for item in value]
    return value


def manifest_changes_are_dependency_only(
    path: str,
    base_ref: str,
    head_ref: str,
) -> bool:
    try:
        before = manifest_content(base_ref, path)
        after = manifest_content(head_ref, path)
        if path.endswith("package.json"):
            return canonical(package_projection(json.loads(before))) == canonical(
                package_projection(json.loads(after))
            )
        if path.endswith("Cargo.toml"):
            return canonical(cargo_projection(tomllib.loads(before))) == canonical(
                cargo_projection(tomllib.loads(after))
            )
    except (subprocess.CalledProcessError, UnicodeDecodeError, json.JSONDecodeError, tomllib.TOMLDecodeError, ValueError):
        return False
    return False


def classify_paths(
    paths: list[str],
    manifest_is_dependency_only: Callable[[str], bool],
) -> dict[str, Any]:
    rust_validation = any(
        path in {
            "frontend/src-tauri/Cargo.toml",
            "frontend/src-tauri/Cargo.lock",
        }
        for path in paths
    )
    dependency_only = bool(paths)
    for path in paths:
        if path in DEPENDENCY_LOCKFILES:
            continue
        if path in DEPENDENCY_MANIFESTS and manifest_is_dependency_only(path):
            continue
        dependency_only = False
        break

    control_plane_change = any(path in CONTROL_PLANE_FILES for path in paths)
    control_plane_and_dependencies_only = control_plane_change and all(
        path in CONTROL_PLANE_FILES
        or path in MAINTENANCE_DOCUMENTATION_FILES
        or path in DEPENDENCY_LOCKFILES
        or (path in DEPENDENCY_MANIFESTS and manifest_is_dependency_only(path))
        for path in paths
    )
    application_gates_required = not (
        dependency_only or control_plane_and_dependencies_only
    )

    if dependency_only:
        reason = "dependency manifests/lockfiles only; non-dependency manifest fields unchanged"
    elif control_plane_and_dependencies_only:
        reason = "CI control-plane plus validated dependency and maintenance-documentation changes; non-dependency manifest fields unchanged"
    else:
        reason = "application, test, build, or unclassified files changed; full source gates required"

    return {
        "dependency_only": dependency_only,
        "application_gates_required": application_gates_required,
        "rust_validation_required": rust_validation,
        "reason": reason,
        "changed_paths": paths,
    }


def self_test() -> None:
    safe_manifest = lambda _path: True
    unsafe_manifest = lambda _path: False

    assert classify_paths(["frontend/package-lock.json"], safe_manifest)["dependency_only"]
    assert classify_paths(["frontend/src-tauri/Cargo.lock"], safe_manifest)["rust_validation_required"]
    assert classify_paths(["frontend/package.json"], safe_manifest)["dependency_only"]
    assert not classify_paths(["frontend/package.json"], unsafe_manifest)["dependency_only"]
    assert package_projection({"name": "app", "scripts": {"build": "vite build"}, "dependencies": {"vue": "^3"}}) == package_projection(
        {"name": "app", "scripts": {"build": "vite build"}, "dependencies": {"vue": "^4"}}
    )
    assert package_projection({"name": "app", "scripts": {"build": "vite build"}}) != package_projection(
        {"name": "app", "scripts": {"build": "vite test"}}
    )
    assert cargo_projection({"package": {"version": "1"}, "dependencies": {"serde": "1"}}) == cargo_projection(
        {"package": {"version": "1"}, "dependencies": {"serde": "2"}}
    )
    assert cargo_projection({"package": {"version": "1"}}) != cargo_projection(
        {"package": {"version": "2"}}
    )
    assert classify_paths(["frontend/src-tauri/Cargo.toml"], safe_manifest)["dependency_only"]
    assert not classify_paths(
        ["frontend/package-lock.json", "frontend/src/components/App.vue"], safe_manifest
    )["dependency_only"]
    control_plane = classify_paths(sorted(CONTROL_PLANE_FILES), safe_manifest)
    assert not control_plane["dependency_only"]
    assert not control_plane["application_gates_required"]
    control_plane_plus_dependency = classify_paths(
        sorted(CONTROL_PLANE_FILES | {"frontend/package-lock.json"}), safe_manifest
    )
    assert not control_plane_plus_dependency["dependency_only"]
    assert not control_plane_plus_dependency["application_gates_required"]
    maintenance_note = "docs/notes/dependency-maintenance-topology-backlog.md"
    control_plane_plus_maintenance_note = classify_paths(
        sorted(CONTROL_PLANE_FILES | {"frontend/package-lock.json", maintenance_note}),
        safe_manifest,
    )
    assert not control_plane_plus_maintenance_note["dependency_only"]
    assert not control_plane_plus_maintenance_note["application_gates_required"]
    assert classify_paths([maintenance_note], safe_manifest)["application_gates_required"]
    control_plane_plus_non_dependency_change = classify_paths(
        sorted(CONTROL_PLANE_FILES | {"frontend/package.json"}), unsafe_manifest
    )
    assert control_plane_plus_non_dependency_change["application_gates_required"]
    assert classify_paths(
        sorted(CONTROL_PLANE_FILES | {"frontend/src/components/App.vue"}), safe_manifest
    )["application_gates_required"]
    assert classify_paths([], safe_manifest)["application_gates_required"]
    print("change-impact classifier self-test: passed")


def main() -> int:
    if len(sys.argv) == 2 and sys.argv[1] == "--self-test":
        self_test()
        return 0
    if len(sys.argv) != 1:
        print("usage: classify_frontend_change.py [--self-test]", file=sys.stderr)
        return 2

    base_ref = os.environ.get("BASE_SHA", "")
    head_ref = os.environ.get("HEAD_SHA", "")
    if not base_ref or not head_ref or set(base_ref) == {"0"}:
        result = {
            "dependency_only": False,
            "application_gates_required": True,
            "rust_validation_required": True,
            "reason": "base/head commit unavailable; fail closed to full validation",
            "changed_paths": [],
        }
    else:
        raw_paths = run_git("diff", "--name-only", "-z", f"{base_ref}...{head_ref}")
        paths = sorted(os.fsdecode(item) for item in raw_paths.split(b"\0") if item)
        result = classify_paths(
            paths,
            lambda path: manifest_changes_are_dependency_only(path, base_ref, head_ref),
        )

    print(json.dumps(result, indent=2))
    output_path = os.environ.get("GITHUB_OUTPUT")
    if output_path:
        with open(output_path, "a", encoding="utf-8") as output:
            output.write(f"dependency_only={str(result['dependency_only']).lower()}\n")
            output.write(
                f"application_gates_required={str(result['application_gates_required']).lower()}\n"
            )
            output.write(
                f"rust_validation_required={str(result['rust_validation_required']).lower()}\n"
            )
            output.write(f"reason={result['reason']}\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
