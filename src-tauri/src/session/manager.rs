use super::process::{ClaudeProcess, PtyWriter};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Emitter};
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionInfo {
    pub id: String,
    pub name: String,
    pub working_dir: Option<String>,
    pub created_at: DateTime<Utc>,
    pub is_active: bool,
    pub is_busy: bool,
}

struct Session {
    info: SessionInfo,
    process: ClaudeProcess,
    /// The claude CLI path used to launch this session.
    /// Stored so the frontend can re-invoke claude after it exits
    /// (the shell stays alive, just type the command again).
    claude_path: String,
    /// Extra CLI flags passed at session creation (e.g. --worktree --model opus).
    /// Stored so restarts include the same flags.
    launch_flags: String,
}

pub struct SessionManager {
    sessions: HashMap<String, Session>,
    active_session_id: Option<String>,
}

impl SessionManager {
    pub fn new() -> Self {
        SessionManager {
            sessions: HashMap::new(),
            active_session_id: None,
        }
    }

    /// Create a new session by spawning a shell with Claude running inside it.
    pub async fn create_session(
        &mut self,
        name: Option<String>,
        working_dir: Option<String>,
        claude_path: &str,
        extra_flags: Option<String>,
        app_handle: &AppHandle,
    ) -> Result<SessionInfo, Box<dyn std::error::Error>> {
        let id = Uuid::new_v4().to_string();
        let session_name = name.unwrap_or_else(|| format!("Session {}", self.sessions.len() + 1));

        let info = SessionInfo {
            id: id.clone(),
            name: session_name,
            working_dir: working_dir.clone(),
            created_at: Utc::now(),
            is_active: true,
            is_busy: false,
        };

        let flags = extra_flags.unwrap_or_default();
        let process = ClaudeProcess::spawn(
            claude_path,
            working_dir.as_deref(),
            &flags,
            id.clone(),
            app_handle.clone(),
        )?;

        let session = Session {
            info: info.clone(),
            process,
            claude_path: claude_path.to_string(),
            launch_flags: flags,
        };

        self.sessions.insert(id.clone(), session);
        self.active_session_id = Some(id);

        Ok(info)
    }

    pub async fn close_session(
        &mut self,
        session_id: &str,
    ) -> Result<(), Box<dyn std::error::Error>> {
        if let Some(mut session) = self.sessions.remove(session_id) {
            session.process.kill();
        }
        if self.active_session_id.as_deref() == Some(session_id) {
            self.active_session_id = self.sessions.keys().next().cloned();
        }
        Ok(())
    }

    pub fn list_sessions(&self) -> Vec<SessionInfo> {
        self.sessions.values().map(|s| s.info.clone()).collect()
    }

    /// Get the claude CLI path for a session so the frontend can
    /// re-invoke claude after it exits (just types the command into the shell).
    pub fn get_claude_path(&self, session_id: &str) -> Result<String, Box<dyn std::error::Error>> {
        let session = self
            .sessions
            .get(session_id)
            .ok_or("Session not found")?;
        Ok(session.claude_path.clone())
    }

    /// Get the extra launch flags for a session so the frontend can
    /// include them when restarting claude.
    pub fn get_launch_flags(&self, session_id: &str) -> Result<String, Box<dyn std::error::Error>> {
        let session = self
            .sessions
            .get(session_id)
            .ok_or("Session not found")?;
        Ok(session.launch_flags.clone())
    }

    /// Get a clone of the writer Arc for a session.
    /// This lets callers do blocking writes off the async runtime via spawn_blocking.
    pub fn get_writer(&self, session_id: &str) -> Result<Arc<Mutex<PtyWriter>>, Box<dyn std::error::Error>> {
        let session = self
            .sessions
            .get(session_id)
            .ok_or("Session not found")?;
        Ok(session.process.pty_writer.clone())
    }

    pub async fn send_to_session(
        &mut self,
        session_id: &str,
        message: &str,
        app: &AppHandle,
    ) -> Result<(), Box<dyn std::error::Error>> {
        let session = self
            .sessions
            .get_mut(session_id)
            .ok_or("Session not found")?;

        session.info.is_busy = true;
        session.process.send(message)?;

        let _ = app.emit("session-message-sent", serde_json::json!({
            "session_id": session_id,
            "message": message,
        }));

        Ok(())
    }

    pub fn write_to_pty(
        &mut self,
        session_id: &str,
        data: &str,
    ) -> Result<(), Box<dyn std::error::Error>> {
        let session = self
            .sessions
            .get_mut(session_id)
            .ok_or("Session not found")?;

        session.process.send_raw(data.as_bytes())?;
        Ok(())
    }

    pub fn interrupt_session(
        &mut self,
        session_id: &str,
    ) -> Result<(), Box<dyn std::error::Error>> {
        let session = self
            .sessions
            .get_mut(session_id)
            .ok_or("Session not found")?;

        session.process.send_interrupt()?;
        session.info.is_busy = false;
        Ok(())
    }
}
