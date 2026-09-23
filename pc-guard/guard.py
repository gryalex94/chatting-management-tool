"""
PC Guard - Parental time-limit tool with Telegram control.

Runs as a background process (no window, no tray icon), started by Windows
Task Scheduler as SYSTEM so the child cannot stop it.
Parent controls everything through a Telegram bot.

Commands:
  /allow <minutes>     - Grant play time (e.g. /allow 60)
  /timeleft            - Check remaining minutes
  /extend <minutes>    - Add more time to current session
  /stoptimer           - Stop the timer (no limit, screen stops locking)
  /shutdown            - Shut down PC (30-second warning on screen)
  /cancelshutdown      - Cancel a pending shutdown
  /lock                - Lock the screen immediately
  /status              - PC uptime, timer info, heartbeat
  /msg <text>          - Show a message on his screen
  /history             - Today's log entries
  /start               - Show all commands

When time runs out the screen is locked automatically (and locked again every
time he signs back in) until the parent adds time. This works without
internet too - Telegram is only needed to receive new commands.
"""

import configparser
import ctypes
import datetime
import html
import json
import logging
import logging.handlers
import math
import os
import pathlib
import re
import subprocess
import sys
import threading
import time

import requests

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------

SCRIPT_DIR = pathlib.Path(__file__).resolve().parent

# Private files (bot token, timer state, log) live in the "data" subfolder,
# which the installer locks so only administrators and SYSTEM can open it.
# When testing by hand from the download folder, config.ini sits next to
# guard.py instead.
DATA_DIR = SCRIPT_DIR / "data"
if not (DATA_DIR / "config.ini").exists():
    DATA_DIR = SCRIPT_DIR

CONFIG_PATH = DATA_DIR / "config.ini"
LOG_PATH = DATA_DIR / "guard.log"
STATE_PATH = DATA_DIR / "state.json"

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

config = configparser.ConfigParser()
config.read(CONFIG_PATH)


def _setting(section: str, key: str, fallback: str = "") -> str:
    """Read a text setting; an unfilled 'PASTE_...' placeholder counts as empty."""
    value = config.get(section, key, fallback=fallback).strip()
    return "" if value.upper().startswith("PASTE_") else value


BOT_TOKEN = _setting("telegram", "bot_token")
CHAT_ID = _setting("telegram", "chat_id")
# Telegram user ids allowed to send commands (optional, comma-separated)
ALLOWED_USER_IDS = {
    part.strip() for part in _setting("telegram", "allowed_user_ids").split(",")
    if part.strip()
}

HEARTBEAT_INTERVAL = config.getint("settings", "heartbeat_minutes", fallback=5)
WARNING_MINUTES = config.getint("settings", "warning_minutes", fallback=5)
PC_NAME = config.get("settings", "pc_name", fallback="PC")
# Your time zone as hours from UTC. Used instead of the PC's own time zone
# setting, which a standard user is allowed to change.
UTC_OFFSET_HOURS = config.getfloat("settings", "utc_offset_hours", fallback=0.0)
# The timer is cleared once a day, at this hour (so not at midnight, when
# he might still be up).
DAY_START_HOUR = config.getint("settings", "new_day_starts_at_hour", fallback=4)
# What happens when time is up: "lock" (sign-in screen, his programs keep
# running) or "logoff" (signs him out; unsaved work is lost).
TIME_UP_ACTION = config.get("settings", "time_up_action", fallback="lock").strip().lower()
if TIME_UP_ACTION not in ("lock", "logoff"):
    TIME_UP_ACTION = "lock"

PARENT_TZ = datetime.timezone(datetime.timedelta(hours=UTC_OFFSET_HOURS))
API_BASE = f"https://api.telegram.org/bot{BOT_TOKEN}"

