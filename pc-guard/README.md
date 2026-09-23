# PC Guard 🛡

Parental time-limit tool for Windows. You control your kid's PC time through Telegram — no app windows, no tray icons, just a background process.

## What it does

| Feature | How it works |
|---|---|
| **PC boot alert** | You get a Telegram message the moment the PC turns on |
| **Time limits** | You reply `/allow 60` → he gets 60 minutes, sees a notification |
| **Countdown warnings** | 5 minutes before time's up: warning on his screen + Telegram |
| **Time's up** | Alert on both sides. You choose: `/shutdown` or `/extend 30` |
| **Remote shutdown** | `/shutdown` turns off the PC with a 30-second on-screen warning |
| **Remote lock** | `/lock` locks the screen immediately |
| **Send messages** | `/msg Come to dinner!` shows a popup on his screen |
| **Offline detection** | If the program is killed, it restarts in 10 seconds and alerts you |

## Setup (15 minutes, one time)

### Step 1: Create a Telegram bot (2 minutes)

1. Open Telegram on your phone
2. Search for **@BotFather** and start a chat
3. Send `/newbot`
4. Give it a name (anything, like "PC Guard")
5. Give it a username (must end in `bot`, like `my_pc_guard_bot`)
6. **Copy the token** BotFather gives you — looks like `123456:ABC-DEF...`

### Step 2: Get your chat ID (1 minute)

1. Search for **@userinfobot** on Telegram and start a chat
2. It replies with your info — **copy the number next to "Id"**

### Step 3: Install Python on the son's PC (5 minutes)

1. Go to https://www.python.org/downloads/
2. Download the latest Python (3.10 or newer)
3. **Important:** Check the box ✅ "Add Python to PATH" during installation
4. Finish the install

### Step 4: Configure PC Guard (2 minutes)

1. Copy the entire `pc-guard` folder to the son's PC (e.g. `C:\pc-guard`)
2. Copy `config.example.ini` to `config.ini` (the installer does this for you if it's missing), then open `config.ini` in Notepad
3. Replace `PASTE_YOUR_BOT_TOKEN_HERE` with the token from Step 1
4. Replace `PASTE_YOUR_CHAT_ID_HERE` with the number from Step 2
5. Save and close

### Step 5: Install and start (2 minutes)

1. Right-click the Windows Start button → **"Terminal (Admin)"** or **"PowerShell (Admin)"**
2. Navigate to the folder:
   ```
   cd C:\pc-guard
   ```
3. Run the installer:
   ```
   powershell -ExecutionPolicy Bypass -File install.ps1
   ```
4. Check Telegram — you should see "🟢 PC turned on"

**That's it.** PC Guard is now running and will start automatically on every boot.

## Telegram Commands

| Command | What it does |
|---|---|
| `/allow 60` | Grant 60 minutes of play time |
| `/timeleft` | Check remaining minutes |
| `/extend 30` | Add 30 more minutes |
| `/shutdown` | Shut down PC (30-sec warning on screen) |
| `/cancelshutdown` | Cancel a pending shutdown |
| `/lock` | Lock the screen now |
| `/status` | PC uptime, timer, last heartbeat |
| `/msg Hello!` | Show a popup message on his screen |
| `/history` | Today's log entries |

## How "offline detection" works

The program writes a heartbeat timestamp every 5 minutes. If it's killed:

- **Task Scheduler restarts it in 10 seconds** (configured during install)
- On restart, it sees the gap and sends: *"⚠️ PC Guard was offline for ~X minutes!"*
- If he manages to fully disable the scheduled task (needs admin-level knowledge), you'll notice because `/status` stops responding — no heartbeat, no replies

This is the honest limit: since he's an administrator on the PC, a very determined and technical kid could eventually disable it. But it catches the normal cases (killing the process, ending it in Task Manager).

## To uninstall

Run as admin:
```
powershell -ExecutionPolicy Bypass -File uninstall.ps1
```

## Files

| File | Purpose |
|---|---|
| `guard.py` | The main program |
| `config.example.ini` | Template — copy to `config.ini` |
| `config.ini` | Your bot token & chat ID (edit this — never committed to git) |
| `install.ps1` | One-time installer (run as admin) |
| `uninstall.ps1` | Removes everything |
| `guard.log` | Activity log (created automatically) |
| `state.json` | Timer state (created automatically) |
