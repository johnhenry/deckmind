use crate::actions::SemanticAction;
use crate::config::SafetyMode;
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::fs;
use std::io::Write;
use std::path::PathBuf;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MemoryEntry {
    pub timestamp: DateTime<Utc>,
    pub session_id: String,
    pub action: String,
    pub summary: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct MemoryStore {
    pub entries: Vec<MemoryEntry>,
    pub active_goals: Vec<String>,
    pub inferred_tasks: Vec<String>,
}

pub struct StorageManager {
    base_path: PathBuf,
    memory: MemoryStore,
    log_file: Option<fs::File>,
}

impl StorageManager {
    pub fn new() -> Result<Self, Box<dyn std::error::Error>> {
        let base_path = dirs::home_dir()
            .unwrap_or_else(|| PathBuf::from("."))
            .join(".deckmind");

        fs::create_dir_all(&base_path)?;

        let memory_path = base_path.join("memory.json");
        let memory = if memory_path.exists() {
            let content = fs::read_to_string(&memory_path)?;
            serde_json::from_str(&content).unwrap_or_default()
        } else {
            MemoryStore::default()
        };

        let log_path = base_path.join("session.log");
        let log_file = fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open(&log_path)
            .ok();

        Ok(StorageManager {
            base_path,
            memory,
            log_file,
        })
    }

    pub fn log_action(&mut self, session_id: &str, action: &SemanticAction, safety_mode: &SafetyMode) {
        let entry = MemoryEntry {
            timestamp: Utc::now(),
            session_id: session_id.to_string(),
            action: action.label().to_string(),
            summary: None,
        };

        self.memory.entries.push(entry.clone());

        // Keep last 1000 entries
        if self.memory.entries.len() > 1000 {
            self.memory.entries = self.memory.entries.split_off(self.memory.entries.len() - 1000);
        }

        let _ = self.save_memory();

        if let Some(ref mut log) = self.log_file {
            let _ = writeln!(
                log,
                "[{}] session={} action={} mode={:?}",
                entry.timestamp.to_rfc3339(),
                session_id,
                action.label(),
                safety_mode,
            );
        }
    }

    fn save_memory(&self) -> Result<(), Box<dyn std::error::Error>> {
        let path = self.base_path.join("memory.json");
        let json = serde_json::to_string_pretty(&self.memory)?;
        fs::write(&path, json)?;
        Ok(())
    }

    pub fn get_recent_entries(&self, count: usize) -> Vec<&MemoryEntry> {
        self.memory
            .entries
            .iter()
            .rev()
            .take(count)
            .collect()
    }
}