TICK_SECONDS = 5            # how often the timer checks
MAX_TICK_SECONDS = 30       # a longer gap means the PC was asleep - not play time
LOCK_GRACE_SECONDS = 60     # time to save the game after "time is up"
LONG_OUTAGE_MINUTES = 30    # tell the parent when Telegram was unreachable this long

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------


def redact(text: str) -> str:
    """Remove the bot token from any text before it is written anywhere."""
    if BOT_TOKEN:
        secret = BOT_TOKEN.split(":", 1)[-1]
        for piece in (BOT_TOKEN, secret):
            if len(piece) >= 8:
                text = text.replace(piece, "<bot-token>")
    return text


def _log_clock(seconds: float) -> time.struct_time:
    """Log timestamps use the parent's time zone, not the PC's setting."""
    return time.gmtime(seconds + UTC_OFFSET_HOURS * 3600)


class SafeFormatter(logging.Formatter):
    """Every log line goes through here: parent's time zone, token removed."""
    converter = staticmethod(_log_clock)

    def format(self, record):
        return redact(super().format(record))


class RepeatFilter(logging.Filter):
    """Skip a warning/error if the same line was already logged in the last 10 min.

    Stops the log filling up when, for example, the internet is down.
    """

    def __init__(self, window_seconds: int = 600):
        super().__init__()
        self.window = window_seconds
        self.last_seen = {}
        self.lock = threading.Lock()

    def filter(self, record):
        if record.levelno < logging.WARNING:
            return True
        # Ignore memory addresses like "at 0x0000021F" that differ every time
        key = (record.levelno, re.sub(r"0x[0-9A-Fa-f]+", "", record.getMessage()))
        now = time.monotonic()
        with self.lock:
            last = self.last_seen.get(key)
            if last is not None and now - last < self.window:
                return False
            if len(self.last_seen) > 500:
                self.last_seen.clear()
            self.last_seen[key] = now
        return True


_formatter = SafeFormatter("%(asctime)s  %(levelname)s  %(message)s",
                           datefmt="%Y-%m-%d %H:%M:%S")
_repeat_filter = RepeatFilter()
_handlers = [logging.handlers.RotatingFileHandler(
    LOG_PATH, maxBytes=1_000_000, backupCount=2, encoding="utf-8")]
# Also log to the console when running by hand (useful for first-time setup)
if sys.stderr is not None and sys.stderr.isatty():
    _handlers.append(logging.StreamHandler())
for _handler in _handlers:
    _handler.setFormatter(_formatter)
    _handler.addFilter(_repeat_filter)
logging.basicConfig(level=logging.INFO, handlers=_handlers)
log = logging.getLogger("guard")

# ---------------------------------------------------------------------------
# State (persisted to state.json so a restart doesn't reset the timer)
# ---------------------------------------------------------------------------

state_lock = threading.RLock()
state = {
    "day": None,              # which day the timer belongs to (see today_str)
    "session_active": False,  # True after /allow
    "allowed_minutes": 0,
    "used_seconds": 0.0,      # play time used so far in this session
    "warned": False,
    "expired": False,         # time ran out: the screen is kept locked
    "boot_time": None,        # UTC
    "last_heartbeat": None,   # UTC
    "last_update_id": 0,
}


def save_state():
    """Write state.json safely (a half-written file can never be left behind)."""
    with state_lock:
        tmp = STATE_PATH.with_suffix(".tmp")
        try:
            tmp.write_text(json.dumps(state, indent=2), encoding="utf-8")
            os.replace(tmp, STATE_PATH)
        except Exception as exc:
            log.error("Could not save state: %s", exc)


def load_state():
    if not STATE_PATH.exists():
        return
    try:
        saved = json.loads(STATE_PATH.read_text(encoding="utf-8"))
    except Exception as exc:
        log.warning("Could not read state.json (%s) - starting fresh", exc)
        return
    with state_lock:
        for key in state:
            if key in saved:
                state[key] = saved[key]


