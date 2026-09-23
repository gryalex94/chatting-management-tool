# PC Guard 🛡

Parental time-limit tool for Windows. You control your kid's PC time through Telegram — no app windows, no tray icons, just a background process.

## What it does

| Feature | How it works |
|---|---|
| **PC boot alert** | You get a Telegram message the moment the PC turns on |
| **Time limits** | You reply `/allow 60` → he gets 60 minutes, sees a message on screen |
| **Countdown warnings** | 5 minutes before time's up: warning on his screen + Telegram |
| **Time's up** | He gets 1 minute to save, then the screen locks — and locks again every time he signs back in — until you send `/extend 30`, `/allow 60` or `/stoptimer`. Works even with no internet. |
| **Restart-proof timer** | Used time is saved every few seconds, so restarting the PC doesn't reset the timer. Changing the PC's clock or time zone doesn't help either. |
| **Remote shutdown** | `/shutdown` turns off the PC with a 30-second on-screen warning |
| **Remote lock** | `/lock` locks the screen immediately |
| **Send messages** | `/msg Come to dinner!` shows a popup on his screen |
| **Offline detection** | If the program is killed, it restarts within a minute and alerts you |
| **Takeover alert** | If someone else gets hold of your bot and blocks it, PC Guard takes it back and tells you |

## Before you start

- **Your son's Windows account must be a *standard* account with a password**, not an administrator. (Settings → Accounts → Family & other users → his account → Change account type → Standard user.) An administrator can switch off anything, including PC Guard. Without a password, the lock screen is just one click away.
- You need an administrator account on that PC (yours) to install.

## Setup (15 minutes, one time)

### Step 1: Create a Telegram bot (2 minutes)

1. Open Telegram on your phone
2. Search for **@BotFather** and start a chat
3. Send `/newbot`
4. Give it a name (anything, like "PC Guard")
5. Give it a username (must end in `bot`, like `my_pc_guard_bot`)
6. **Copy the token** BotFather gives you — looks like `123456:ABC-DEF...`. Keep it secret: anyone with it can control the bot.

### Step 2: Get your chat ID (1 minute)

