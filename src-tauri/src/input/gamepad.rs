use std::fs;
use std::io::Read;
use std::os::unix::io::AsRawFd;
use std::thread;
use std::time::Duration;
use tauri::{AppHandle, Emitter};

/// Steam Deck controller USB IDs (Valve, product 0x1205).
const VALVE_VENDOR: &str = "28DE";
const DECK_PRODUCT: &str = "1205";

/// HID report button bitmask — Steam Deck controller protocol.
/// Bytes 8-11 of the 64-byte input report, little-endian u32.
const BUTTONS: &[(u32, &str)] = &[
    (1 << 0,  "R2"),
    (1 << 1,  "L2"),
    (1 << 2,  "R1"),
    (1 << 3,  "L1"),
    (1 << 4,  "Y"),
    (1 << 5,  "B"),
    (1 << 6,  "X"),
    (1 << 7,  "A"),
    (1 << 8,  "DPadUp"),
    (1 << 9,  "DPadRight"),
    (1 << 10, "DPadLeft"),
    (1 << 11, "DPadDown"),
    (1 << 12, "Select"),
    (1 << 13, "Steam"),
    (1 << 14, "Start"),
    (1 << 15, "L5"),
    (1 << 16, "R5"),
    (1 << 17, "LeftPadClick"),
    (1 << 18, "RightPadClick"),
    (1 << 22, "L3"),
    (1 << 26, "R3"),
];

/// Scan /sys/class/hidraw/ to find the hidraw device for the Steam Deck controller,
/// then verify it streams 64-byte reports. Returns the device path (e.g. "/dev/hidraw2").
fn find_deck_hidraw() -> Option<String> {
    let entries = fs::read_dir("/sys/class/hidraw/").ok()?;

    for entry in entries.flatten() {
        let name = entry.file_name().to_string_lossy().to_string();
        if !name.starts_with("hidraw") {
            continue;
        }

        // Read the uevent file to match vendor/product
        let uevent_path = entry.path().join("device").join("uevent");
        if let Ok(content) = fs::read_to_string(&uevent_path) {
            let has_vendor = content.contains(VALVE_VENDOR);
            let has_product = content.contains(DECK_PRODUCT);
            if !has_vendor || !has_product {
                continue;
            }

            let dev_path = format!("/dev/{}", name);

            // Try to open and read — the active device streams data
            if let Ok(file) = fs::OpenOptions::new().read(true).open(&dev_path) {
                // Set non-blocking for the probe
                unsafe {
                    let fd = file.as_raw_fd();
                    let flags = libc::fcntl(fd, libc::F_GETFL);
                    libc::fcntl(fd, libc::F_SETFL, flags | libc::O_NONBLOCK);
                }

                // Give it a moment to produce data
                thread::sleep(Duration::from_millis(50));

                let mut buf = [0u8; 64];
                let mut reader = std::io::BufReader::new(file);
                if reader.read(&mut buf).unwrap_or(0) == 64 {
                    log::info!("Steam Deck controller found at {}", dev_path);
                    return Some(dev_path);
                }
            }
        }
    }

    None
}

/// Spawn a background thread that reads the Steam Deck controller via hidraw
/// and emits Tauri events to the frontend.
///
/// The Steam Deck's controller is managed by Steam Input, which grabs exclusive
/// access to evdev — so gilrs/SDL/evdev see nothing in Desktop Mode. But the
/// raw HID reports on hidraw are still readable.
///
/// Emits:
/// - `gamepad-button` with `{ button: String, pressed: bool }`
/// - `gamepad-connected` with `{ name: String }`
///
/// Graceful fallback: if no Steam Deck controller is found, logs a warning
/// and returns without crashing.
pub fn start_gamepad_thread(app_handle: AppHandle) {
    thread::spawn(move || {
        let dev_path = match find_deck_hidraw() {
            Some(p) => p,
            None => {
                log::warn!(
                    "No Steam Deck controller found on hidraw. \
                     Gamepad support disabled."
                );
                return;
            }
        };

        let mut file = match fs::File::open(&dev_path) {
            Ok(f) => f,
            Err(e) => {
                log::warn!("Failed to open {}: {}. Gamepad disabled.", dev_path, e);
                return;
            }
        };

        // Set blocking mode for the polling loop
        unsafe {
            let fd = file.as_raw_fd();
            let flags = libc::fcntl(fd, libc::F_GETFL);
            libc::fcntl(fd, libc::F_SETFL, flags & !libc::O_NONBLOCK);
        }

        let _ = app_handle.emit(
            "gamepad-connected",
            serde_json::json!({ "name": "Steam Deck Controller" }),
        );

        let mut prev_buttons: u32 = 0;
        let mut buf = [0u8; 64];

        loop {
            match file.read_exact(&mut buf) {
                Ok(()) => {
                    // Button state is bytes 8-11, little-endian u32
                    let buttons = u32::from_le_bytes([buf[8], buf[9], buf[10], buf[11]]);
                    let diff = buttons ^ prev_buttons;

                    if diff != 0 {
                        for &(mask, name) in BUTTONS {
                            if diff & mask != 0 {
                                let pressed = buttons & mask != 0;
                                let _ = app_handle.emit(
                                    "gamepad-button",
                                    serde_json::json!({
                                        "button": name,
                                        "pressed": pressed,
                                    }),
                                );
                            }
                        }
                        prev_buttons = buttons;
                    }
                }
                Err(e) => {
                    log::warn!("Hidraw read error: {}. Gamepad thread exiting.", e);
                    let _ = app_handle.emit(
                        "gamepad-disconnected",
                        serde_json::json!({ "name": "Steam Deck Controller" }),
                    );
                    break;
                }
            }
        }
    });
}