def start_new_day():
    """Clear the timer for a new day."""
    with state_lock:
        state["day"] = today_str()
        state["session_active"] = False
        state["allowed_minutes"] = 0
        state["used_seconds"] = 0.0
        state["warned"] = False
        state["expired"] = False

# ---------------------------------------------------------------------------
# Time helpers (never trust the PC's time zone setting)
# ---------------------------------------------------------------------------


def utc_now() -> datetime.datetime:
    return datetime.datetime.now(datetime.timezone.utc)


def parent_now() -> datetime.datetime:
    return datetime.datetime.now(PARENT_TZ)


def today_str() -> str:
    """The current 'day' for the timer. A new day starts at DAY_START_HOUR."""
    return (parent_now() - datetime.timedelta(hours=DAY_START_HOUR)).date().isoformat()


def seconds_left() -> float:
    return state["allowed_minutes"] * 60 - state["used_seconds"]


def minutes_left() -> int:
    if not state.get("session_active"):
        return 0
    return max(0, math.ceil(seconds_left() / 60))

# ---------------------------------------------------------------------------
# Telegram helpers
# ---------------------------------------------------------------------------


def tg_send(text: str, parse_mode: str = "HTML") -> bool:
    """Send a message to the parent on Telegram. Returns True if it arrived."""
    try:
        resp = requests.post(
            f"{API_BASE}/sendMessage",
            json={"chat_id": CHAT_ID, "text": text, "parse_mode": parse_mode},
            timeout=15,
        )
        data = resp.json()
    except Exception as exc:
        log.warning("Telegram send failed (%s)", type(exc).__name__)
        return False
    if not data.get("ok"):
        log.warning("Telegram send failed: %s", data.get("description"))
        return False
    return True


def tg_send_later(text: str):
    """Send in the background, so a slow or missing internet never holds up the timer."""
    threading.Thread(target=tg_send, args=(text,), daemon=True).start()


def tg_get_updates(offset: int = 0):
    """Long-poll for new Telegram messages.

    Returns (list_of_updates, "") on success or (None, "what went wrong").
    """
    try:
        resp = requests.get(
            f"{API_BASE}/getUpdates",
            params={"offset": offset, "timeout": 10},
            timeout=20,
        )
        data = resp.json()
    except Exception as exc:
        return None, f"no connection ({type(exc).__name__})"
    if data.get("ok"):
        return data.get("result", []), ""
    return None, f"{data.get('error_code')} {data.get('description')}"


def tg_delete_webhook() -> bool:
    """Switch the bot back to normal message reading (removes any webhook)."""
    try:
        resp = requests.post(f"{API_BASE}/deleteWebhook", timeout=15)
        return bool(resp.json().get("ok"))
    except Exception as exc:
        log.warning("deleteWebhook failed (%s)", type(exc).__name__)
        return False

# ---------------------------------------------------------------------------
# Windows helpers
#
# PC Guard runs as SYSTEM in the background "session 0", which has no screen.
# To reach the child's screen we use the Windows Terminal Services API
# (the same one the built-in "msg" command uses): it can show a message box
# on, lock, or sign out the session of whoever is sitting at the PC.
# ---------------------------------------------------------------------------

IS_WINDOWS = os.name == "nt"
NO_SESSION = 0xFFFFFFFF
WTS_ACTIVE = 0            # session is connected to the screen
WTS_USER_NAME = 5
WTS_CONNECT_STATE = 8
MB_ICONWARNING = 0x30
MB_ICONINFORMATION = 0x40
MB_SETFOREGROUND = 0x10000
MB_TOPMOST = 0x40000