1. Search for **@userinfobot** on Telegram and start a chat
2. It replies with your info — **copy the number next to "Id"**
3. Open a chat with **your new bot** and press **Start** (a bot can't message you until you do)

### Step 3: Install Python on the son's PC — for all users (5 minutes)

PC Guard runs with full system rights, so it only works with a Python that just administrators can change. That means Python must be installed **for all users**:

1. Go to https://www.python.org/downloads/ and download the latest Python (3.10 or newer)
2. Run it. Tick ✅ **"Add Python to PATH"**, then click **"Customize installation"** → **Next**
3. Tick ✅ **"Install Python for all users"** (the folder changes to `C:\Program Files\Python3xx`)
4. Click **Install** and finish

If Python was already installed only for your own account, the installer will stop and tell you. Just install it again as above.

### Step 4: Configure PC Guard (2 minutes)

1. Copy the `pc-guard` folder to the son's PC (for example to your Downloads folder)
2. Right-click the Windows Start button → **"Terminal (Admin)"** or **"PowerShell (Admin)"**, go to the folder and run the installer once — it creates `config.ini` for you and stops:
   ```
   cd $HOME\Downloads\pc-guard
   powershell -ExecutionPolicy Bypass -File install.ps1
   ```
3. Open `config.ini` in Notepad
4. Replace `PASTE_YOUR_BOT_TOKEN_HERE` with the token from Step 1
5. Replace `PASTE_YOUR_CHAT_ID_HERE` with the number from Step 2
6. Check `utc_offset_hours` (your time zone; the installer filled it in from the PC)
7. Save and close

### Step 5: Install and start (2 minutes)

In the same admin window, run the installer again:
```
powershell -ExecutionPolicy Bypass -File install.ps1
```

It will:
- copy PC Guard to `C:\Program Files\PCGuard`, where only administrators can change it
- move your `config.ini` into `C:\Program Files\PCGuard\data`, which only administrators can open (so your son can't read the bot token), and **delete the copy in the download folder**
- start PC Guard now and at every boot

Check Telegram — you should see "🟢 PC turned on".

**That's it.** PC Guard is now running and will start automatically on every boot.

**Upgrading from an older version** that lived in `C:\pc-guard`? Copy your old `config.ini` into the new download folder, add the new lines from `config.example.ini` if you like, and run the installer. Afterwards delete the old `C:\pc-guard` folder — it still contains your bot token.

## Changing settings later

1. Click Start, type **Notepad**, right-click it → **Run as administrator**
2. File → Open → `C:\Program Files\PCGuard\data\config.ini` (set the file type to "All Files")
3. Change what you need, save
4. Restart the PC (or run `install.ps1` again) so PC Guard picks up the change

Useful settings in `config.ini`:

| Setting | What it does |
|---|---|
| `allowed_user_ids` | Telegram IDs of the people allowed to give commands, separated by commas (e.g. you and your partner). If empty, only your private chat with the bot is accepted. |
| `utc_offset_hours` | Your time zone in hours from UTC. Change it when the clocks go forward/back if you want exact times in the log. |
| `new_day_starts_at_hour` | When the timer is cleared for a new day (default 4 AM, so staying up past midnight doesn't reset it) |
| `time_up_action` | `lock` (default: sign-in screen, his programs stay open) or `logoff` (signs him out, unsaved work is lost) |
| `warning_minutes` | How early the "time almost up" warning comes |

## Telegram Commands

| Command | What it does |
|---|---|
| `/allow 60` | Grant 60 minutes of play time |
| `/timeleft` | Check remaining minutes |
| `/extend 30` | Add 30 more minutes (also unlocks after time is up) |
| `/stoptimer` | Stop the timer — no limit, the screen stops locking |
| `/shutdown` | Shut down PC (30-sec warning on screen) |
| `/cancelshutdown` | Cancel a pending shutdown |
| `/lock` | Lock the screen now |
| `/status` | PC uptime, who is signed in, timer, last heartbeat |
| `/msg Hello!` | Show a popup message on his screen |
| `/history` | Today's log entries |

Commands are only accepted from you (see `allowed_user_ids` above). Messages from anyone else are ignored.

## How it works (the short version)

- **Timer:** play time is counted by the PC's internal stopwatch, not the clock on the screen, and saved to disk every few seconds. Restarting, changing the time or changing the time zone doesn't give extra time. Time while the PC is asleep isn't counted. The timer is cleared once a day (at 4 AM by default).
- **Time's up without internet:** the lock is done by the PC itself. Telegram is only needed to receive your commands, so pulling the network cable doesn't stop the lock.
- **Messages on his screen:** PC Guard runs as the Windows "SYSTEM" account in the background, which has no screen of its own. It uses a built-in Windows feature (the same one behind the `msg` command) to show message boxes on, lock, or sign out the session of whoever is sitting at the PC. If a message can't be shown (for example in a full-screen game), the lock still happens.
- **No internet:** PC Guard keeps trying to reach Telegram, waiting a bit longer each time (up to 5 minutes). When it gets through after a long break (30+ minutes), it tells you.
- **Takeover protection:** if someone who has your bot token redirects the bot elsewhere (a "webhook"), PC Guard switches it back and warns you. If that happens, get a new token: in @BotFather send `/revoke`, then put the new token in `config.ini`.
- **Privacy of the token:** the bot token is never written to the log, and the settings, log and timer files can only be opened by administrators.

## How "offline detection" works

The program writes a heartbeat timestamp every 5 minutes. If it's killed:

- **Task Scheduler restarts it within a minute** (configured during install)
- On restart, it sees the gap and sends: *"⚠️ PC Guard was offline for ~X minutes!"*
- If someone fully disables the scheduled task (needs an administrator), you'll notice because `/status` stops responding — no heartbeat, no replies

This is the honest limit: an administrator on the PC can eventually disable it. That's why your son's account should be a standard account.

## To uninstall

Run as admin, from the download folder:
```
powershell -ExecutionPolicy Bypass -File uninstall.ps1
```
This stops PC Guard and deletes `C:\Program Files\PCGuard` (settings, log and timer included).

## Files

| File | Purpose |
|---|---|
| `guard.py` | The main program |
| `config.example.ini` | Template — the installer turns it into `config.ini` |
| `config.ini` | Your bot token & chat ID (never committed to git; moved into `C:\Program Files\PCGuard\data` on install) |
| `install.ps1` | Installer (run as admin; run again to update) |
| `uninstall.ps1` | Removes everything |
| `requirements.txt` | Python libraries PC Guard needs (just `requests`) |

After installing, `C:\Program Files\PCGuard\data` also holds `guard.log` (activity log) and `state.json` (timer), both created automatically.
