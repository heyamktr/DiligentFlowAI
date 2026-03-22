from app.permissions.openfga_client import check_permission
from app.vault.token_service import issue_token
from app.agents.email_agent import execute_email_task
from app.audit.logger import log_event

def run_task(input_text: str):
    agent_id = "email-agent"
    action = "send"
    resource = "gmail-api"

    log_event("orchestrator", f"Received task: {input_text}")

    allowed = check_permission(agent_id, action, resource)
    if not allowed:
        log_event("permission", "Denied")
        return {"status": "denied"}

    token = issue_token(agent_id, [f"{action}:{resource}"])
    log_event("vault", "Token issued")

    result = execute_email_task(input_text, token)
    log_event("agent", str(result))

    return {
        "status": "completed",
        "result": result
    }