if IS_WINDOWS:
    from ctypes import wintypes

    _kernel32 = ctypes.WinDLL("kernel32", use_last_error=True)
    _user32 = ctypes.WinDLL("user32", use_last_error=True)
    _wtsapi32 = ctypes.WinDLL("wtsapi32", use_last_error=True)

    _kernel32.WTSGetActiveConsoleSessionId.restype = wintypes.DWORD
    _kernel32.GetTickCount64.restype = ctypes.c_ulonglong

    _wtsapi32.WTSQuerySessionInformationW.argtypes = [
        wintypes.HANDLE, wintypes.DWORD, ctypes.c_int,
        ctypes.POINTER(ctypes.c_void_p), ctypes.POINTER(wintypes.DWORD)]
    _wtsapi32.WTSQuerySessionInformationW.restype = wintypes.BOOL
    _wtsapi32.WTSFreeMemory.argtypes = [ctypes.c_void_p]
    _wtsapi32.WTSFreeMemory.restype = None
    _wtsapi32.WTSSendMessageW.argtypes = [
        wintypes.HANDLE, wintypes.DWORD, wintypes.LPWSTR, wintypes.DWORD,
        wintypes.LPWSTR, wintypes.DWORD, wintypes.DWORD, wintypes.DWORD,
        ctypes.POINTER(wintypes.DWORD), wintypes.BOOL]
    _wtsapi32.WTSSendMessageW.restype = wintypes.BOOL
    _wtsapi32.WTSDisconnectSession.argtypes = [wintypes.HANDLE, wintypes.DWORD, wintypes.BOOL]
    _wtsapi32.WTSDisconnectSession.restype = wintypes.BOOL
    _wtsapi32.WTSLogoffSession.argtypes = [wintypes.HANDLE, wintypes.DWORD, wintypes.BOOL]
    _wtsapi32.WTSLogoffSession.restype = wintypes.BOOL


def _session_info(session_id: int, info_class: int):
    buf = ctypes.c_void_p()
    size = wintypes.DWORD()
    if not _wtsapi32.WTSQuerySessionInformationW(
            None, session_id, info_class, ctypes.byref(buf), ctypes.byref(size)):
        return None
    try:
        if info_class == WTS_USER_NAME:
            return ctypes.wstring_at(buf.value)
        return ctypes.cast(buf, ctypes.POINTER(ctypes.c_int)).contents.value
    finally:
        _wtsapi32.WTSFreeMemory(buf)


def console_session():
    """Who is at the screen: (session_id, user_name, is_active), or None if nobody."""
    if not IS_WINDOWS:
        return None
    session_id = _kernel32.WTSGetActiveConsoleSessionId()
    if session_id == NO_SESSION:
        return None
    user = _session_info(session_id, WTS_USER_NAME)
    if not user:
        return None  # only the sign-in screen is showing
    return session_id, user, _session_info(session_id, WTS_CONNECT_STATE) == WTS_ACTIVE


def notify_user(title: str, message: str, timeout: int = 0, warning: bool = False) -> bool:
    """Show a message box on the child's screen. Never blocks, never raises.

    timeout = seconds before it closes by itself (0 = stays until clicked).
    """
    try:
        info = console_session()
        if not info:
            return False
        style = (MB_ICONWARNING if warning else MB_ICONINFORMATION) | MB_TOPMOST | MB_SETFOREGROUND
        response = wintypes.DWORD()
        ok = _wtsapi32.WTSSendMessageW(
            None, info[0],
            title, len(title.encode("utf-16-le")),
            message, len(message.encode("utf-16-le")),
            style, timeout, ctypes.byref(response), False)
        if not ok:
            log.warning("Could not show message on screen (error %s)", ctypes.get_last_error())
        return bool(ok)
    except Exception as exc:
        log.warning("Could not show message on screen: %s", exc)
        return False


def lock_screen() -> bool:
    """Send the PC to the sign-in screen. His programs keep running."""
    if not IS_WINDOWS:
        return False
    try:
        info = console_session()
        if info and _wtsapi32.WTSDisconnectSession(None, info[0], False):
            return True
        if info:
            log.warning("Could not lock the screen (error %s)", ctypes.get_last_error())
        # Fallback that works when guard.py is started by hand in his session
        return bool(_user32.LockWorkStation())
    except Exception as exc:
        log.warning("Could not lock the screen: %s", exc)
        return False


