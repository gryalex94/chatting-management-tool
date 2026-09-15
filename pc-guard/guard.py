"""
PC Guard - Parental time-limit tool with Telegram control.

Runs as a background process (no window, no tray icon).
Parent controls everything through a Telegram bot.

Commands:
  /allow <minutes>     - Grant play time (e.g. /allow 60)
  /timeleft            - Check remaining minutes
  /extend <minutes>    - Add more time to current session
  /shutdown            - Shut down PC (30-second warning on screen)
  /cancelshutdown      - Cancel a pending shutdown
  /lock                - Lock the screen immediately
  /status              - PC uptime, timer info, heartbeat
  /msg <text>          - Show a message on his screen
  /history             - Today's log entries
  /start               - Show all commands
"""

import configparser
import ctypes
import datetime
import json
import logging
import os
import pathlib
import subprocess
import sys
import threading
import time

import requests

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------

SCRIPT_DIR = pathlib.Path(__file__).resolve().parent
CONFIG_PATH = SCRIPT_DIR / "config.ini"
LOG_PATH = SCRIPT_DIR / "guard.log"
STATE_PATH = SCRIPT_DIR / "state.json"

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

config = configparser.ConfigParser()
config.read(CONFIG_PATH)

BOT_TOKEN = config.get("telegram", "bot_token", fallback="")
CHAT_ID = config.get("telegram", "chat_id", fallback="")
HEARTBEAT_INTERVAL = config.getint("settings", "heartbeat_minutes", fallback=5)
WARNING_MINUTES = config.getint("settings", "warning_minutes", fallback=5)
PC_NAME = config.get("settings", "pc_name", fallback="PC")

API_BASE = f"https://api.telegram.org/bot{BOT_TOKEN}"

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------

