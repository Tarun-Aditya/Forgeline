#!/usr/bin/env python3
"""Install the factory's enforcement as Claude Code *managed* settings.

Project hooks in .claude/settings.json can be edited by anyone with write access
to the repo. Managed settings are read from a system folder only an administrator
can write, sit above every user and project setting, and (with
allowManagedHooksOnly) stop any other hook from running. This puts the factory
hooks, its policy and a few permission denials there.

  install.py                 show what would be installed (dry run)
  install.py --apply         install; needs administrator rights
  install.py --default-mode auto|acceptEdits|plan   set the default permission mode (auto lets the
                               classifier approve routine actions; the hooks and deny rules still stop the rest)
  install.py --sandbox       also turn the OS sandbox on, failing closed (macOS, Linux, WSL2)
  install.py --uninstall     remove what this installer wrote (add --apply to do it)
  install.py --dest-root DIR use DIR instead of the system folder (staging and tests)

It writes a drop-in file, managed-settings.d/50-software-factory.json, so it never
overwrites your organization's own managed-settings.json. Check the result with
/status in Claude Code: the Setting sources line shows the managed file.

Delivering through MDM (Jamf, Intune) or the claude.ai console instead? Use the
generated JSON as the policy body and place the factory/ folder with your own tooling.
"""

import argparse
import json
import os
import platform
import shutil
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
FACTORY = os.path.dirname(HERE)
REPO = os.path.dirname(FACTORY)

SYSTEM_DIRS = {
    "Darwin": "/Library/Application Support/ClaudeCode",
    "Linux": "/etc/claude-code",
    "Windows": r"C:\Program Files\ClaudeCode",
}
DROPIN = os.path.join("managed-settings.d", "50-software-factory.json")

COPIES = [
    (os.path.join(REPO, ".claude", "hooks", "factory_hooks.py"), os.path.join("factory", "hooks", "factory_hooks.py")),
    (os.path.join(FACTORY, "scripts", "factory_lib.py"), os.path.join("factory", "hooks", "factory_lib.py")),
    (os.path.join(FACTORY, "policy.json"), os.path.join("factory", "policy.json")),
]

DENY = [
    "Read(./.env)",
    "Read(./.env.*)",
    "Read(**/*.pem)",
    "Read(~/.ssh/**)",
    "Read(~/.aws/**)",
    "Bash(git push *)",
    "Bash(npm publish *)",
    "Bash(docker push *)",
    "Bash(terraform apply *)",
    "Bash(kubectl apply *)",
]


def build_settings(hook_path, python, sandbox, default_mode=None):
    command = f'{python} -I "{hook_path}"'
    settings = {
        "allowManagedHooksOnly": True,
        "allowManagedPermissionRulesOnly": True,
        "permissions": {"disableBypassPermissionsMode": "disable", "deny": DENY},
        "hooks": {
            "PreToolUse": [
                {"matcher": "Edit|Write|MultiEdit|NotebookEdit",
                 "hooks": [{"type": "command", "command": f"{command} files"}]},
                {"matcher": "Bash",
                 "hooks": [{"type": "command", "command": f"{command} bash"}]},
            ]
        },
    }
    if default_mode:
        settings["permissions"]["defaultMode"] = default_mode
    if sandbox:
        settings["sandbox"] = {"enabled": True, "failIfUnavailable": True}
    return settings


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawTextHelpFormatter)
    parser.add_argument("--apply", action="store_true")
    parser.add_argument("--sandbox", action="store_true")
    parser.add_argument("--default-mode", choices=["auto", "acceptEdits", "plan", "default"])
    parser.add_argument("--uninstall", action="store_true")
    parser.add_argument("--dest-root")
    args = parser.parse_args()

    system = platform.system()
    root = args.dest_root or SYSTEM_DIRS.get(system)
    if not root:
        sys.exit(f"error: no known managed settings folder for {system}; pass --dest-root")
    root = os.path.abspath(root) if args.dest_root else root
    python = "python" if system == "Windows" else "python3"
    hook_path = os.path.join(root, "factory", "hooks", "factory_hooks.py")
    dropin = os.path.join(root, DROPIN)
    mode = "APPLY" if args.apply else "DRY RUN"

    if args.uninstall:
        print(f"[{mode}] remove {dropin}")
        print(f"[{mode}] remove {os.path.join(root, 'factory')}")
        if args.apply:
            if os.path.isfile(dropin):
                os.remove(dropin)
            shutil.rmtree(os.path.join(root, "factory"), ignore_errors=True)
        return

    settings = build_settings(hook_path, python, args.sandbox, args.default_mode)
    for src, rel in COPIES:
        print(f"[{mode}] copy {os.path.relpath(src, REPO)} -> {os.path.join(root, rel)}")
    print(f"[{mode}] write {dropin}")
    print(json.dumps(settings, indent=2))

    if not args.apply:
        print("\nDry run only. Re-run with --apply (as an administrator) to install.")
        return
    try:
        for src, rel in COPIES:
            dest = os.path.join(root, rel)
            os.makedirs(os.path.dirname(dest), exist_ok=True)
            shutil.copy2(src, dest)
        os.makedirs(os.path.dirname(dropin), exist_ok=True)
        with open(dropin, "w", encoding="utf-8") as fh:
            json.dump(settings, fh, indent=2)
            fh.write("\n")
    except PermissionError as err:
        sys.exit(f"error: {err}. Run as an administrator (sudo on macOS and Linux).")
    print(f"\nInstalled. Start Claude Code and run /status: Setting sources should list the managed file.")


if __name__ == "__main__":
    main()