def logoff_user() -> bool:
    """Sign out whoever is at the screen (unsaved work is lost)."""
    try:
        info = console_session()
        if not info:
            return False
        if _wtsapi32.WTSLogoffSession(None, info[0], False):
            return True
        log.warning("Could not sign out (error %s)", ctypes.get_last_error())
    except Exception as exc:
        log.warning("Could not sign out: %s", exc)
    return False


def enforce_time_up():
    """Time is up: lock (or sign out) whoever is using the PC. Works offline."""
    info = console_session()
    if not info or not info[2]:
        return  # nobody is using the PC right now
    user = info[1]
    if TIME_UP_ACTION == "logoff":
        done = logoff_user() or lock_screen()
    else:
        done = lock_screen() or logoff_user()
    if done:
        log.info("Time is up - %s %s", "signed out" if TIME_UP_ACTION == "logoff"
                 else "locked the screen for", user)
    else:
        log.error("Time is up but PC Guard could not lock the screen or sign out")


def _windows_tool(name: str) -> str:
    return os.path.join(os.environ.get("SystemRoot", r"C:\Windows"), "System32", name)


def shutdown_pc():
    subprocess.run(
        [_windows_tool("shutdown.exe"), "/s", "/t", "30", "/c",
         "PC will shut down in 30 seconds. Save your work!"],
        creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
    )


def cancel_shutdown():
    subprocess.run([_windows_tool("shutdown.exe"), "/a"],
                   creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))


def get_uptime() -> str:
    """How long Windows has been running (not affected by clock changes)."""
    seconds = _kernel32.GetTickCount64() // 1000 if IS_WINDOWS else int(time.monotonic())
    hours, remainder = divmod(int(seconds), 3600)
    minutes, _ = divmod(remainder, 60)
    return f"{hours}h {minutes}m"

# ---------------------------------------------------------------------------
# Command handlers
# ---------------------------------------------------------------------------

HELP_TEXT = (
    "🛡 <b>PC Guard</b>\n\n"
    "/allow &lt;minutes&gt; — Grant play time\n"
    "/timeleft — Remaining time\n"
    "/extend &lt;minutes&gt; — Add more time\n"
    "/stoptimer — Stop the timer (no limit)\n"
    "/shutdown — Shut down PC (30 s warning)\n"
    "/cancelshutdown — Cancel pending shutdown\n"
    "/lock — Lock screen now\n"
    "/status — PC info &amp; uptime\n"
    "/msg &lt;text&gt; — Show a message on screen\n"
    "/history — Today's log"
)

