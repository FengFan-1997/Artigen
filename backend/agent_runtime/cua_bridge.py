#!/usr/bin/env python3
"""Small JSON bridge around the official Cua Sandbox Python SDK.

The Node worker never imports provider internals. This process accepts one JSON
request on stdin and returns one JSON response on stdout, which keeps the
sandbox provider replaceable and prevents provider credentials entering model
context or sandbox shell commands.
"""

import asyncio
import base64
from dataclasses import replace
import json
import os
import secrets
import subprocess
import sys
from typing import Any


def output(value: dict[str, Any]) -> None:
    sys.stdout.write(json.dumps(value, ensure_ascii=False))
    sys.stdout.flush()


def docker_binary() -> str:
    return os.environ.get("ARTIGEN_REAL_DOCKER") or "docker"


def docker_run(*args: str, check: bool = True, timeout: int = 30) -> subprocess.CompletedProcess:
    result = subprocess.run(
        [docker_binary(), *args],
        capture_output=True,
        text=True,
        timeout=timeout,
    )
    if check and result.returncode != 0:
        raise RuntimeError("DOCKER_COMMAND_FAILED:" + (result.stderr or result.stdout)[:300])
    return result


def egress_names(sandbox_name: str) -> tuple[str, str]:
    clean = "".join(ch for ch in sandbox_name if ch.isalnum() or ch in "-_")[:42]
    return f"{clean}-net", f"{clean}-egress"


def verify_image_toolchain(image_ref: str) -> dict[str, str]:
    if not image_ref:
        raise RuntimeError("AGENT_SANDBOX_IMAGE_NOT_READY")
    result = docker_run(
        "image", "inspect", "--format",
        '{{.Id}}|{{index .Config.Labels "ai.artigen.toolchain"}}',
        image_ref,
    )
    image_id, separator, toolchain = result.stdout.strip().partition("|")
    if not separator or not image_id.startswith("sha256:") or toolchain != "v2":
        raise RuntimeError("AGENT_SANDBOX_IMAGE_TOOLCHAIN_MISMATCH")
    return {"imageId": image_id, "toolchain": toolchain}


def cleanup_egress(sandbox_name: str) -> None:
    network_name, proxy_name = egress_names(sandbox_name)
    docker_run("rm", "-f", f"{sandbox_name}-control", check=False)
    docker_run("rm", "-f", proxy_name, check=False)
    docker_run("network", "rm", network_name, check=False)


def prepare_egress(sandbox_name: str, image_ref: str) -> str:
    if not image_ref:
        raise RuntimeError("AGENT_SANDBOX_IMAGE_NOT_READY")
    network_name, proxy_name = egress_names(sandbox_name)
    cleanup_egress(sandbox_name)
    docker_run(
        "network", "create", "--internal",
        "--label", "ai.artigen.egress=restricted-v1",
        "--label", f"ai.artigen.egress.sandbox={sandbox_name}",
        network_name,
    )
    try:
        docker_run(
            "run", "-d", "--name", proxy_name,
            "--network", network_name,
            "--network-alias", "artigen-egress",
            "--label", "ai.artigen.egress=restricted-v1",
            "--label", f"ai.artigen.egress.sandbox={sandbox_name}",
            "--read-only", "--tmpfs", "/tmp:rw,noexec,nosuid,size=16m",
            "--cap-drop", "ALL", "--security-opt", "no-new-privileges:true",
            "--user", "cua", "--entrypoint", "node",
            image_ref, "/opt/artigen/egress_proxy.js",
        )
        docker_run("network", "connect", "bridge", proxy_name)
        inspect = docker_run(
            "inspect", "--format", "{{.State.Running}}", proxy_name
        ).stdout.strip()
        if inspect != "true":
            raise RuntimeError("AGENT_EGRESS_PROXY_NOT_RUNNING")
        return network_name
    except Exception:
        cleanup_egress(sandbox_name)
        raise


