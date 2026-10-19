# Frontline Command: local play

The local package is for Apple Silicon macOS. Play in a desktop browser with a
keyboard and mouse. Campaign and Editor are hidden; three skirmish battlefields,
five tutorials, practice, both co-op scenarios and multiplayer are available.

The current local package is `dist/frontline-readiness-darwin-arm64` in this project. Open `Play.command`
and visit the local URL printed in Terminal (normally `http://127.0.0.1:8080`).
Stop the host with Ctrl-C. Go, Node, Blender and an online account are not needed.

To choose another local port, run the executable directly:

```sh
cd '/Users/mohammedkalouti/Documents/Codex/2026-09-27/i/dist/frontline-readiness-darwin-arm64'
./frontline -addr 127.0.0.1:5193 -data ./data -static ./client -maps ./content/maps -missions ./content/missions
```

Keep the same browser and port to retain browser saves, replays and settings.
Use **Export** before changing browser or origin. Keep the stopped host's `data/`
directory separately when upgrading, and retain old packages for incompatible archives.

- Start with **Field training**, or choose **Skirmish**, a battlefield, faction,
  AI commanders and difficulty, then **Deploy forces**.
- Open **Menu → Save operation** during solo play; use **Load operation** to resume.
- Choose **Archive replay**, then **Replay archive → Watch**. Wait for the saved
  confirmation before leaving the operation.
- Choose **Co-op** for Convoy Union or Twin Outposts, with a human or AI ally.
- For other computers on the same network, run **Host-LAN.command** and share
  its printed join address. Normal play binds only to this computer.

See [the player guide](../docs/player-guide.md) for controls, shared checkpoints,
LAN profiles and backups. See [release evidence](../work/release-readiness-20261013/REPORT.md)
for tested scope and remaining platform/human limits. No public deployment is included.
