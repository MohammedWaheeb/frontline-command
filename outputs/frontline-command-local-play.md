# Frontline Command: local play

The current F16 candidate runs on Apple Silicon macOS. Complete release acceptance is still pending. Solo play needs no online account; multiplayer profiles belong to the local host.

Open the current preview at [http://127.0.0.1:8088](http://127.0.0.1:8088).

To start your own copy, run this in Terminal:

```sh
cd '/Users/mohammedkalouti/Documents/Codex/2026-09-27/i/work/playable-release-integration-v1/frontend-16/source/dist/frontline-darwin-arm64'
sh Play.command -addr 127.0.0.1:0 -data ./data-local-038 -state-updates-hz 10
```

Port `0` chooses a free port. Open the actual URL printed in Terminal. Stop this host with Ctrl-C.

Keep the same browser and port on later launches to retain browser saves, replays and settings; replace `:0` with the printed port when you restart.

- For solo combat, choose **Skirmish**, select a **Battlefield**, faction, **AI commanders**, difficulty and starting funds, then **Deploy forces**. **Field training** and **Campaign** are also available from the command center.
- During solo play, click **Menu** to pause. Choose **Save operation**, then **Resume operation**. From the command center, **Load operation** lists browser saves; choose **Load** to resume one.
- In the paused menu, choose **Archive replay**. Return to the command center and open **Replay archive**, then **Watch**. Archive rows also provide **Export**.
- Choose **Editor**, then **Start from installed map** to create an editable copy. Use **Save draft**, **Validate** and **Test play**; the battle menu provides **Return to editor**. Installed originals remain intact.

The package contains its native executable, browser client and content; Go and Node are not needed to play. Keep `data-local-038` for host records. Saves and replays from older incompatible simulation versions remain exportable for their matching package.
