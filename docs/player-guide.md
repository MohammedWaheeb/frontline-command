# Frontline Command player guide

Launch the package and open its local address in your browser. The package's
README.md covers installation, LAN hosting and backups. The game runs locally;
bots do not need an AI account or internet service.

## Your first operation

Choose **Field training** for the five tutorials. Complete each lesson to unlock
the next. **Practice range** lets you explore units without competitive rewards.

For a battle against bots, choose **Skirmish** or **Deploy to skirmish**:

1. Select a battlefield and your faction.
2. Choose the number of **AI commanders** and their difficulty. A four-position
   battlefield supports you and up to three bots.
3. With three bots, select **Two teams of two** if you want an allied bot.
4. Choose **Deploy forces**. Orders begin after the countdown.

Choosing no AI creates a solo field-practice game. The three default battlefields
are **Copper Junction** (2 commanders), **Industrial Valley** (4 commanders) and
**Port Outskirts** (4 commanders).

## Build and command

Your engineering rig constructs buildings. Select it or choose **Build**, then
choose a structure from the production panel and place it on the battlefield.
Keep supply routes open and watch available credits, Supply and power. Build a
supply center and use haulers to bring resources back from supply fields.

Production tabs let you manage facilities while keeping combat units selected.
Choose a facility to inspect its queue. Click a queued item to cancel it. The
panel explains unmet requirements; an order preview does not reserve resources.

These are the default controls. **Options** and **Help → controls** show your
saved bindings, including any remapping or classic mouse preset.

| Action | Default input |
|---|---|
| Select units | Left-click or drag a selection box |
| Add or remove from selection | Hold Shift while selecting |
| Select the same unit type on screen | Double-click or T |
| Move or interact with a target | Right-click |
| Attack-move | A, then click the destination |
| Stop / hold / guard | S / H / G |
| Store / recall a control group | Ctrl + 1–9 / 1–9 |
| Queue a supported order | Hold Shift while issuing it |
| Center on selection / latest alert | Home / Space |
| Pan the camera | Arrow keys or middle-button drag |
| Zoom | Mouse wheel or + / − |
| Cancel targeting, then open the menu | Escape |

The bottom command panel scrolls when there are more actions than fit. Its
edge indicators show actions above or below. **Range** cycles a selected actor's
weapon, sight and detection overlays. A remembered building marked **LAST SEEN**
is old information; it is not a currently visible target.

Aircraft need compatible service slots, ammunition and endurance. **Return**
sends them for service. **Rebase** changes their home to an owned compatible
facility with free slots. Unit details show their current status and remaining
resources. Strategic operations require their matching structure and charge;
follow the target selection and confirmation controls before committing one.

## Save, resume and replay

In solo play, open the menu and choose **Save operation**. Resume it through
**Load operation**, or use **Continue** for the newest local save. Choose
**Archive replay** to preserve the operation's recorded commands, then open it
in **Replay archive**. Replay controls cannot issue gameplay orders.

Use **Export** in the save or replay archive before moving browsers, clearing
browser storage or changing computers. Import the file on the other browser
using the matching game/content version. Browser records and the host's data
directory are separate; back up both if you use both kinds of storage.

## One to four commanders on LAN

Start the package's **Host-LAN** launcher on one computer. Everyone opens a join
address printed by that host, then selects **Multiplayer** and creates or restores
their own local profile. The host computer can play too. Keep the host running
throughout the match.

1. Create an operation with a map that has enough starting positions. Choose
   **Custom**, **1 vs 1**, **2 vs 2** or **Free for all**, as appropriate.
2. Other players choose **Join operation**, or use **Join by ID** with the lobby
   ID and its private access code when applicable.
3. The host can fill available custom slots with **Add AI commander**, choosing
   the bot's faction, difficulty and team. The total is at most four commanders.
4. Check factions, teams and the map. Everyone selects **Ready to deploy** after
   their assets load. Configuration changes clear readiness.
5. The host selects **Start operation** once everyone is ready.

Opening the multiplayer menu does not pause other players. Custom/co-op shared
pause uses the explicit host controls when enabled. After a brief disconnection,
use **Reconnect to operation** with the same profile. For a completed match,
use its recorded result and replay controls.

## Cooperative scenarios

Choose **Co-op** from the main menu and create or restore your local host profile.
Choose **Convoy Union** or **Twin Outposts**, a difficulty, and either another human
or an AI ally. **Create co-op lobby** opens the shared lobby. With a human ally,
share its lobby ID and private access code; both players mark ready before the
host starts. Each commander owns their own forces and shares allied vision.

The host records shared checkpoints. After leaving, use **Co-op → Shared
checkpoints**, select the host save and your saved commander, then choose
**Resume co-op lobby**. Every saved human commander must rejoin and mark ready;
the match continues from its saved tick. Preserve the host's data directory to
retain these checkpoints.

## Make the display comfortable

Use **Options** to adjust interface scale, audio, captions, team-color palette,
motion and flashing. Larger UI text takes more battlefield space; the command
and information panels remain scrollable. Text fields and chat keep keyboard
input without sending battlefield shortcuts.

**Installed content** manages offline packs. Complete installation while the
local host is reachable, then keep that browser's storage. Solo offline play
uses localhost's cached game; a remote LAN address still needs the active host.