TIME_UP_REPLY = ("⏰ Time is up — the screen is kept locked.\n"
                 "/extend &lt;min&gt; to add time, /stoptimer to remove the limit.")


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

        state["day"] = today_str()
        state["session_active"] = True
        state["allowed_minutes"] = mins
        state["used_seconds"] = 0.0
        state["warned"] = False
        state["expired"] = False
        save_state()

        notify_user("⏱ Time granted",
                    f"You have {mins} minutes. A warning comes "
                    f"{WARNING_MINUTES} min before the end.", timeout=30)
        log.info("Allowed %d minutes", mins)
        return (f"✅ Granted <b>{mins} minutes</b>. Timer started.\n"
                f"Warning at {WARNING_MINUTES} min left.")

    # --- /extend <minutes> ---
    if cmd == "/extend":
        if not state.get("session_active"):
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
        state["expired"] = seconds_left() <= 0
        save_state()

        left = minutes_left()
        notify_user("⏱ Time extended", f"Got {extra} more minutes!", timeout=30)
        log.info("Extended by %d minutes (%d left)", extra, left)
        return f"✅ Added {extra} min. Now <b>{left} min</b> remaining."

    # --- /stoptimer ---
    if cmd == "/stoptimer":
        start_new_day()
        save_state()
        log.info("Timer stopped by parent")
        return "⏹ Timer stopped. No time limit now — the screen won't lock."

    # --- /timeleft ---
    if cmd == "/timeleft":
        if not state.get("session_active"):
            return f"No active timer. {PC_NAME} has been on for {get_uptime()}."
        if state.get("expired"):
            return TIME_UP_REPLY
        return f"⏳ <b>{minutes_left()} minutes</b> remaining."

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
        if not console_session():
            return "Nobody is signed in on the PC right now."
        log.info("Remote lock requested")
        if lock_screen():
            return "🔒 Screen locked."
        return "⚠️ Could not lock the screen. Try /shutdown."

    # --- /status ---
    if cmd == "/status":
        hb = state.get("last_heartbeat") or "never"
        try:
            hb = datetime.datetime.fromisoformat(hb).astimezone(PARENT_TZ).strftime("%H:%M")
        except (TypeError, ValueError):
            pass
        info = console_session()
        lines = [
            f"🖥 <b>{PC_NAME} is ON</b>",
            f"⏱ Uptime: {get_uptime()}",
            f"👤 Signed in: {html.escape(info[1]) if info else 'nobody'}",
        ]
        if not state.get("session_active"):
            lines.append("⏳ No timer active")
        elif state.get("expired"):
            lines.append("⏰ Time is up — screen kept locked")
        else:
            lines.append(f"⏳ Time left: {minutes_left()} min")
        lines.append(f"💓 Last heartbeat: {hb}")
        return "\n".join(lines)

    # --- /msg <text> ---
    if cmd == "/msg":
        if len(parts) < 2:
            return "Usage: /msg &lt;text&gt;\nExample: /msg Come to dinner!"
        message = text.split(None, 1)[1]
        shown = notify_user("📢 Message from parent", message)
        log.info("Message %s: %s", "shown" if shown else "NOT shown", message)
        if not shown:
            return "⚠️ Could not show the message (is anyone signed in?)."
        return f"📢 Message shown on screen: {html.escape(message)}"

    # --- /history ---
    if cmd == "/history":
        today = parent_now().date().isoformat()
        entries = []
        try:
            with open(LOG_PATH, encoding="utf-8", errors="replace") as f:
                for line in f:
                    if line.startswith(today):
                        entries.append(line.strip())
        except Exception:
            pass
        if not entries:
            return "No log entries for today."
        return "<pre>" + html.escape("\n".join(entries[-20:])) + "</pre>"

    return None  # not a recognized command — ignore


def is_allowed_sender(msg: dict) -> bool:
    """Only the parent may give commands.

    The message must come from the configured chat. If allowed_user_ids is set,
    the sender must be one of those people; otherwise it must be a private chat
    with the parent (so a group can't be used by everyone in it).
    """
    chat = msg.get("chat") or {}
    sender_id = str((msg.get("from") or {}).get("id", ""))
    if str(chat.get("id", "")) != CHAT_ID:
        return False
    if ALLOWED_USER_IDS:
        return sender_id in ALLOWED_USER_IDS
    return chat.get("type") == "private" and sender_id == CHAT_ID

# ---------------------------------------------------------------------------
# Background loops
# ---------------------------------------------------------------------------