logging.basicConfig(
    filename=str(LOG_PATH),
    level=logging.INFO,
    format="%(asctime)s  %(levelname)s  %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
log = logging.getLogger("guard")

# Also log to stderr when running interactively (useful for first-time setup)
if sys.stderr.isatty():
    logging.getLogger().addHandler(logging.StreamHandler())

# ---------------------------------------------------------------------------
# State (persisted to state.json)
# ---------------------------------------------------------------------------

state = {
    "allowed_minutes": 0,
    "session_start": None,
    "warned": False,
    "expired_notified": False,
    "boot_time": None,
    "last_heartbeat": None,
    "last_update_id": 0,
}


def save_state():
    try:
        STATE_PATH.write_text(json.dumps(state, indent=2))
    except Exception as exc:
        log.error("Could not save state: %s", exc)


def load_state():
    global state
    if STATE_PATH.exists():
        try:
            saved = json.loads(STATE_PATH.read_text())
            state.update(saved)
        except Exception:
            pass


# ---------------------------------------------------------------------------
# Telegram helpers
# ---------------------------------------------------------------------------

def tg_send(text: str, parse_mode: str = "HTML") -> dict | None:
    """Send a message to the parent on Telegram."""
    try:
        resp = requests.post(
            f"{API_BASE}/sendMessage",
            json={"chat_id": CHAT_ID, "text": text, "parse_mode": parse_mode},
            timeout=15,
        )
        return resp.json()
    except Exception as exc:
        log.error("Telegram send failed: %s", exc)
        return None


def tg_get_updates(offset: int = 0) -> list:
    """Long-poll for new Telegram messages."""
    try:
        resp = requests.get(
            f"{API_BASE}/getUpdates",
            params={"offset": offset, "timeout": 10},
            timeout=20,
        )
        data = resp.json()
        if data.get("ok"):
            return data["result"]
    except Exception as exc:
        log.error("Telegram poll failed: %s", exc)
    return []


# ---------------------------------------------------------------------------
# Windows helpers
# ---------------------------------------------------------------------------

def shutdown_pc():
    subprocess.run(
        ["shutdown", "/s", "/t", "30", "/c",
         "PC will shut down in 30 seconds. Save your work!"],
        shell=True,
    )


def cancel_shutdown():
    subprocess.run(["shutdown", "/a"], shell=True)


def lock_screen():
    ctypes.windll.user32.LockWorkStation()


def show_toast(title: str, message: str):
    """Show a Windows 10/11 toast notification via PowerShell."""
    # Escape single quotes for PowerShell
    title_safe = title.replace("'", "''")
    message_safe = message.replace("'", "''")
    ps_script = f"""
Add-Type -AssemblyName System.Windows.Forms
$balloon = New-Object System.Windows.Forms.NotifyIcon
$balloon.Icon = [System.Drawing.SystemIcons]::Information
$balloon.BalloonTipTitle = '{title_safe}'
$balloon.BalloonTipText = '{message_safe}'
$balloon.Visible = $true
$balloon.ShowBalloonTip(10000)
Start-Sleep -Seconds 6
$balloon.Dispose()
"""
    try:
        subprocess.Popen(
            ["powershell", "-WindowStyle", "Hidden", "-Command", ps_script],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
    except Exception as exc:
        log.error("Toast notification failed: %s", exc)


def show_popup(title: str, message: str):
    """Show a blocking Windows message box in a separate thread."""

    def _popup():
        ctypes.windll.user32.MessageBoxW(0, message, title, 0x40)

    threading.Thread(target=_popup, daemon=True).start()


def get_uptime() -> str:
    boot = datetime.datetime.fromisoformat(state["boot_time"])
    delta = datetime.datetime.now() - boot
    hours, remainder = divmod(int(delta.total_seconds()), 3600)
    minutes, _ = divmod(remainder, 60)
    return f"{hours}h {minutes}m"


# ---------------------------------------------------------------------------
# Timer logic
# ---------------------------------------------------------------------------

def minutes_left() -> int:
    if not state.get("session_start"):
        return 0
    start = datetime.datetime.fromisoformat(state["session_start"])
    elapsed = (datetime.datetime.now() - start).total_seconds() / 60
    return max(0, int(state["allowed_minutes"] - elapsed))


# ---------------------------------------------------------------------------
# Command handlers
# ---------------------------------------------------------------------------

HELP_TEXT = (
    "🛡 <b>PC Guard</b>\n\n"
    "/allow &lt;minutes&gt; — Grant play time\n"
    "/timeleft — Remaining time\n"
    "/extend &lt;minutes&gt; — Add more time\n"
    "/shutdown — Shut down PC (30 s warning)\n"
    "/cancelshutdown — Cancel pending shutdown\n"
    "/lock — Lock screen now\n"
    "/status — PC info &amp; uptime\n"
    "/msg &lt;text&gt; — Show a message on screen\n"
    "/history — Today's log"
)


def handle_command(text: str) -> str | None:
    """Process a Telegram command. Returns the reply text, or None to ignore."""
    parts = text.strip().split()
    cmd = parts[0].lower().split("@")[0]  # strip @botname suffix

    # --- /start ---
    if cmd == "/start":
        return HELP_TEXT

    # --- /allow <minutes> ---
    if cmd == "/allow":
        if len(parts) < 2:
            return "Usage: /allow &lt;minutes&gt;\nExample: /allow 60"
        try:
            mins = int(parts[1])
        except ValueError:
            return "That's not a number. Example: /allow 60"
        if mins < 1 or mins > 480:
            return "Pick between 1 and 480 minutes."

        state["allowed_minutes"] = mins
        state["session_start"] = datetime.datetime.now().isoformat()
        state["warned"] = False
        state["expired_notified"] = False
        save_state()

        show_toast("⏱ Time granted",
                   f"You have {mins} minutes. Warning comes {WARNING_MINUTES} min before the end.")
        log.info("Allowed %d minutes", mins)
        return (f"✅ Granted <b>{mins} minutes</b>. Timer started.\n"
                f"Warning at {WARNING_MINUTES} min left.")

    # --- /extend <minutes> ---
    if cmd == "/extend":
        if not state.get("session_start"):
            return "No active session. Use /allow first."
        if len(parts) < 2:
            return "Usage: /extend &lt;minutes&gt;"
        try:
            extra = int(parts[1])
        except ValueError:
            return "That's not a number."
        if extra < 1 or extra > 240:
            return "Pick between 1 and 240 minutes."

        state["allowed_minutes"] += extra
        state["warned"] = False
        state["expired_notified"] = False
        save_state()

        left = minutes_left()
        show_toast("⏱ Time extended", f"Got {extra} more minutes!")
        log.info("Extended by %d minutes (%d left)", extra, left)
        return f"✅ Added {extra} min. Now <b>{left} min</b> remaining."

    # --- /timeleft ---
    if cmd == "/timeleft":
        if not state.get("session_start"):
            return f"No active timer. {PC_NAME} has been on for {get_uptime()}."
        left = minutes_left()
        if left <= 0:
            return "⏰ Time is already up!"
        return f"⏳ <b>{left} minutes</b> remaining."

    # --- /shutdown ---
    if cmd == "/shutdown":
        shutdown_pc()
        log.info("Remote shutdown requested")
        return ("🔴 Shutting down in 30 seconds.\n"
                "He sees a warning on screen. /cancelshutdown to abort.")

    # --- /cancelshutdown ---
    if cmd in ("/cancelshutdown", "/cancel"):
        cancel_shutdown()
        return "Shutdown cancelled."

    # --- /lock ---
    if cmd == "/lock":
        lock_screen()
        log.info("Remote lock requested")
        return "🔒 Screen locked."

    # --- /status ---
    if cmd == "/status":
        left = minutes_left() if state.get("session_start") else None
        hb = state.get("last_heartbeat", "never")
        lines = [
            f"🖥 <b>{PC_NAME} is ON</b>",
            f"⏱ Uptime: {get_uptime()}",
        ]
        if left is not None:
            lines.append(f"⏳ Time left: {left} min")
        else:
            lines.append("⏳ No timer active")
        lines.append(f"💓 Last heartbeat: {hb}")
        return "\n".join(lines)

    # --- /msg <text> ---
    if cmd == "/msg":
        if len(parts) < 2:
            return "Usage: /msg &lt;text&gt;\nExample: /msg Come to dinner!"
        message = text.split(None, 1)[1]
        show_popup("📢 Message from parent", message)
        log.info("Message shown: %s", message)
        return f"📢 Message shown on screen: {message}"

    # --- /history ---
    if cmd == "/history":
        today = datetime.date.today().isoformat()
        entries = []
        try:
            with open(LOG_PATH, encoding="utf-8") as f:
                for line in f:
                    if line.startswith(today):
                        entries.append(line.strip())
        except Exception:
            pass
        if not entries:
            return "No log entries for today."
        return "<pre>" + "\n".join(entries[-20:]) + "</pre>"

    return None  # not a recognized command — ignore


# ---------------------------------------------------------------------------
# Background loops
# ---------------------------------------------------------------------------

def timer_loop():
    """Check the play-time countdown every 30 seconds."""
    while True:
        try:
            if state.get("session_start"):
                left = minutes_left()

                # 5-minute warning
                if 0 < left <= WARNING_MINUTES and not state.get("warned"):
                    state["warned"] = True
                    save_state()
                    show_toast("⚠️ Time almost up!",
                               f"{left} minutes left. Save your progress!")
                    tg_send(f"⚠️ <b>{left} minutes left</b> on {PC_NAME}.")
                    log.info("Warning sent: %d min left", left)

                # Time's up
                if left <= 0 and not state.get("expired_notified"):
                    state["expired_notified"] = True
                    save_state()
                    show_toast("⏰ Time is up!",
                               "Your time is over. PC may shut down soon.")
                    show_popup("⏰ Time is up!",
                               "Your playing time is over.\nThe PC may shut down soon.")
                    tg_send(
                        f"⏰ <b>Time is up on {PC_NAME}!</b>\n"
                        f"Use /shutdown to turn off, or /extend &lt;min&gt; to add more."
                    )
                    log.info("Time expired")
        except Exception as exc:
            log.error("Timer loop error: %s", exc)

        time.sleep(30)


def heartbeat_loop():
    """Record a heartbeat every N minutes so restarts can detect a gap."""
    while True:
        state["last_heartbeat"] = datetime.datetime.now().isoformat()
        save_state()
        time.sleep(HEARTBEAT_INTERVAL * 60)


def poll_loop():
    """Poll Telegram for incoming commands (long-polling)."""
    offset = state.get("last_update_id", 0)

    while True:
        try:
            updates = tg_get_updates(offset)
            for update in updates:
                offset = update["update_id"] + 1
                state["last_update_id"] = offset

                msg = update.get("message", {})
                text = msg.get("text", "")
                chat_id = str(msg.get("chat", {}).get("id", ""))

                # Only respond to the parent's chat
                if chat_id != str(CHAT_ID):
                    continue

                if text.startswith("/"):
                    reply = handle_command(text)
                    if reply:
                        tg_send(reply)

            save_state()
        except Exception as exc:
            log.error("Poll loop error: %s", exc)
            time.sleep(5)


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

def main():
    if not BOT_TOKEN or not CHAT_ID:
        print("=" * 50)
        print("ERROR: bot_token and chat_id are not set.")
        print(f"Edit this file: {CONFIG_PATH}")
        print("See README.md for setup instructions.")
        print("=" * 50)
        sys.exit(1)

    log.info("=== PC Guard started ===")

    # Load previous state and check for restart gap
    load_state()
    if state.get("last_heartbeat"):
        try:
            last_hb = datetime.datetime.fromisoformat(state["last_heartbeat"])
            gap_seconds = (datetime.datetime.now() - last_hb).total_seconds()
            if gap_seconds > HEARTBEAT_INTERVAL * 60 * 2:
                gap_min = int(gap_seconds / 60)
                tg_send(
                    f"⚠️ <b>PC Guard was offline for ~{gap_min} minutes!</b>\n"
                    f"It may have been stopped or the PC was off."
                )
                log.warning("Was offline for %d minutes", gap_min)
        except Exception:
            pass

    # Record boot time
    state["boot_time"] = datetime.datetime.now().isoformat()
    # Clear any previous session timer on fresh boot
    state["session_start"] = None
    state["allowed_minutes"] = 0
    state["warned"] = False
    state["expired_notified"] = False
    save_state()

    # Send boot notification
    now = datetime.datetime.now().strftime("%H:%M")
    tg_send(
        f"🟢 <b>{PC_NAME} turned on</b> at {now}\n"
        f"Use /allow &lt;minutes&gt; to grant play time."
    )
    log.info("Boot notification sent")

    # Start background threads
    threading.Thread(target=timer_loop, daemon=True, name="timer").start()
    threading.Thread(target=heartbeat_loop, daemon=True, name="heartbeat").start()

    log.info("Entering Telegram poll loop")
    poll_loop()


if __name__ == "__main__":
    main()
