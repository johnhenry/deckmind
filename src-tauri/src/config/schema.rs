use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SafetyMode {
    Observe,
    Suggest,
    Confirm,
    Auto,
}

impl Default for SafetyMode {
    fn default() -> Self {
        SafetyMode::Confirm
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct KeyBinding {
    pub key: String,
    pub modifiers: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ButtonMapping {
    pub action: String,
    pub keyboard: Option<KeyBinding>,
    pub gamepad: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppConfig {
    #[serde(default = "default_claude_path")]
    pub claude_path: String,

    #[serde(default)]
    pub safety_mode: SafetyMode,

    #[serde(default = "default_button_mappings")]
    pub button_mappings: Vec<ButtonMapping>,

    #[serde(default = "default_whisper_model")]
    pub whisper_model: String,

    #[serde(default)]
    pub default_working_dir: Option<String>,

    #[serde(default = "default_true")]
    pub voice_enabled: bool,

    #[serde(default = "default_theme")]
    pub theme: String,
}

fn default_claude_path() -> String {
    "claude".to_string()
}

fn default_whisper_model() -> String {
    "base.en".to_string()
}

fn default_true() -> bool {
    true
}

fn default_theme() -> String {
    "cyber".to_string()
}

fn default_button_mappings() -> Vec<ButtonMapping> {
    vec![
        ButtonMapping {
            action: "context".to_string(),
            keyboard: Some(KeyBinding {
                key: "1".to_string(),
                modifiers: vec!["Ctrl".to_string()],
            }),
            gamepad: Some("X".to_string()),
        },
        ButtonMapping {
            action: "explain".to_string(),
            keyboard: Some(KeyBinding {
                key: "2".to_string(),
                modifiers: vec!["Ctrl".to_string()],
            }),
            gamepad: Some("Y".to_string()),
        },
        ButtonMapping {
            action: "fix".to_string(),
            keyboard: Some(KeyBinding {
                key: "3".to_string(),
                modifiers: vec!["Ctrl".to_string()],
            }),
            gamepad: Some("A".to_string()),
        },
        ButtonMapping {
            action: "continue".to_string(),
            keyboard: Some(KeyBinding {
                key: "4".to_string(),
                modifiers: vec!["Ctrl".to_string()],
            }),
            gamepad: Some("B".to_string()),
        },
        ButtonMapping {
            action: "plan".to_string(),
            keyboard: Some(KeyBinding {
                key: "5".to_string(),
                modifiers: vec!["Ctrl".to_string()],
            }),
            gamepad: Some("L1".to_string()),
        },
        ButtonMapping {
            action: "summarize".to_string(),
            keyboard: Some(KeyBinding {
                key: "6".to_string(),
                modifiers: vec!["Ctrl".to_string()],
            }),
            gamepad: Some("R1".to_string()),
        },
        ButtonMapping {
            action: "interrupt".to_string(),
            keyboard: Some(KeyBinding {
                key: "Escape".to_string(),
                modifiers: vec![],
            }),
            gamepad: Some("Select".to_string()),
        },
        ButtonMapping {
            action: "voice".to_string(),
            keyboard: Some(KeyBinding {
                key: "Space".to_string(),
                modifiers: vec!["Ctrl".to_string()],
            }),
            gamepad: Some("R2".to_string()),
        },
    ]
}

impl Default for AppConfig {
    fn default() -> Self {
        AppConfig {
            claude_path: default_claude_path(),
            safety_mode: SafetyMode::default(),
            button_mappings: default_button_mappings(),
            whisper_model: default_whisper_model(),
            default_working_dir: None,
            voice_enabled: true,
            theme: default_theme(),
        }
    }
}

impl AppConfig {
    fn config_path() -> PathBuf {
        let base = dirs::home_dir().unwrap_or_else(|| PathBuf::from("."));
        base.join(".deckmind").join("config.yaml")
    }

    pub fn load() -> Result<Self, Box<dyn std::error::Error>> {
        let path = Self::config_path();
        if !path.exists() {
            let config = AppConfig::default();
            config.save()?;
            return Ok(config);
        }
        let content = fs::read_to_string(&path)?;
        let config: AppConfig = serde_yaml::from_str(&content)?;
        Ok(config)
    }

    pub fn save(&self) -> Result<(), Box<dyn std::error::Error>> {
        let path = Self::config_path();
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent)?;
        }
        let yaml = serde_yaml::to_string(self)?;
        fs::write(&path, yaml)?;
        Ok(())
    }
}