def verify_restricted_egress(image_ref: str, platform: str = "") -> dict[str, Any]:
    sandbox_name = "artigen-egress-doctor-" + secrets.token_hex(5)
    network_name = prepare_egress(sandbox_name, image_ref)
    platform_args = ["--platform", platform] if platform else []
    try:
        proxied = docker_run(
            "run", "--rm", "--network", network_name, *platform_args,
            "--entrypoint", "sh", image_ref, "-lc",
            "curl --silent --show-error --fail --connect-timeout 10 "
            "--proxy http://artigen-egress:8080 https://example.com/ -o /dev/null",
            check=False,
            timeout=30,
        )
        direct = docker_run(
            "run", "--rm", "--network", network_name, *platform_args,
            "--entrypoint", "sh", image_ref, "-lc",
            "curl --silent --show-error --fail --connect-timeout 5 "
            "--noproxy '*' https://example.com/ -o /dev/null",
            check=False,
            timeout=15,
        )
        private = docker_run(
            "run", "--rm", "--network", network_name, *platform_args,
            "--entrypoint", "sh", image_ref, "-lc",
            "curl --insecure --silent --show-error --fail --connect-timeout 5 "
            "--proxy http://artigen-egress:8080 https://127.0.0.1/ -o /dev/null",
            check=False,
            timeout=15,
        )
        if proxied.returncode != 0 or direct.returncode == 0 or private.returncode == 0:
            raise RuntimeError("AGENT_EGRESS_POLICY_PROBE_FAILED")
        return {
            "egressVerified": True,
            "proxyHttps": True,
            "directEgressBlocked": True,
            "privateTargetsBlocked": True,
        }
    finally:
        cleanup_egress(sandbox_name)


def cleanup_orphaned_egress() -> int:
    result = docker_run(
        "ps", "-a", "--filter", "label=ai.artigen.egress=restricted-v1",
        "--format", "{{.Label \"ai.artigen.egress.sandbox\"}}",
        check=False,
    )
    cleaned = 0
    for sandbox_name in set(line.strip() for line in result.stdout.splitlines() if line.strip()):
        exists = docker_run("inspect", sandbox_name, check=False).returncode == 0
        if not exists:
            cleanup_egress(sandbox_name)
            cleaned += 1
    return cleaned


async def connect_sandbox(Sandbox: Any, name: str, local: bool) -> Any:
    return await Sandbox.connect(
        name=name,
        api_key=None if local else os.environ.get("CUA_API_KEY"),
        local=local,
    )


