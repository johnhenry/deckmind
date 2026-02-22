mod actions;
mod config;
mod context;
mod input;
mod session;
mod storage;
mod voice;

use config::AppConfig;
use session::SessionManager;
use storage::StorageManager;
use voice::VoiceEngine;
use std::sync::Arc;
use tokio::sync::Mutex;

pub struct AppState {
    pub session_manager: Arc<Mutex<SessionManager>>,
    pub config: Arc<Mutex<AppConfig>>,
    pub storage: Arc<Mutex<StorageManager>>,
    pub voice_engine: Arc<Mutex<VoiceEngine>>,
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    env_logger::init();

    let config = AppConfig::load().unwrap_or_default();
    let storage = StorageManager::new().expect("Failed to initialize storage");
    let session_manager = SessionManager::new();
    let voice_engine = VoiceEngine::new(&config.whisper_model);

    let app_state = AppState {
        session_manager: Arc::new(Mutex::new(session_manager)),
        config: Arc::new(Mutex::new(config)),
        storage: Arc::new(Mutex::new(storage)),
        voice_engine: Arc::new(Mutex::new(voice_engine)),
    };

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .manage(app_state)
        .invoke_handler(tauri::generate_handler![
            commands::create_session,
            commands::close_session,
            commands::list_sessions,
            commands::send_action,
            commands::send_message,
            commands::interrupt_session,
            commands::get_context,
            commands::get_config,
            commands::update_config,
            commands::get_safety_mode,
            commands::set_safety_mode,
            commands::start_voice_recording,
            commands::stop_voice_recording,
            commands::pty_write,
            commands::pty_write_bytes,
            commands::build_action_prompt,
            commands::get_claude_path,
        ])
        .setup(|app| {
            log::info!("DeckMind initialized");

            // Ensure model directory exists
            let model_dir = dirs::home_dir()
                .unwrap_or_else(|| std::path::PathBuf::from("."))
                .join(".deckmind")
                .join("models");
            let _ = std::fs::create_dir_all(&model_dir);

            let _ = app.handle();
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running DeckMind");
}

mod commands {
    use super::AppState;
    use crate::actions::{SemanticAction, ActionRouter};
    use crate::config::SafetyMode;
    use crate::context::ContextCollector;
    use crate::session::SessionInfo;
    use tauri::Emitter;

    #[tauri::command]
    pub async fn create_session(
        app: tauri::AppHandle,
        state: tauri::State<'_, AppState>,
        name: Option<String>,
        working_dir: Option<String>,
    ) -> Result<SessionInfo, String> {
        let mut manager = state.session_manager.lock().await;
        let config = state.config.lock().await;
        let claude_path = config.claude_path.clone();
        drop(config);
        manager
            .create_session(name, working_dir, &claude_path, &app)
            .await
            .map_err(|e| e.to_string())
    }

    #[tauri::command]
    pub async fn close_session(
        state: tauri::State<'_, AppState>,
        session_id: String,
    ) -> Result<(), String> {
        let mut manager = state.session_manager.lock().await;
        manager
            .close_session(&session_id)
            .await
            .map_err(|e| e.to_string())
    }

    #[tauri::command]
    pub async fn list_sessions(
        state: tauri::State<'_, AppState>,
    ) -> Result<Vec<SessionInfo>, String> {
        let manager = state.session_manager.lock().await;
        Ok(manager.list_sessions())
    }

    #[tauri::command]
    pub async fn send_action(
        app: tauri::AppHandle,
        state: tauri::State<'_, AppState>,
        session_id: String,
        action: SemanticAction,
    ) -> Result<(), String> {
        let config = state.config.lock().await;
        let safety_mode = config.safety_mode.clone();
        drop(config);

        let context = ContextCollector::collect().await;
        let prompt = ActionRouter::build_prompt(&action, &context);

        // Get writer Arc, drop the manager lock, then do blocking write
        let writer = {
            let manager = state.session_manager.lock().await;
            manager.get_writer(&session_id).map_err(|e| e.to_string())?
        };

        let prompt_clone = prompt.clone();
        tokio::task::spawn_blocking(move || {
            let mut w = writer.lock().map_err(|e| e.to_string())?;
            let mut data = prompt_clone.as_bytes().to_vec();
            data.push(b'\r');
            w.write(&data).map_err(|e| e.to_string())
        })
        .await
        .map_err(|e| e.to_string())??;

        let _ = app.emit("session-message-sent", serde_json::json!({
            "session_id": session_id,
            "message": prompt,
        }));

        let mut storage = state.storage.lock().await;
        storage.log_action(&session_id, &action, &safety_mode);

        Ok(())
    }

    #[tauri::command]
    pub async fn send_message(
        app: tauri::AppHandle,
        state: tauri::State<'_, AppState>,
        session_id: String,
        message: String,
    ) -> Result<(), String> {
        // Get writer Arc, drop the manager lock, then do blocking write
        let writer = {
            let manager = state.session_manager.lock().await;
            manager.get_writer(&session_id).map_err(|e| e.to_string())?
        };

        let msg = message.clone();
        tokio::task::spawn_blocking(move || {
            let mut w = writer.lock().map_err(|e| e.to_string())?;
            let mut data = msg.as_bytes().to_vec();
            data.push(b'\r');
            w.write(&data).map_err(|e| e.to_string())
        })
        .await
        .map_err(|e| e.to_string())??;

        let _ = app.emit("session-message-sent", serde_json::json!({
            "session_id": session_id,
            "message": message,
        }));

        Ok(())
    }

    #[tauri::command]
    pub async fn interrupt_session(
        state: tauri::State<'_, AppState>,
        session_id: String,
    ) -> Result<(), String> {
        // Get writer Arc, then drop the async lock immediately
        let writer = {
            let manager = state.session_manager.lock().await;
            manager.get_writer(&session_id).map_err(|e| e.to_string())?
        };

        // Send Ctrl+C on a blocking thread
        tokio::task::spawn_blocking(move || {
            let mut w = writer.lock().map_err(|e| e.to_string())?;
            w.write(&[0x03]).map_err(|e| e.to_string())
        })
        .await
        .map_err(|e| e.to_string())?
    }

    #[tauri::command]
    pub async fn get_context() -> Result<crate::context::EnvironmentContext, String> {
        Ok(ContextCollector::collect().await)
    }

    #[tauri::command]
    pub async fn get_config(
        state: tauri::State<'_, AppState>,
    ) -> Result<crate::config::AppConfig, String> {
        let config = state.config.lock().await;
        Ok(config.clone())
    }

    #[tauri::command]
    pub async fn update_config(
        state: tauri::State<'_, AppState>,
        new_config: crate::config::AppConfig,
    ) -> Result<(), String> {
        let mut config = state.config.lock().await;
        *config = new_config.clone();
        config.save().map_err(|e| e.to_string())
    }

    #[tauri::command]
    pub async fn get_safety_mode(
        state: tauri::State<'_, AppState>,
    ) -> Result<SafetyMode, String> {
        let config = state.config.lock().await;
        Ok(config.safety_mode.clone())
    }

    #[tauri::command]
    pub async fn set_safety_mode(
        state: tauri::State<'_, AppState>,
        mode: SafetyMode,
    ) -> Result<(), String> {
        let mut config = state.config.lock().await;
        config.safety_mode = mode;
        config.save().map_err(|e| e.to_string())
    }

    #[tauri::command]
    pub async fn start_voice_recording(
        state: tauri::State<'_, AppState>,
    ) -> Result<(), String> {
        let engine = state.voice_engine.lock().await;
        engine.start_recording()
    }

    #[tauri::command]
    pub async fn stop_voice_recording(
        state: tauri::State<'_, AppState>,
    ) -> Result<String, String> {
        let mut engine = state.voice_engine.lock().await;
        engine.stop_and_transcribe()
    }

    #[tauri::command]
    pub async fn pty_write(
        state: tauri::State<'_, AppState>,
        session_id: String,
        data: String,
    ) -> Result<(), String> {
        let writer = {
            let manager = state.session_manager.lock().await;
            manager.get_writer(&session_id).map_err(|e| e.to_string())?
        };

        tokio::task::spawn_blocking(move || {
            let mut w = writer.lock().map_err(|e| e.to_string())?;
            w.write(data.as_bytes()).map_err(|e| e.to_string())
        })
        .await
        .map_err(|e| e.to_string())?
    }

    /// Write raw bytes to the PTY via spawn_blocking.
    /// Takes a Vec<u8> (array of numbers from JS) to avoid JSON encoding issues.
    /// Runs on a blocking thread so PTY I/O doesn't stall the Tokio runtime.
    #[tauri::command]
    pub async fn pty_write_bytes(
        state: tauri::State<'_, AppState>,
        session_id: String,
        bytes: Vec<u8>,
    ) -> Result<(), String> {
        // Get writer Arc, then drop the async lock immediately
        let writer = {
            let manager = state.session_manager.lock().await;
            manager.get_writer(&session_id).map_err(|e| e.to_string())?
        };

        // Do blocking I/O on a dedicated thread, not the Tokio worker
        tokio::task::spawn_blocking(move || {
            let mut w = writer.lock().map_err(|e| e.to_string())?;
            log::info!("pty_write_bytes len={} bytes={:?}", bytes.len(), &bytes);
            w.write(&bytes).map_err(|e| e.to_string())
        })
        .await
        .map_err(|e| e.to_string())?
    }

    /// Get the claude CLI path for a session so the frontend can
    /// re-invoke claude by typing the command into the shell PTY.
    #[tauri::command]
    pub async fn get_claude_path(
        state: tauri::State<'_, AppState>,
        session_id: String,
    ) -> Result<String, String> {
        let manager = state.session_manager.lock().await;
        manager
            .get_claude_path(&session_id)
            .map_err(|e| e.to_string())
    }

    /// Build an action prompt and return it as a string (for placing in the
    /// text input) instead of writing directly to the PTY.
    #[tauri::command]
    pub async fn build_action_prompt(
        action: SemanticAction,
    ) -> Result<String, String> {
        let context = ContextCollector::collect().await;
        let prompt = ActionRouter::build_prompt(&action, &context);
        Ok(prompt)
    }
}