def timer_tick(elapsed: float):
    """Add play time, and send the warning / time's-up messages when due."""
    warn_left = None
    time_up = False
    with state_lock:
        if state["day"] != today_str():
            if state["session_active"]:
                log.info("New day - timer cleared")
            start_new_day()
            save_state()
        if state["session_active"] and not state["expired"]:
            state["used_seconds"] += elapsed
            left = seconds_left()
            if left <= 0:
                state["expired"] = True
                time_up = True
            elif left <= WARNING_MINUTES * 60 and not state["warned"]:
                state["warned"] = True
                warn_left = minutes_left()
            save_state()

    # Messages come after the state is saved, and can never stop the lock.
    if warn_left is not None:
        notify_user("⚠️ Time almost up!",
                    f"{warn_left} minutes left. Save your progress!",
                    timeout=60, warning=True)
        tg_send_later(f"⚠️ <b>{warn_left} minutes left</b> on {PC_NAME}.")
        log.info("Warning sent: %d min left", warn_left)

    if time_up:
        action = "sign you out" if TIME_UP_ACTION == "logoff" else "lock the screen"
        notify_user("⏰ Time is up!",
                    f"Your playing time is over.\nIn 1 minute PC Guard will {action}. "
                    "Save your game now!", warning=True)
        tg_send_later(
            f"⏰ <b>Time is up on {PC_NAME}!</b>\n"
            f"The screen locks in 1 minute, and locks again every time he signs in, "
            f"until you send /extend &lt;min&gt;, /allow &lt;min&gt; or /stoptimer.\n"
            f"/shutdown turns the PC off."
        )
        log.info("Time expired")


def timer_loop():
    """Count play time and enforce the limit. Needs no internet."""
    last = time.monotonic()
    lock_at = None  # when the grace minute after "time is up" ends
    while True:
        time.sleep(TICK_SECONDS)
        now = time.monotonic()
        # Measure real elapsed time, not the wall clock (which can be changed).
        # A long gap means the PC was asleep - that isn't play time.
        elapsed = min(max(now - last, 0.0), MAX_TICK_SECONDS)
        last = now

        try:
            timer_tick(elapsed)
        except Exception as exc:
            log.error("Timer error: %s", exc)

        try:
            with state_lock:
                time_is_up = state["session_active"] and state["expired"]
            if time_is_up:
                if lock_at is None:
                    lock_at = now + LOCK_GRACE_SECONDS
                if now >= lock_at:
                    enforce_time_up()
            else:
                lock_at = None
        except Exception as exc:
            log.error("Could not enforce time limit: %s", exc)


def heartbeat_loop():
    """Record a heartbeat every N minutes so restarts can detect a gap."""
    while True:
        with state_lock:
            state["last_heartbeat"] = utc_now().isoformat()
            save_state()
        time.sleep(HEARTBEAT_INTERVAL * 60)


def poll_loop():
    """Poll Telegram for incoming commands (long-polling)."""
    offset = state.get("last_update_id", 0)
    backoff = 0                 # seconds to wait after a failed poll
    outage_start = None         # when Telegram stopped answering
    webhook_removed = False     # someone had switched the bot to a webhook
    other_reader = False        # someone else is reading the bot's messages
    last_takeover_alert = -3600.0

    while True:
        updates, error = tg_get_updates(offset)

        if updates is None:
            if outage_start is None:
                outage_start = time.monotonic()
            log.warning("Telegram poll failed: %s", error)
            lowered = error.lower()
            if "webhook" in lowered:
                # Someone with the bot token set a webhook, which silently
                # stops us from receiving commands. Take control back.
                if tg_delete_webhook():
                    webhook_removed = True
                    log.warning("A webhook had been set on the bot - removed it")
            elif "other getupdates" in lowered:
                other_reader = True
            elif lowered.startswith("401"):
                log.error("Telegram rejected the bot token - check bot_token in config.ini")
            # Wait longer after each failure: 10 s, 20 s, 40 s ... up to 5 min
            backoff = 10 if backoff == 0 else min(backoff * 2, 300)
            time.sleep(backoff)
            continue

        # Connected. If we were cut off, tell the parent what happened.
        if outage_start is not None:
            outage_min = int((time.monotonic() - outage_start) / 60)
            log.info("Telegram connection back after ~%d min", outage_min)
            reasons = []
            if webhook_removed:
                reasons.append(
                    "🚨 Someone had switched your bot to a 'webhook', which blocks "
                    "PC Guard. It has been switched back. This means someone else "
                    "has your bot token: in @BotFather use /revoke, then put the "
                    "new token in config.ini.")
            if other_reader:
                reasons.append(
                    "🚨 Another program was reading your bot's messages with the same "
                    "token. If that wasn't you, use /revoke in @BotFather and put "
                    "the new token in config.ini.")
            send = outage_min >= LONG_OUTAGE_MINUTES
            if reasons and time.monotonic() - last_takeover_alert >= 3600:
                send = True
                last_takeover_alert = time.monotonic()
            if send:
                tg_send(f"⚠️ <b>PC Guard on {PC_NAME} is back in contact</b> after "
                        f"~{outage_min} min without Telegram.\n" + "\n".join(reasons))
            outage_start = None
            webhook_removed = other_reader = False
        backoff = 0

        try:
            for update in updates:
                offset = update["update_id"] + 1
                msg = update.get("message") or {}
                text = msg.get("text", "")

                if not is_allowed_sender(msg):
                    if text.startswith("/"):
                        log.warning("Ignored a command from someone not allowed "
                                    "(user id %s)", (msg.get("from") or {}).get("id"))
                    continue

                if text.startswith("/"):
                    with state_lock:
                        reply = handle_command(text)
                    if reply:
                        tg_send(reply)

            if updates:
                with state_lock:
                    state["last_update_id"] = offset
                    save_state()
        except Exception as exc:
            log.error("Poll loop error: %s", exc)
            time.sleep(5)

# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------


def main():
    if not BOT_TOKEN or not CHAT_ID:
        log.error("bot_token and chat_id are not set in %s", CONFIG_PATH)
        print("=" * 50)
        print("ERROR: bot_token and chat_id are not set.")
        print(f"Edit this file: {CONFIG_PATH}")
        print("See README.md for setup instructions.")
        print("=" * 50)
        sys.exit(1)

    log.info("=== PC Guard started ===")
    if not config.has_option("settings", "utc_offset_hours"):
        log.warning("utc_offset_hours is not set in config.ini - using UTC")

    # Load previous state (the timer continues where it was, same day only)
    load_state()
    gap_min = None
    with state_lock:
        try:
            last_hb = datetime.datetime.fromisoformat(state.get("last_heartbeat") or "")
            gap_seconds = (utc_now() - last_hb).total_seconds()
            if gap_seconds > HEARTBEAT_INTERVAL * 60 * 2:
                gap_min = int(gap_seconds / 60)
        except (TypeError, ValueError):
            pass  # no heartbeat yet, or saved by an older version
        if state.get("day") != today_str():
            start_new_day()
        state["boot_time"] = utc_now().isoformat()
        save_state()

    # Start the timer first: it must run even if Telegram can't be reached.
    threading.Thread(target=timer_loop, daemon=True, name="timer").start()
    threading.Thread(target=heartbeat_loop, daemon=True, name="heartbeat").start()

    if gap_min is not None:
        log.warning("Was offline for %d minutes", gap_min)
        tg_send(
            f"⚠️ <b>PC Guard was offline for ~{gap_min} minutes!</b>\n"
            f"It may have been stopped or the PC was off."
        )

    # Send boot notification
    lines = [f"🟢 <b>{PC_NAME} turned on</b> at {parent_now().strftime('%H:%M')}"]
    with state_lock:
        if not state["session_active"]:
            lines.append("Use /allow &lt;minutes&gt; to grant play time.")
        elif state["expired"]:
            lines.append("⏰ Today's time is already used up — the screen stays locked.")
        else:
            lines.append(f"⏳ Today's timer continues: {minutes_left()} min left.")
    if tg_send("\n".join(lines)):
        log.info("Boot notification sent")

    log.info("Entering Telegram poll loop")
    poll_loop()


if __name__ == "__main__":
    main()