async def main() -> None:
    request = json.loads(sys.stdin.read() or "{}")
    command = str(request.get("command") or "")
    local = bool(request.get("local"))
    try:
        from cua import Image, Sandbox, check_local_support
    except Exception as error:
        raise RuntimeError("CUA_SDK_NOT_INSTALLED") from error

    if command == "doctor":
        runtime = None
        if local:
            image = verify_image_toolchain(str(request.get("imageRef") or ""))
            support = check_local_support(Image.linux(kind="container"))
            if not support.supported or not support.runtime_installed:
                raise RuntimeError("CUA_LOCAL_RUNTIME_UNAVAILABLE:" + support.reason)
            runtime = support.runtime_name
            orphaned = cleanup_orphaned_egress()
            egress = {}
            if str(request.get("egressPolicy") or "") == "restricted-v1":
                egress = verify_restricted_egress(
                    str(request.get("imageRef") or ""),
                    str(request.get("dockerPlatform") or ""),
                )
        else:
            orphaned = 0
            egress = {}
        sandboxes = await Sandbox.list(
            local=local,
            api_key=None if local else os.environ.get("CUA_API_KEY"),
        )
        output(
            {
                "ok": True,
                "local": local,
                "runtime": runtime,
                "sandboxCount": len(sandboxes),
                "orphanedEgressCleaned": orphaned,
                **image,
                **egress,
            }
        )
        return

    if command == "create":
        image_ref = str(request.get("imageRef") or "")
        if local:
            verify_image_toolchain(image_ref)
        if image_ref:
            image = Image.from_registry(image_ref)
            # Cua 0.1.27 resolves registry-image kinds remotely before it honors
            # the selected local runtime. Docker Hub digest references can then
            # enter an unnecessary auth flow even when the exact image is
            # already present locally. Artigen only accepts this shortcut for
            # the explicitly requested local container path; cloud/VM images
            # keep Cua's normal manifest resolution.
            if local and str(request.get("kind") or "") == "container":
                image = replace(image, kind="container")
        else:
            image = Image.linux(
                distro=str(request.get("distro") or "ubuntu"),
                version=str(request.get("version") or "24.04"),
                kind=str(request.get("kind") or "vm"),
            )
        packages = request.get("aptPackages") or []
        if packages:
            image = image.apt_install(*[str(item) for item in packages])
        if bool(request.get("installPlaywright")):
            image = image.run("npm install --global playwright-core@1.55.0")
        image = image.run(
            "install -d -o cua -g cua -m 700 "
            "/tmp/artigen-workspace /tmp/artigen-verify"
        )
        runtime = None
        docker_platform = str(request.get("dockerPlatform") or "")
        if local and str(request.get("kind") or "") == "container" and docker_platform:
            from cua import DockerRuntime

            runtime = DockerRuntime(platform=docker_platform, ephemeral=False)
        sandbox_name = str(request.get("name") or "") or None
        restricted = (
            local
            and str(request.get("egressPolicy") or "") == "restricted-v1"
        )
        # Every local Cua sandbox needs the internal network and loopback-only
        # control sidecar, including image-only runs that never initialize a
        # browser. Preparing it only for browser-capable runs leaves the Docker
        # wrapper without the network/image contract required to provision the
        # sandbox at all.
        if local and not restricted:
            raise RuntimeError("AGENT_EGRESS_POLICY_UNATTESTED")
        if restricted and sandbox_name:
            os.environ["ARTIGEN_DOCKER_NETWORK"] = prepare_egress(sandbox_name, image_ref)
            os.environ["ARTIGEN_CUA_IMAGE_REF"] = image_ref
        try:
            sandbox = await Sandbox.create(
                image=image,
                name=sandbox_name,
                api_key=None if local else os.environ.get("CUA_API_KEY"),
                local=local,
                runtime=runtime,
                cpu=int(request.get("cpu") or 2),
                memory_mb=int(request.get("memoryMb") or 4096),
                disk_gb=int(request.get("diskGb") or 10),
                region=str(request.get("region") or "us-east-1"),
            )
        except Exception:
            if restricted and sandbox_name:
                docker_run("rm", "-f", sandbox_name, check=False)
                cleanup_egress(sandbox_name)
            raise
        try:
            width, height = await sandbox.get_dimensions()
            display_url = None if local else await sandbox.get_display_url(share=False)
            output(
                {
                    "ok": True,
                    "name": sandbox.name,
                    "displayUrl": display_url,
                    "width": width,
                    "height": height,
                    "environment": await sandbox.get_environment(),
                    "egressVerified": restricted,
                }
            )
        finally:
            await sandbox.disconnect()
        return

    name = str(request.get("name") or "")
    if not name:
        raise RuntimeError("CUA_SANDBOX_NAME_REQUIRED")

    if command == "destroy":
        try:
            await Sandbox.delete(
                name=name,
                api_key=None if local else os.environ.get("CUA_API_KEY"),
                local=local,
            )
        finally:
            if local:
                cleanup_egress(name)
        output({"ok": True})
        return
    if command == "desktop_endpoint":
        if not local:
            raise RuntimeError("AGENT_DESKTOP_ENDPOINT_LOCAL_ONLY")
        result = docker_run(
            "inspect", "--format",
            '{{(index (index .NetworkSettings.Ports "5901/tcp") 0).HostIp}}:'
            '{{(index (index .NetworkSettings.Ports "5901/tcp") 0).HostPort}}',
            f"{name}-control",
        )
        raw = result.stdout.strip()
        host, separator, port = raw.rpartition(":")
        if not separator or host not in ("127.0.0.1", "::1") or not port.isdigit():
            raise RuntimeError("AGENT_DESKTOP_ENDPOINT_NOT_LOOPBACK")
        output({"ok": True, "host": host, "port": int(port)})
        return
    if command == "suspend":
        await Sandbox.suspend(
            name=name,
            api_key=None if local else os.environ.get("CUA_API_KEY"),
            local=local,
        )
        output({"ok": True})
        return
    if command == "resume":
        sandbox = await Sandbox.resume(
            name=name,
            api_key=None if local else os.environ.get("CUA_API_KEY"),
            local=local,
        )
        try:
            output({"ok": True, "name": sandbox.name})
        finally:
            await sandbox.disconnect()
        return

    sandbox = await connect_sandbox(Sandbox, name, local)
    try:
        if command == "screenshot":
            encoded = await sandbox.screenshot_base64(format="png")
            output({"ok": True, "base64": encoded})
            return
        if command == "shell":
            result = await sandbox.shell.run(
                str(request.get("script") or ""),
                timeout=int(request.get("timeout") or 30),
            )
            output(
                {
                    "ok": True,
                    "stdout": result.stdout,
                    "stderr": result.stderr,
                    "returnCode": result.returncode,
                    "success": result.success,
                }
            )
            return
        if command == "read_file":
            path = str(request.get("path") or "")
            script = (
                "python3 -c 'import base64,sys;"
                "sys.stdout.write(base64.b64encode(open(sys.argv[1],\"rb\").read()).decode())' "
                + json.dumps(path)
            )
            result = await sandbox.shell.run(script, timeout=int(request.get("timeout") or 30))
            if not result.success:
                raise RuntimeError("CUA_READ_FILE_FAILED:" + str(result.stderr or "")[:300])
            output({"ok": True, "base64": result.stdout})
            return
        if command == "write_file":
            path = str(request.get("path") or "")
            encoded = str(request.get("base64") or "")
            data = base64.b64decode(encoded, validate=True)
            quoted_path = "'" + path.replace("'", "'\\''") + "'"
            parent = os.path.dirname(path) or "/tmp/artigen-workspace"
            quoted_parent = "'" + parent.replace("'", "'\\''") + "'"
            initialize = await sandbox.shell.run(
                "mkdir -p " + quoted_parent + " && : > " + quoted_path,
                timeout=int(request.get("timeout") or 60),
            )
            if not initialize.success:
                raise RuntimeError("CUA_WRITE_FILE_FAILED:" + str(initialize.stderr or "")[:300])
            # Shell.run has no stdin/file-upload API. Bounded heredoc chunks avoid
            # command-line argument limits while keeping the provider credential
            # and host filesystem outside the guest.
            # The Cua Docker runtime forwards each shell command through the
            # host process argument vector. Keep every encoded heredoc below
            # macOS/Docker ARG_MAX; generated images routinely exceed it when
            # sent as one 512 KiB command.
            chunk_size = 96 * 1024
            for offset in range(0, len(encoded), chunk_size):
                chunk = encoded[offset : offset + chunk_size]
                script = (
                    "base64 -d >> "
                    + quoted_path
                    + " <<'ARTIGEN_INPUT_EOF'\n"
                    + chunk
                    + "\nARTIGEN_INPUT_EOF"
                )
                result = await sandbox.shell.run(
                    script, timeout=int(request.get("timeout") or 60)
                )
                if not result.success:
                    raise RuntimeError(
                        "CUA_WRITE_FILE_FAILED:" + str(result.stderr or "")[:300]
                    )
            output({"ok": True, "bytes": len(data)})
            return
        if command == "actions":
            for action in request.get("actions") or []:
                action_type = str(action.get("type") or "")
                if action_type == "screenshot":
                    continue
                if action_type == "click":
                    await sandbox.mouse.click(
                        int(action.get("x") or 0),
                        int(action.get("y") or 0),
                        button=str(action.get("button") or "left"),
                    )
                elif action_type == "double_click":
                    await sandbox.mouse.double_click(
                        int(action.get("x") or 0), int(action.get("y") or 0)
                    )
                elif action_type == "move":
                    await sandbox.mouse.move(
                        int(action.get("x") or 0), int(action.get("y") or 0)
                    )
                elif action_type == "scroll":
                    await sandbox.mouse.scroll(
                        int(action.get("x") or 0),
                        int(action.get("y") or 0),
                        scroll_x=int(action.get("scroll_x") or action.get("delta_x") or 0),
                        scroll_y=int(action.get("scroll_y") or action.get("delta_y") or 0),
                    )
                elif action_type == "drag":
                    path = action.get("path") or []
                    if len(path) < 2:
                        raise RuntimeError("CUA_DRAG_PATH_INVALID")
                    await sandbox.mouse.drag(
                        int(path[0].get("x") or 0),
                        int(path[0].get("y") or 0),
                        int(path[-1].get("x") or 0),
                        int(path[-1].get("y") or 0),
                    )
                elif action_type == "type":
                    await sandbox.keyboard.type(str(action.get("text") or ""))
                elif action_type == "keypress":
                    await sandbox.keyboard.keypress(action.get("keys") or [])
                elif action_type == "wait":
                    await asyncio.sleep(min(10.0, max(0.0, float(action.get("seconds") or 1))))
                else:
                    raise RuntimeError("CUA_ACTION_UNSUPPORTED:" + action_type)
            output({"ok": True})
            return
        raise RuntimeError("CUA_BRIDGE_COMMAND_UNSUPPORTED:" + command)
    finally:
        await sandbox.disconnect()


try:
    asyncio.run(main())
except Exception as error:
    output(
        {
            "ok": False,
            "error": str(error)[:500],
            "code": getattr(error, "code", None) or error.__class__.__name__,
        }
    )
    sys.exit(1)
