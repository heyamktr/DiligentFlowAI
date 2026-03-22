from datetime import datetime, timedelta

def issue_token(agent_id: str, scopes: list[str]) -> dict:
    return {
        "agent_id": agent_id,
        "scopes": scopes,
        "expires_at": (datetime.utcnow() + timedelta(minutes=30)).isoformat()
    }
