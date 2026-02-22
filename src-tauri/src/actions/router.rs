use super::templates::SemanticAction;
use crate::context::EnvironmentContext;

pub struct ActionRouter;

impl ActionRouter {
    pub fn build_prompt(action: &SemanticAction, context: &EnvironmentContext) -> String {
        let template = action.template();
        let context_str = context.to_prompt_string();
        template.replace("{context}", &context_str)
    }
}
