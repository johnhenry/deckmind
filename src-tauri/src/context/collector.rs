use serde::{Deserialize, Serialize};
use std::process::Command;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EnvironmentContext {
    pub cwd: String,
    pub git_branch: Option<String>,
    pub git_diff_summary: Option<String>,
    pub modified_files: Vec<String>,
    pub recent_commands: Vec<String>,
    pub last_exit_code: Option<i32>,
    pub running_processes: Vec<String>,
}

impl EnvironmentContext {
    pub fn to_prompt_string(&self) -> String {
        let mut parts = vec![format!("Directory: {}", self.cwd)];

        if let Some(ref branch) = self.git_branch {
            parts.push(format!("Git branch: {}", branch));
        }

        if !self.modified_files.is_empty() {
            parts.push(format!(
                "Modified files:\n{}",
                self.modified_files
                    .iter()
                    .map(|f| format!("  - {}", f))
                    .collect::<Vec<_>>()
                    .join("\n")
            ));
        }

        if let Some(ref diff) = self.git_diff_summary {
            parts.push(format!("Git diff summary:\n{}", diff));
        }

        if !self.recent_commands.is_empty() {
            parts.push(format!(
                "Recent commands:\n{}",
                self.recent_commands
                    .iter()
                    .map(|c| format!("  $ {}", c))
                    .collect::<Vec<_>>()
                    .join("\n")
            ));
        }

        if let Some(code) = self.last_exit_code {
            parts.push(format!("Last exit code: {}", code));
        }

        parts.join("\n\n")
    }
}

pub struct ContextCollector;

impl ContextCollector {
    pub async fn collect() -> EnvironmentContext {
        let cwd = std::env::current_dir()
            .map(|p| p.display().to_string())
            .unwrap_or_else(|_| "unknown".to_string());

        let git_branch = Self::run_command("git", &["rev-parse", "--abbrev-ref", "HEAD"]);
        let git_diff_summary = Self::run_command("git", &["diff", "--stat"]);

        let modified_files = Self::run_command("git", &["status", "--porcelain"])
            .map(|output| {
                output
                    .lines()
                    .map(|l| l.to_string())
                    .collect::<Vec<_>>()
            })
            .unwrap_or_default();

        let recent_commands = Self::get_recent_shell_history(20);

        EnvironmentContext {
            cwd,
            git_branch,
            git_diff_summary,
            modified_files,
            recent_commands,
            last_exit_code: None,
            running_processes: Vec::new(),
        }
    }

    fn run_command(cmd: &str, args: &[&str]) -> Option<String> {
        Command::new(cmd)
            .args(args)
            .output()
            .ok()
            .filter(|o| o.status.success())
            .map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string())
    }

    fn get_recent_shell_history(count: usize) -> Vec<String> {
        // Try zsh history first, then bash
        let history_file = dirs::home_dir()
            .map(|h| h.join(".zsh_history"))
            .filter(|p| p.exists())
            .or_else(|| {
                dirs::home_dir()
                    .map(|h| h.join(".bash_history"))
                    .filter(|p| p.exists())
            });

        if let Some(path) = history_file {
            if let Ok(content) = std::fs::read_to_string(&path) {
                return content
                    .lines()
                    .rev()
                    .take(count)
                    .map(|line| {
                        // Strip zsh history metadata (: timestamp:0;command)
                        if line.starts_with(": ") {
                            line.splitn(3, ';')
                                .nth(1)
                                .unwrap_or(line)
                                .to_string()
                        } else {
                            line.to_string()
                        }
                    })
                    .collect::<Vec<_>>()
                    .into_iter()
                    .rev()
                    .collect();
            }
        }

        Vec::new()
    }
}
