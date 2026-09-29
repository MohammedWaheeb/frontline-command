# Frontline Command local package

The [player guide](player-guide.md) covers first battles, controls, bots, saves
and joining a one-to-four-commander LAN operation.

Open `Play.command` on macOS/Linux, or `Play.cmd` on Windows, then visit
`http://127.0.0.1:8080`. The package contains a native executable for the platform
listed in `version.json`; it does not run on a different operating system or CPU.
On Linux a terminal can run `sh Play.command`. Stop the server with Ctrl-C.

For multiplayer on the same network, use `Host-LAN.command` or `Host-LAN.cmd`.
The terminal prints each local join address. Allow the executable through the
host firewall if the operating system asks. LAN hosting is an explicit option;
the normal launcher listens only on this computer. Do not port-forward it as a
public service. No public deployment or public account service is included.

The package needs no Go, Node, Claude, Blender, AI key or external database.
Its Go server stores local profiles, shared saves, maps and match history in
`data/`. Keep that directory when upgrading. Do not run two hosts against the
same data directory. Browser solo saves and settings are stored separately by
browser and origin; use the game's export/backup controls before changing
browser, port or computer. Preserve incompatible files for a matching version.

After caching the selected mode and its required packs, solo play can run offline
on localhost. A remote `http://192.168…` LAN address may not support service
workers because browsers restrict them to secure origins. LAN play stays
connected to the host. Stopping the host interrupts active multiplayer matches.

`version.json` records source and simulation versions. `package-files.json`
records SHA-256 hashes and byte sizes; `licenses/` contains dependency notices.
Building a package is a packaging check, not proof that gameplay, accessibility,
content, balance and performance acceptance have passed. Consult the release
evidence supplied with the finished release.

Before upgrading, stop the host and export browser saves/replays plus ordinary
backups; keep the separate private local sign-in key if you use a host profile.
Copy the stopped host's complete `data/` directory to the new package if you want
to keep those host records. Do not copy a live SQLite database or run old and new
hosts against one data directory. Keep the old package and a separate data backup
for rollback. The build does not automatically move data from its timestamped
previous package into the new one.

Simulation 0.3.4 deliberately rejects incompatible 0.3.3 saves/replays; files
remain exportable for the matching old version. There is no automatic simulation
save conversion. Host database schema updates are a separate mechanism.

Install the new offline pack while connected after upgrading. New packages have
content-derived pack versions, even when the base pack ID remains the same.
A failed or canceled install leaves the prior completed cache usable. Completed
older caches remain stored for explicit rollback; they are not merged with the
new version during offline fallback. Browser storage limits and cache removal
remain browser-controlled. Reinstalling an unchanged completed pack does not
redownload its files.
